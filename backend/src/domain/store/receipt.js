'use strict';
// Server-side PDF receipt (pdfkit, uncompressed so the text is easy to extract).
const PDFDocument = require('pdfkit');
const { formatPkr } = require('./pricing');

// The built-in Helvetica font only covers Latin-1; anything else is shown as "?" in the PDF only.
const pdfSafe = (s) => String(s).replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

function receiptPdf(payload, signature) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ compress: false, size: 'A5', margin: 36, info: { Title: `Receipt ${payload.order_id}` } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(16).text('NaSCon Store Receipt');
    doc.moveDown(0.5).font('Helvetica').fontSize(10);
    doc.text(`Order: ${pdfSafe(payload.order_id)}`);
    doc.text(`Customer: ${pdfSafe(payload.customer_id)}`);
    doc.text(`Paid at: ${payload.paid_at}`);
    doc.moveDown(0.5);
    for (const it of payload.items) {
      doc.text(`${pdfSafe(it.variant_id)} x ${it.quantity} @ ${formatPkr(it.unit_price_minor)}`);
    }
    doc.moveDown(0.5);
    doc.text(`Subtotal: ${formatPkr(payload.subtotal_minor)}`);
    doc.text(`Discount: ${formatPkr(payload.discount_minor)}`);
    doc.font('Helvetica-Bold').text(`Total: ${formatPkr(payload.total_minor)}`);
    doc.moveDown(0.5).font('Helvetica').fontSize(7).text(`Signature: ${signature}`);
    doc.end();
  });
}

module.exports = { receiptPdf, pdfSafe };
