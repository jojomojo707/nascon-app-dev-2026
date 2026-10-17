'use strict';
// Checkout request validation and order totals (spec 14). Money is integer paisa, currency PKR.
const { validation } = require('../../lib/errors');
const { isObject, isId, isInt } = require('../../lib/validate');

function validateCheckout(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = [];
  if (!isId(body.order_id)) f.push('order_id');
  if (typeof body.customer_id !== 'string' || body.customer_id.length < 1 || body.customer_id.length > 256) f.push('customer_id');
  const items = body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) f.push('items');
  else {
    const seen = new Set();
    items.forEach((it, i) => {
      if (!isObject(it) || !isId(it.variant_id) || seen.has(it.variant_id)) f.push(`items[${i}].variant_id`);
      else seen.add(it.variant_id);
      if (!isObject(it) || !isInt(it.quantity, 1, 10)) f.push(`items[${i}].quantity`);
    });
  }
  if (body.discount_code !== undefined && body.discount_code !== null && typeof body.discount_code !== 'string') f.push('discount_code');
  if (!isObject(body.payment) || typeof body.payment.token !== 'string') f.push('payment.token');
  if (f.length) throw validation(f);
}

// variants: Map(variant_id -> {price_minor}); percent: discount percent or 0.
function priceOrder(items, variants, percent) {
  const lines = items.map((it) => ({ variant_id: it.variant_id, quantity: it.quantity, unit_price_minor: variants.get(it.variant_id).price_minor }));
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price_minor, 0);
  const discount = Math.floor((subtotal * percent) / 100);
  return { lines, subtotal_minor: subtotal, discount_minor: discount, total_minor: subtotal - discount };
}

// 450000 -> "PKR 4500.00" (major units, two decimals, no thousands separator).
function formatPkr(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `PKR ${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

module.exports = { validateCheckout, priceOrder, formatPkr };
