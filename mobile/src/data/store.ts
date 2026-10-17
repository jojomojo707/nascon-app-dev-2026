// Cart (local SQLite), checkout through POST /api/v1/checkout, receipt PDF saved to app storage.
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { getDb, kvDelete, kvGet, kvSet, notifyChange } from "./db";
import { apiPost, ApiResult, routes } from "./api";
import { CheckoutResponse } from "./types";

export type CartLine = { variant_id: string; product_id: string; label: string; price_minor: number; quantity: number };
export type LocalOrder = { order_id: string; status: string; total_minor: number; paid_at: string | null; pdf_path: string | null; json: string };

export function listCart(): CartLine[] {
  return getDb().getAllSync<CartLine>("SELECT * FROM cart_lines ORDER BY label");
}

export function addToCart(line: Omit<CartLine, "quantity">, qty = 1): void {
  const d = getDb();
  const existing = d.getFirstSync<{ quantity: number }>("SELECT quantity FROM cart_lines WHERE variant_id = ?", [line.variant_id]);
  const q = Math.min(10, (existing?.quantity ?? 0) + qty);
  d.runSync("INSERT OR REPLACE INTO cart_lines (variant_id, product_id, label, price_minor, quantity) VALUES (?, ?, ?, ?, ?)", [
    line.variant_id,
    line.product_id,
    line.label,
    line.price_minor,
    q,
  ]);
  notifyChange();
}

export function setQuantity(variantId: string, qty: number): void {
  const d = getDb();
  if (qty <= 0) d.runSync("DELETE FROM cart_lines WHERE variant_id = ?", [variantId]);
  else d.runSync("UPDATE cart_lines SET quantity = ? WHERE variant_id = ?", [Math.min(10, qty), variantId]);
  notifyChange();
}

export function clearCart(): void {
  getDb().runSync("DELETE FROM cart_lines");
  kvDelete("pending_order_id");
  notifyChange();
}

/** Preview only; the server's numbers replace it after checkout. */
export function cartPreview(lines: CartLine[], discountCode: string) {
  const subtotal = lines.reduce((s, l) => s + l.price_minor * l.quantity, 0);
  const discount = discountCode.trim().toUpperCase() === "WELCOME10" ? Math.floor((subtotal * 10) / 100) : 0;
  return { subtotal, discount, total: subtotal - discount };
}

/** Reuse the same order_id on retry so a repeated request can never create a second order. */
export function pendingOrderId(): string {
  let id = kvGet("pending_order_id");
  if (!id) {
    id = "ord-" + Crypto.randomUUID();
    kvSet("pending_order_id", id);
  }
  return id;
}

export async function checkout(customerId: string, lines: CartLine[], discountCode: string, token: string): Promise<ApiResult<CheckoutResponse>> {
  const orderId = pendingOrderId();
  const body = {
    order_id: orderId,
    customer_id: customerId,
    items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
    discount_code: discountCode.trim() ? discountCode.trim().toUpperCase() : null,
    payment: { token },
  };
  const res = await apiPost<CheckoutResponse>(routes.checkout, body);
  if (res.ok) {
    const pdfPath = saveReceiptPdf(res.data.order_id, res.data.receipt?.pdf_base64);
    getDb().runSync(
      "INSERT OR REPLACE INTO orders_local (order_id, status, total_minor, paid_at, pdf_path, json) VALUES (?, ?, ?, ?, ?, ?)",
      [res.data.order_id, res.data.status, res.data.total_minor, res.data.receipt?.payload?.paid_at ?? null, pdfPath, JSON.stringify(res.data)],
    );
    clearCart();
  } else if (res.error.kind !== "offline" && res.error.kind !== "timeout") {
    // A definite answer (declined / out of stock): a new attempt gets a new order id.
    kvDelete("pending_order_id");
  }
  return res;
}

function saveReceiptPdf(orderId: string, base64: string | undefined): string | null {
  if (!base64) return null;
  try {
    const dir = new Directory(Paths.document, "receipts");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `${orderId}.pdf`);
    if (file.exists) file.delete();
    file.create();
    file.write(base64, { encoding: "base64" });
    return file.uri;
  } catch {
    return null;
  }
}

export function listOrders(): LocalOrder[] {
  return getDb().getAllSync<LocalOrder>("SELECT * FROM orders_local ORDER BY paid_at DESC");
}

export function getOrder(orderId: string): LocalOrder | null {
  return getDb().getFirstSync<LocalOrder>("SELECT * FROM orders_local WHERE order_id = ?", [orderId]) ?? null;
}
