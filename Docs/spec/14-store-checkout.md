# 14 — Merchandise Store: Checkout, Inventory, Receipts

Scope: `POST /audit/v1/checkout`, `GET /audit/v1/inventory/{variant_id}`, the mock payment gateway, concurrency guarantee (NFR-3), signed PDF receipt. Product-level store requirements (variants, scheduled price changes, order states, showcases) are FR-2.3 in [02-functional-and-nonfunctional-requirements.md](02-functional-and-nonfunctional-requirements.md). Seed product/variants/discount: [07-reset-seed-health.md](07-reset-seed-health.md). Receipt signing: [06-signature-hmac.md](06-signature-hmac.md).

## Grader scenario (NFR-3)
Grader calls `/reset` with `stock` for the variant, then fires **20 simultaneous checkout requests** (Python threads released together by a barrier), each with a **different `order_id`**, buying the last unit of `var-jersey-001-M`. **Exactly one must succeed.** After the burst: exactly one 201, nineteen 409, `stock = 0` (never negative), `reserved = 0`. The whole burst must finish within 10 s.

## POST /audit/v1/checkout — request
```json
{
  "order_id": "ord-001",
  "customer_id": "cust-001",
  "items": [ { "variant_id": "var-jersey-001-M", "quantity": 1 } ],
  "discount_code": null,
  "payment": { "token": "tok_success" }
}
```
- `order_id`: required, client-chosen, unique. Replay of an identical request → 200 with the stored result (no second reservation). Same id, different body → 409 `DUPLICATE_ORDER_ID`.
- `items`: 1–10 items, `quantity` integer 1..10, unique `variant_id`s. Unknown variant → 404 `VARIANT_NOT_FOUND`.
- `discount_code`: `null` or a code. Only `WELCOME10` is valid; unknown → 400 `INVALID_DISCOUNT_CODE`. `discount_minor = floor(subtotal_minor * 10 / 100)`.
- `payment.token` (mock gateway):
  - `tok_success` — authorize + capture succeed;
  - `tok_declined` — authorization fails;
  - `tok_capture_fail` — authorization succeeds, capture fails.
- Customer ids/strings with quotes or `<script>` must be stored/returned as plain data, never a 5xx ([15-rbac-security.md](15-rbac-security.md)).

## Processing order and guarantees
1. Validate (400) → variants exist (404) → discount code (400).
2. **Atomically reserve stock for all items.** If any item lacks stock, reserve nothing and return `409 OUT_OF_STOCK` with `details.variant_id`. Overselling or negative stock = NFR-3 failure.
3. Call the mock gateway.
   - `tok_declined` → release the reservation, return `402 PAYMENT_DECLINED`.
   - `tok_capture_fail` → void the authorization, release the reservation, return `402 PAYMENT_CAPTURE_FAILED`.
   - Released stock must be purchasable again.
4. On success: commit the reservation (stock decreases permanently), order status `paid`, generate the receipt.
5. Emit the order status-change **domain event to the internal queue** (not graded by script).

## Success response — 201 (200 on idempotent replay)
```json
{
  "order_id": "ord-001", "status": "paid", "currency": "PKR",
  "items": [ { "variant_id": "var-jersey-001-M", "quantity": 1, "unit_price_minor": 450000 } ],
  "subtotal_minor": 450000, "discount_minor": 0, "total_minor": 450000,
  "payment": { "authorization_id": "auth_1", "capture_id": "cap_1", "state": "captured" },
  "receipt": {
    "payload": { "order_id": "ord-001", "customer_id": "cust-001",
                 "items": [ { "variant_id": "var-jersey-001-M", "quantity": 1, "unit_price_minor": 450000 } ],
                 "subtotal_minor": 450000, "discount_minor": 0, "total_minor": 450000, "currency": "PKR",
                 "paid_at": "2026-10-17T11:20:05Z" },
    "signature": "<hex>",
    "pdf_base64": "<base64 of the PDF file>"
  }
}
```
- `receipt.signature` = HMAC recipe with `id = order_id` and canonical JSON of `receipt.payload` **exactly as returned**. Payload must be consistent with the order (totals add up).
- `receipt.pdf_base64` decodes to a valid PDF (starts with `%PDF`), generated server-side. Extracted text must contain the `order_id` and the total formatted as `PKR 4500.00` (major units, two decimals, no thousands separator).
- Out of stock → 409 with the standard error body. Declined → 402.

## GET /audit/v1/inventory/{variant_id}
```json
{ "variant_id": "var-jersey-001-M", "stock": 0, "reserved": 0 }
```
- `stock` = units still available for purchase.
- `reserved` = units held by in-flight checkouts; **must be 0 once all requests have returned**.
- Unknown variant → 404 `VARIANT_NOT_FOUND`.

## Order states (product-level, FR-2.3)
Pending, Paid, Packed, Shipped, Delivered, Cancelled, Refunded; each transition emits a structured domain event to the internal queue. Mock gateway must also simulate refund.
