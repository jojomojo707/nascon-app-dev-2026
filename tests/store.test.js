'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCheckout, priceOrder, formatPkr } = require('../backend/src/domain/store/pricing');
const gateway = require('../backend/src/domain/store/gateway');
const { receiptPdf, pdfSafe } = require('../backend/src/domain/store/receipt');
const { sign } = require('../backend/src/lib/signature');

const body = (o = {}) => ({ order_id: 'ord-001', customer_id: 'cust-001',
  items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }], discount_code: null, payment: { token: 'tok_success' }, ...o });
const fields = (b) => { try { validateCheckout(b); return null; } catch (e) { return e.details.fields; } };

// Extracts the text shown by TJ/Tj operators in an uncompressed PDF (hex or literal strings).
function pdfText(buf) {
  const s = buf.toString('latin1');
  const out = [];
  for (const m of s.matchAll(/\[(.*?)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
    if (m[1] !== undefined) {
      let line = '';
      for (const h of m[1].matchAll(/<([0-9a-fA-F]+)>|\(((?:\\.|[^\\)])*)\)/g)) {
        line += h[1] ? Buffer.from(h[1], 'hex').toString('latin1') : h[2];
      }
      out.push(line);
    } else if (m[2]) out.push(Buffer.from(m[2], 'hex').toString('latin1'));
    else out.push(m[3]);
  }
  return out.join('\n');
}

test('checkout validation', () => {
  assert.equal(fields(body()), null);
  assert.deepEqual(fields(body({ items: [] })), ['items']);
  assert.deepEqual(fields(body({ items: [{ variant_id: 'v', quantity: 11 }, { variant_id: 'v', quantity: 1 }] })),
    ['items[0].quantity', 'items[1].variant_id']);
  assert.deepEqual(fields(body({ order_id: 'a|b', payment: {} })), ['order_id', 'payment.token']);
  assert.deepEqual(fields(body({ discount_code: 5, customer_id: '' })), ['customer_id', 'discount_code']);
  assert.deepEqual(fields('x'), ['body']);
  assert.equal(fields(body({ customer_id: `Robert'); <script>alert(1)</script>` })), null);
});

test('pricing with WELCOME10 floors the discount', () => {
  const v = new Map([['a', { price_minor: 450000 }], ['b', { price_minor: 333 }]]);
  const p = priceOrder([{ variant_id: 'a', quantity: 2 }, { variant_id: 'b', quantity: 1 }], v, 10);
  assert.equal(p.subtotal_minor, 900333);
  assert.equal(p.discount_minor, 90033);
  assert.equal(p.total_minor, 810300);
  assert.deepEqual(p.lines[0], { variant_id: 'a', quantity: 2, unit_price_minor: 450000 });
  assert.equal(formatPkr(450000), 'PKR 4500.00');
  assert.equal(formatPkr(405005), 'PKR 4050.05');
  assert.equal(formatPkr(-5), 'PKR -0.05');
});

test('mock gateway tokens', () => {
  const a = gateway.authorize('tok_success', 100, 1);
  assert.deepEqual([a.ok, a.authorization_id], [true, 'auth_1']);
  assert.equal(gateway.capture('tok_success', a, 1).capture_id, 'cap_1');
  assert.equal(gateway.authorize('tok_declined', 100, 2).ok, false);
  assert.equal(gateway.authorize('tok_unknown', 100, 2).ok, false);
  const b = gateway.authorize('tok_capture_fail', 100, 3);
  assert.equal(b.ok, true);
  assert.equal(gateway.capture('tok_capture_fail', b, 3).ok, false);
  assert.equal(gateway.voidAuthorization(b).state, 'voided');
  assert.equal(gateway.refund({ capture_id: 'cap_1' }, 100).state, 'refunded');
});

test('signed PDF receipt contains the order id and the PKR total', async () => {
  const payload = { order_id: 'ord-001', customer_id: 'cüst "<x>"', items: [{ variant_id: 'var-jersey-001-M', quantity: 1, unit_price_minor: 450000 }],
    subtotal_minor: 450000, discount_minor: 0, total_minor: 450000, currency: 'PKR', paid_at: '2026-10-17T11:20:05Z' };
  const pdf = await receiptPdf(payload, sign('ord-001', payload, 'demo-salt'));
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  const text = pdfText(pdf);
  assert.ok(text.includes('ord-001'), text);
  assert.ok(text.includes('PKR 4500.00'), text);
  assert.equal(pdfSafe('a中b'), 'a?b');
});
