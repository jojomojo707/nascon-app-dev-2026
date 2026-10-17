'use strict';
// Concurrency-safe checkout (NFR-3). Stock is reserved with a conditional decrement inside one
// transaction (never read-then-write), released on payment failure, and committed on success.
const { pool, tx } = require('../../db/pool');
const { AppError, notFound, conflict } = require('../../lib/errors');
const { sign, bodyHash } = require('../../lib/signature');
const { nowTimestamp } = require('../../lib/time');
const queue = require('../../lib/queue');
const { validateCheckout, priceOrder } = require('./pricing');
const gateway = require('./gateway');
const { receiptPdf } = require('./receipt');

const outOfStock = (variantId) => conflict('OUT_OF_STOCK', `Variant ${variantId} has no stock left.`, { variant_id: variantId });

async function storedOrder(orderId) {
  const r = await pool.query('SELECT body_hash, status, response FROM orders WHERE order_id = $1', [orderId]);
  return r.rows[0] ?? null;
}

// Waits briefly for an in-flight checkout with the same order_id to finish.
async function waitForOrder(orderId) {
  for (let i = 0; i < 50; i++) {
    const o = await storedOrder(orderId);
    if (!o || o.status !== 'pending') return o;
    await new Promise((r) => setTimeout(r, 100));
  }
  return storedOrder(orderId);
}

async function releaseStock(lines) {
  await tx(async (c) => {
    for (const l of lines) {
      await c.query('UPDATE variants SET stock = stock + $2, reserved = reserved - $2 WHERE variant_id = $1', [l.variant_id, l.quantity]);
    }
  });
}

async function checkout(body) {
  validateCheckout(body);
  const hash = bodyHash(body);
  let existing = await waitForOrder(body.order_id);
  if (existing && existing.status === 'paid' && existing.body_hash === hash) return { status: 200, body: existing.response };

  const ids = body.items.map((i) => i.variant_id);
  const v = await pool.query('SELECT variant_id, price_minor FROM variants WHERE variant_id = ANY($1)', [ids]);
  const variants = new Map(v.rows.map((r) => [r.variant_id, r]));
  const missing = ids.find((id) => !variants.has(id));
  if (missing) throw notFound('VARIANT_NOT_FOUND', `Variant ${missing} does not exist.`, { variant_id: missing });

  let percent = 0;
  if (body.discount_code !== undefined && body.discount_code !== null) {
    const d = await pool.query('SELECT percent FROM discount_codes WHERE code = $1', [body.discount_code]);
    if (!d.rowCount) throw new AppError(400, 'INVALID_DISCOUNT_CODE', `Discount code ${body.discount_code} is not valid.`, { discount_code: body.discount_code });
    percent = d.rows[0].percent;
  }
  if (existing) throw conflict('DUPLICATE_ORDER_ID', `Order id ${body.order_id} was already used with a different body.`, { order_id: body.order_id });

  // Claim the order id; a concurrent identical request waits for this one's stored result.
  const claim = await pool.query("INSERT INTO orders (order_id, body_hash, status) VALUES ($1,$2,'pending') ON CONFLICT DO NOTHING", [body.order_id, hash]);
  if (!claim.rowCount) {
    existing = await waitForOrder(body.order_id);
    if (existing && existing.status === 'paid' && existing.body_hash === hash) return { status: 200, body: existing.response };
    throw conflict('DUPLICATE_ORDER_ID', `Order id ${body.order_id} was already used with a different body.`, { order_id: body.order_id });
  }

  const price = priceOrder(body.items, variants, percent);
  const sorted = [...price.lines].sort((a, b) => (a.variant_id < b.variant_id ? -1 : 1));
  try {
    try {
      await tx(async (c) => {
        for (const l of sorted) {
          const r = await c.query(
            'UPDATE variants SET stock = stock - $2, reserved = reserved + $2 WHERE variant_id = $1 AND stock >= $2',
            [l.variant_id, l.quantity]);
          if (!r.rowCount) throw outOfStock(l.variant_id);
        }
      });
    } catch (err) {
      await pool.query('DELETE FROM orders WHERE order_id = $1', [body.order_id]);
      throw err;
    }

    const seq = (await pool.query("SELECT nextval('payment_seq')::int AS n")).rows[0].n;
    const auth = gateway.authorize(body.payment.token, price.total_minor, seq);
    if (!auth.ok) {
      await releaseStock(price.lines);
      await pool.query('DELETE FROM orders WHERE order_id = $1', [body.order_id]);
      throw new AppError(402, 'PAYMENT_DECLINED', 'The payment was declined.', { order_id: body.order_id });
    }
    const cap = gateway.capture(body.payment.token, auth, seq);
    if (!cap.ok) {
      gateway.voidAuthorization(auth);
      await releaseStock(price.lines);
      await pool.query('DELETE FROM orders WHERE order_id = $1', [body.order_id]);
      throw new AppError(402, 'PAYMENT_CAPTURE_FAILED', 'The payment could not be captured.', { order_id: body.order_id });
    }

    const payload = {
      order_id: body.order_id, customer_id: body.customer_id, items: price.lines,
      subtotal_minor: price.subtotal_minor, discount_minor: price.discount_minor, total_minor: price.total_minor,
      currency: 'PKR', paid_at: nowTimestamp(),
    };
    const signature = sign(body.order_id, payload);
    const pdf = await receiptPdf(payload, signature);
    const response = {
      order_id: body.order_id, status: 'paid', currency: 'PKR', items: price.lines,
      subtotal_minor: price.subtotal_minor, discount_minor: price.discount_minor, total_minor: price.total_minor,
      payment: { authorization_id: auth.authorization_id, capture_id: cap.capture_id, state: 'captured' },
      receipt: { payload, signature, pdf_base64: pdf.toString('base64') },
    };
    await tx(async (c) => {
      for (const l of sorted) {
        await c.query('UPDATE variants SET reserved = reserved - $2 WHERE variant_id = $1', [l.variant_id, l.quantity]);
      }
      await c.query("UPDATE orders SET status = 'paid', response = $2, receipt_pdf = $3 WHERE order_id = $1", [body.order_id, response, pdf]);
    });
    queue.publish('order.status_changed', { order_id: body.order_id, from: 'pending', to: 'paid', at: payload.paid_at });
    return { status: 201, body: response };
  } catch (err) {
    if (!(err instanceof AppError)) await pool.query("DELETE FROM orders WHERE order_id = $1 AND status = 'pending'", [body.order_id]).catch(() => {});
    throw err;
  }
}

async function inventory(variantId) {
  const r = await pool.query('SELECT variant_id, stock, reserved FROM variants WHERE variant_id = $1', [variantId]);
  if (!r.rowCount) throw notFound('VARIANT_NOT_FOUND', `Variant ${variantId} does not exist.`, { variant_id: variantId });
  return r.rows[0];
}

async function receiptPdfFor(orderId) {
  const r = await pool.query("SELECT receipt_pdf FROM orders WHERE order_id = $1 AND status = 'paid'", [orderId]);
  return r.rows[0]?.receipt_pdf ?? null;
}

module.exports = { checkout, inventory, receiptPdfFor };
