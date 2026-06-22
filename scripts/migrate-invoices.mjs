#!/usr/bin/env node
/**
 * Candle Heaven — Courier Invoice Migration Script
 *
 * Migrates courier invoices from the old BizManager app:
 *   /artifacts/default-bizmanager-app/users/{userId}/courier_invoices
 *
 * To the new Candle Heaven settlements collection:
 *   /settlements
 *
 * Old orders' order numbers are stored in settlement.orderNumbers so they remain
 * visible in the UI ("Migrated orders: …") even when no new-system order matches.
 * Orders can be assigned to invoices manually via the order detail page later.
 *
 * Usage:
 *   node scripts/migrate-invoices.mjs <old-key.json> <new-key.json> [options]
 *
 *   --dry-run   print what would be written without actually writing
 *   --peek      print first 3 old invoices + first 3 old orders and exit
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , oldKeyPath, newKeyPath, ...flags] = process.argv;
const DRY_RUN = flags.includes('--dry-run');
const PEEK    = flags.includes('--peek');

if (!oldKeyPath || !newKeyPath) {
  console.error('Usage: node scripts/migrate-invoices.mjs <old-key.json> <new-key.json> [--dry-run] [--peek]');
  process.exit(1);
}

// ── Firebase init ─────────────────────────────────────────────────────────────

const oldKey = JSON.parse(readFileSync(resolve(oldKeyPath), 'utf8'));
const newKey = JSON.parse(readFileSync(resolve(newKeyPath), 'utf8'));

const oldApp = initializeApp({ credential: cert(oldKey) }, 'source');
const newApp = initializeApp({ credential: cert(newKey) }, 'target');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);
newDb.settings({ ignoreUndefinedProperties: true });

const OLD_USER_ID = 'naIP2ic8k2PArZQbbRcWvVBS2D52';
const userRef = oldDb
  .collection('artifacts')
  .doc('default-bizmanager-app')
  .collection('users')
  .doc(OLD_USER_ID);

// ── Helpers ───────────────────────────────────────────────────────────────────

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts._seconds) return new Date(ts._seconds * 1000);
  return new Date(ts);
}

function toIso(ts) {
  const d = tsToDate(ts);
  return d ? d.toISOString().slice(0, 10) : null;
}

// Safely serialise Firestore data (Timestamps, etc.) for console output
function safeJson(obj) {
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === 'object' && v._seconds != null) return `Timestamp(${new Date(v._seconds * 1000).toISOString()})`;
    if (v && typeof v.toDate === 'function') return `Timestamp(${v.toDate().toISOString()})`;
    return v;
  }, 2);
}

// ── Step 1: Load old courier invoices ─────────────────────────────────────────

console.log('Loading old courier invoices…');
const invoiceSnap = await userRef.collection('courier_invoices').get();

if (invoiceSnap.empty) {
  console.log('No courier invoices found in old database. Nothing to migrate.');
  process.exit(0);
}

console.log(`Found ${invoiceSnap.size} courier invoices.\n`);

// ── Peek mode: show raw document shape and exit ───────────────────────────────

if (PEEK) {
  console.log('=== SAMPLE INVOICES (first 3) ===');
  invoiceSnap.docs.slice(0, 3).forEach((d, i) => {
    console.log(`\n[Invoice ${i + 1}] id=${d.id}`);
    console.log(safeJson(d.data()));
  });

  console.log('\n=== SAMPLE ORDERS (first 3, checking for assignedInvoices) ===');
  try {
    const snap = await userRef.collection('orders').get();
    console.log(`Total old orders: ${snap.size}`);
    // Show first 3 that have assignedInvoices, otherwise first 3
    const withInv = snap.docs.filter(d => d.data().assignedInvoices?.length > 0).slice(0, 3);
    const sample = withInv.length > 0 ? withInv : snap.docs.slice(0, 3);
    sample.forEach((d, i) => {
      console.log(`\n[Order ${i + 1}] id=${d.id}`);
      const data = d.data();
      // Print only the key identifying fields + assignedInvoices
      console.log(safeJson({
        orderNumber: data.orderNumber,
        orderId: data.orderId,
        waybillNumber: data.waybillNumber,
        status: data.status,
        total: data.total,
        customer: data.customer?.name ?? data.customerName,
        assignedInvoices: data.assignedInvoices,
        // Show all top-level keys so we can see what fields exist
        _allKeys: Object.keys(data),
      }));
    });
  } catch (err) {
    console.warn('Could not load old orders:', err.message);
  }
  process.exit(0);
}

// ── Step 2: Load old orders (assignedInvoices map) ───────────────────────────

console.log('Loading old orders (resolving invoice-order links)…');
// invoiceId → [{ orderNumber, waybillNumber, amount }]
const oldOrdersByInvoiceId = new Map();

try {
  const oldOrdersSnap = await userRef.collection('orders').get();
  console.log(`Found ${oldOrdersSnap.size} old orders.`);

  for (const d of oldOrdersSnap.docs) {
    const data = d.data();
    const assignedInvoices = data.assignedInvoices ?? [];
    for (const inv of assignedInvoices) {
      if (!inv.invoiceId) continue;
      if (!oldOrdersByInvoiceId.has(inv.invoiceId)) oldOrdersByInvoiceId.set(inv.invoiceId, []);
      oldOrdersByInvoiceId.get(inv.invoiceId).push({
        // Try all possible ID fields in order of preference
        orderNumber: data.orderNumber ?? data.orderId ?? data.id ?? d.id,
        waybillNumber: data.waybillNumber ?? data.trackingNumber ?? null,
        amount: inv.amount ?? 0,
      });
    }
  }
} catch (err) {
  console.warn('Could not load old orders:', err.message);
}
console.log();

// ── Step 3: Load new orders for matching ─────────────────────────────────────

console.log('Loading new orders for matching…');
const newOrdersSnap = await newDb.collection('orders').get();
console.log(`Found ${newOrdersSnap.size} new orders.`);

// Build lookup maps by orderNumber AND waybillNumber
const newByOrderNumber = new Map();
const newByWaybill     = new Map();
for (const d of newOrdersSnap.docs) {
  const data = d.data();
  const rec = { id: d.id, deliveryFee: data.deliveryFee ?? 0, orderNumber: data.orderNumber };
  if (data.orderNumber) newByOrderNumber.set(data.orderNumber, rec);
  if (data.waybillNumber) newByWaybill.set(data.waybillNumber, rec);
}
console.log();

// ── Step 4: Check for duplicates ─────────────────────────────────────────────

const existingSnap = await newDb.collection('settlements')
  .where('type', '==', 'courier_invoice')
  .get();
const existingRefs = new Set(existingSnap.docs.map(d => d.data().reference));
console.log(`Existing courier invoices in new DB: ${existingSnap.size}\n`);

// ── Step 5: Migrate ───────────────────────────────────────────────────────────

let created = 0, skipped = 0, linked = 0, unmatched = 0;

for (const invoiceDoc of invoiceSnap.docs) {
  const inv = invoiceDoc.data();
  const invoiceNumber = inv.invoiceNumber ?? invoiceDoc.id;
  const date          = toIso(inv.timestamp) ?? inv.date ?? '';
  const receivedAmount = inv.receivedAmount ?? 0;
  const courierName   = inv.courierName ?? 'Royal Express';
  const isCompleted   = inv.isCompleted ?? false;

  if (existingRefs.has(invoiceNumber)) {
    console.log(`SKIP  ${invoiceNumber} — already exists`);
    skipped++;
    continue;
  }

  // Resolve old orders for this invoice
  const oldOrders = oldOrdersByInvoiceId.get(invoiceDoc.id) ?? [];
  const oldOrderNumbers = oldOrders.map(o => o.orderNumber);

  // Try to match each old order to a new-system order
  const matchedOrders = [];
  for (const oldOrder of oldOrders) {
    const matched =
      newByOrderNumber.get(oldOrder.orderNumber) ??
      (oldOrder.waybillNumber ? newByWaybill.get(oldOrder.waybillNumber) : null);

    if (matched) {
      matchedOrders.push({ orderId: matched.id, orderNumber: matched.orderNumber, actualShippingFee: oldOrder.amount });
      linked++;
    } else {
      unmatched++;
    }
  }

  const matchNote = matchedOrders.length > 0
    ? ` | linked ${matchedOrders.length}/${oldOrders.length} orders`
    : oldOrders.length > 0
    ? ` | ${oldOrders.length} old orders stored (no new-system match)`
    : '';

  console.log(`${DRY_RUN ? '[DRY] ' : ''}CREATE ${invoiceNumber} | ${date} | LKR ${receivedAmount}${matchNote}`);

  if (DRY_RUN) { created++; continue; }

  // The settlement stores old orderNumbers as legacy reference even if not matched
  const settlement = {
    type: 'courier_invoice',
    reference: invoiceNumber,
    date,
    totalAmount: receivedAmount,
    courierName,
    isCompleted,
    // Store old order numbers so they appear in the "Migrated orders:" UI line
    ...(oldOrderNumbers.length > 0 && { orderNumbers: oldOrderNumbers }),
    notes: `Migrated from BizManager (old ID: ${invoiceDoc.id})`,
    createdAt: tsToDate(inv.timestamp)?.toISOString() ?? new Date().toISOString(),
  };

  // Batch: create settlement + update any matched new orders
  const settlementRef = newDb.collection('settlements').doc();
  const batch = newDb.batch();
  batch.set(settlementRef, { ...settlement, id: settlementRef.id });

  for (const o of matchedOrders) {
    batch.update(newDb.collection('orders').doc(o.orderId), {
      courierInvoice: {
        invoiceId: settlementRef.id,
        invoiceNumber,
        actualShippingFee: o.actualShippingFee,
      },
    });
  }

  await batch.commit();
  created++;
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
console.log(`Migration ${DRY_RUN ? '(DRY RUN) ' : ''}complete:`);
console.log(`  Invoices created : ${created}`);
console.log(`  Invoices skipped : ${skipped}  (already existed)`);
console.log(`  Orders linked    : ${linked}  (matched to new system)`);
console.log(`  Orders stored    : ${unmatched}  (old numbers kept on settlement for reference)`);
if (DRY_RUN) {
  console.log('\nRun without --dry-run to apply changes.');
  console.log('Run with --peek to inspect the raw data structure first.');
}
