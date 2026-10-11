#!/usr/bin/env node
/**
 * Backfill cash / bank settlements for payments recorded before settlements
 * were created automatically.
 *
 * Historically adminRecordPayment() wrote paymentInfo onto the order only, so
 * the Settlements page "Cash & Bank" tab was always empty. This creates one
 * settlement per already-paid order and stamps paymentInfo.settlementId back
 * onto the order so the two stay linked.
 *
 * Skips orders that already have paymentInfo.settlementId, so it is safe to
 * re-run.
 *
 * Usage:
 *   node scripts/backfill-cash-bank-settlements.mjs <service-account.json> [--dry-run]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , keyPath, ...flags] = process.argv;
const DRY_RUN = flags.includes('--dry-run');

if (!keyPath) {
  console.error('Usage: node scripts/backfill-cash-bank-settlements.mjs <service-account.json> [--dry-run]');
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(keyPath), 'utf8'))) });
const db = getFirestore(app);

const snap = await db.collection('orders').get();

const candidates = [];
let alreadyLinked = 0;
let courierPaid = 0;

for (const d of snap.docs) {
  const order = d.data();
  const info = order.paymentInfo;
  if (!info) continue;
  if (info.method === 'courier_invoice') { courierPaid++; continue; }
  if (info.settlementId) { alreadyLinked++; continue; }
  candidates.push({ id: d.id, orderNumber: order.orderNumber ?? d.id, info });
}

console.log(`Orders scanned:              ${snap.size}`);
console.log(`Already linked (skipped):    ${alreadyLinked}`);
console.log(`Courier invoice (skipped):   ${courierPaid}`);
console.log(`Settlements to create:       ${candidates.length}\n`);

for (const c of candidates) {
  const amount = Number(c.info.amount ?? 0);
  console.log(`  ${c.orderNumber.padEnd(14)} ${String(c.info.method).padEnd(14)} ${c.info.date ?? '(no date)'}  LKR ${amount.toLocaleString('en-US')}`);
}

if (!candidates.length) {
  console.log('\nNothing to backfill.');
  process.exit(0);
}

if (DRY_RUN) {
  console.log('\n[DRY RUN] No changes written.');
  process.exit(0);
}

// 2 writes per order (settlement create + order update); Firestore caps at 500 per batch.
const BATCH_SIZE = 250;
let created = 0;

for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
  const chunk = candidates.slice(i, i + BATCH_SIZE);
  const batch = db.batch();

  for (const c of chunk) {
    const settlementRef = db.collection('settlements').doc();
    const settlement = {
      id: settlementRef.id,
      type: c.info.method,
      reference: c.info.reference ?? '',
      totalAmount: Number(c.info.amount ?? 0),
      date: c.info.date ?? new Date().toISOString().slice(0, 10),
      orderIds: [c.id],
      orderNumbers: [c.orderNumber],
      createdAt: new Date().toISOString(),
    };
    if (c.info.notes) settlement.notes = c.info.notes;

    batch.set(settlementRef, settlement);
    batch.update(db.collection('orders').doc(c.id), {
      'paymentInfo.settlementId': settlementRef.id,
    });
  }

  await batch.commit();
  created += chunk.length;
  console.log(`Committed ${created}/${candidates.length}`);
}

console.log(`\nDone. Created ${created} settlement${created === 1 ? '' : 's'}.`);
process.exit(0);
