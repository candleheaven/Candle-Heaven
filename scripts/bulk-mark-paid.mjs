#!/usr/bin/env node
/**
 * Bulk mark all orders as paid and assign them to a single courier invoice.
 *
 * Usage:
 *   node scripts/bulk-mark-paid.mjs <service-account.json> [--dry-run]
 *
 * Excludes: CH-MQOX0AJD-WUSK (and any already-paid orders, skipped silently)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const [, , keyPath, ...flags] = process.argv;
const DRY_RUN = flags.includes('--dry-run');

if (!keyPath) {
  console.error('Usage: node scripts/bulk-mark-paid.mjs <service-account.json> [--dry-run]');
  process.exit(1);
}

const EXCLUDE_ORDER_NUMBERS = new Set(['CH-MQOX0AJD-WUSK']);

const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(keyPath), 'utf8'))) }));
db.settings({ ignoreUndefinedProperties: true });

// ── Load orders ───────────────────────────────────────────────────────────────

const ordersSnap = await db.collection('orders').get();
const today = new Date().toISOString().slice(0, 10);

const toProcess = ordersSnap.docs.filter(d => {
  const data = d.data();
  if (EXCLUDE_ORDER_NUMBERS.has(data.orderNumber)) return false;
  if (data.paymentStatus === 'paid') return false;
  return true;
});

const excluded = ordersSnap.docs.filter(d => EXCLUDE_ORDER_NUMBERS.has(d.data().orderNumber));
const alreadyPaid = ordersSnap.docs.filter(d => d.data().paymentStatus === 'paid');

console.log(`Total orders:    ${ordersSnap.size}`);
console.log(`Already paid:    ${alreadyPaid.length} (skipped)`);
console.log(`Excluded:        ${excluded.map(d => d.data().orderNumber).join(', ') || 'none'}`);
console.log(`To mark as paid: ${toProcess.length}\n`);

if (toProcess.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}

// ── Create invoice ────────────────────────────────────────────────────────────

const invoiceData = {
  type: 'courier_invoice',
  reference: 'HISTORICAL-PAID',
  date: today,
  totalAmount: toProcess.reduce((s, d) => s + (d.data().total ?? 0), 0),
  courierName: 'Royal Express',
  isCompleted: true,
  notes: 'Bulk migration — all pre-existing orders marked as paid in full',
  createdAt: new Date().toISOString(),
  orderNumbers: toProcess.map(d => d.data().orderNumber).filter(Boolean),
};

console.log(`Invoice to create: ${invoiceData.reference}`);
console.log(`Total amount:      LKR ${invoiceData.totalAmount.toLocaleString()}`);
console.log(`Orders:            ${toProcess.length}\n`);

if (DRY_RUN) {
  console.log('[DRY RUN] No changes written.');
  process.exit(0);
}

// ── Write in batches (Firestore limit: 500 ops per batch) ─────────────────────

const invoiceRef = db.collection('settlements').doc();
const invoiceId  = invoiceRef.id;

// First batch: create the invoice
const firstBatch = db.batch();
firstBatch.set(invoiceRef, { ...invoiceData, id: invoiceId });
await firstBatch.commit();
console.log(`Created invoice: ${invoiceId}`);

// Remaining batches: update orders (2 writes per order: courierInvoice + payment)
const OPS_PER_ORDER = 2;
const BATCH_SIZE = Math.floor(500 / OPS_PER_ORDER); // 250 orders per batch

let processed = 0;
for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
  const chunk = toProcess.slice(i, i + BATCH_SIZE);
  const batch = db.batch();
  for (const d of chunk) {
    const data = d.data();
    const orderRef = db.collection('orders').doc(d.id);
    batch.update(orderRef, {
      courierInvoice: {
        invoiceId,
        invoiceNumber: invoiceData.reference,
        actualShippingFee: data.deliveryFee ?? 0,
      },
      paymentStatus: 'paid',
      paymentInfo: {
        method: 'courier_invoice',
        reference: invoiceData.reference,
        amount: data.total ?? 0,
        date: today,
        settlementId: invoiceId,
      },
    });
  }
  await batch.commit();
  processed += chunk.length;
  console.log(`  Updated ${processed}/${toProcess.length} orders…`);
}

console.log(`\nDone. ${processed} orders marked as paid and linked to invoice ${invoiceId}.`);
