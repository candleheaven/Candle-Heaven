#!/usr/bin/env node
/**
 * Candle Heaven — Firebase Migration Script (v2)
 *
 * Migrates from old BizManager app structure:
 *   /artifacts/default-bizmanager-app/users/{userId}/
 *     → products, orders, inventory
 *
 * To new Candle Heaven structure:
 *   /products, /orders  (top-level collections)
 *
 * Usage:
 *   node scripts/migrate.mjs <old-key.json> <new-key.json> [--with-orders] [--peek]
 *
 *   --with-orders   also migrate orders from old app
 *   --peek          print first doc from each collection and exit (for debugging)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , oldKeyPath, newKeyPath, ...flags] = process.argv;
const WITH_ORDERS   = flags.includes('--with-orders');
const PEEK          = flags.includes('--peek');

if (!oldKeyPath || !newKeyPath) {
  console.error('Usage: node scripts/migrate.mjs <old-key.json> <new-key.json> [--with-orders] [--peek]');
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

// Old app stores all data nested under a user document
const OLD_USER_ID = 'naIP2ic8k2PArZQbbRcWvVBS2D52';
const userRef = oldDb
  .collection('artifacts')
  .doc('default-bizmanager-app')
  .collection('users')
  .doc(OLD_USER_ID);

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { process.stdout.write(msg + '\n'); }

function stripUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  );
}

async function writeBatched(collectionName, docs) {
  let written = 0;
  for (let i = 0; i < docs.length; i += 499) {
    const batch = newDb.batch();
    for (const { id, data } of docs.slice(i, i + 499)) {
      batch.set(newDb.collection(collectionName).doc(id), data);
      written++;
    }
    await batch.commit();
  }
  return written;
}

// ── Field transforms ──────────────────────────────────────────────────────────

function transformProduct(data, id, stock) {
  return stripUndefined({
    name:        data.name        || '',
    description: data.description || '',
    category:    data.category    || '',
    price:       data.price       ?? 0,
    unit:        'piece',           // old schema had no unit — update per-product after migration
    stock:       stock,
    images:      [],
    minOrder:    data.minOrderLevel ?? 1,
    featured:    false,
    isPackaging: false,
    allowDecimal: false,
    createdAt:   data.createdAt   || null,
    // averageCost intentionally omitted — set by recording purchases
  });
}

function mapOrderStatus(raw) {
  const map = {
    delivered:  'delivered',
    shipped:    'shipped',
    processing: 'confirmed',
    confirmed:  'confirmed',
    pending:    'pending',
    cancelled:  'cancelled',
    returned:   'returned',
  };
  return map[(raw || '').toLowerCase()] || 'pending';
}

function toCartItem(item) {
  return {
    productId: item.sku  || '',
    cartKey:   item.sku  || '',
    name:      item.name || '',
    // sellingPrice is already per-unit for both priceMode="flat" and "multiplier"
    price:     item.sellingPrice ?? 0,
    quantity:  item.quantity     ?? 1,
    unit:      'piece',
  };
}

function transformOrder(data, id) {
  const allItems      = data.items || [];
  const items         = allItems.filter(i => !String(i.sku || '').startsWith('PKG-'));
  const packagingItems = allItems.filter(i =>  String(i.sku || '').startsWith('PKG-'));

  const subtotal    = data.totalRevenue   ?? 0;
  const deliveryFee = data.shippingCharges ?? data.actualShippingFee ?? 0;
  const discount    = data.discountAmount  ?? 0;
  const total       = subtotal + deliveryFee - discount;

  return stripUndefined({
    orderNumber:    String(data.sequentialOrderNumber || data.annualOrderNumber || id),
    status:         mapOrderStatus(data.orderStatus),
    customer: {
      name:            data.customer?.name    || '',
      phone:           data.customer?.phone   || '',
      secondaryPhone:  data.customer?.mobile2 || undefined,
      address:         data.customer?.address || '',
      district:        '',
      city:            '',
    },
    items:           items.map(toCartItem),
    packagingItems:  packagingItems.map(toCartItem),
    subtotal,
    deliveryFee,
    promoDiscount:   discount > 0 ? discount : undefined,
    total,
    waybillNumber:   data.trackingNumber   || undefined,
    paymentMethod:   data.paymentMethod    || undefined,
    paymentStatus:   data.paymentStatus    || undefined,
    createdAt:       data.timestamp        || null,
  });
}

// ── Peek mode — inspect old structure without writing ─────────────────────────

async function peek() {
  const collections = ['products', 'orders', 'inventory', 'purchases', 'purchase_history'];
  for (const name of collections) {
    log(`\n══ ${name} ══`);
    const snap = await userRef.collection(name).limit(1).get();
    if (snap.empty) { log('  (empty)'); continue; }
    log(JSON.stringify(snap.docs[0].data(), null, 2));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (PEEK) {
    log('Peeking at old database structure...');
    await peek();
    process.exit(0);
  }

  log('═══════════════════════════════════════════');
  log('  Candle Heaven — Database Migration');
  log('═══════════════════════════════════════════');
  log(`Source: ${oldKeyPath}  (user: ${OLD_USER_ID})`);
  log(`Target: ${newKeyPath}`);
  log(`Orders: ${WITH_ORDERS ? 'YES' : 'NO  (pass --with-orders to include)'}`);

  // ── 1. Inventory → stock map ────────────────────────────────────────────────
  log('\n▸ inventory (reading stock levels)');
  const inventorySnap = await userRef.collection('inventory').get();
  const stockMap = {};
  for (const doc of inventorySnap.docs) {
    const d = doc.data();
    const qty = d.quantity ?? d.stock ?? d.currentStock ?? d.qty ?? 0;
    stockMap[doc.id] = qty;
    if (d.productId) stockMap[d.productId] = qty;
  }
  log(`  read ${inventorySnap.size} inventory records`);

  // ── 2. Products ─────────────────────────────────────────────────────────────
  log('\n▸ products');
  const productsSnap = await userRef.collection('products').get();
  if (productsSnap.empty) {
    log('  (empty — skipped)');
  } else {
    log(`  found ${productsSnap.size} docs`);
    const docs = productsSnap.docs.map(d => ({
      id:   d.id,
      data: transformProduct(d.data(), d.id, stockMap[d.id] ?? 0),
    }));
    const written = await writeBatched('products', docs);
    log(`  ✓ wrote ${written} docs`);
    log('  Note: unit defaults to "piece" — update bulk products (wax, fragrance) individually');
  }

  // ── 3. Orders ───────────────────────────────────────────────────────────────
  if (WITH_ORDERS) {
    log('\n▸ orders');
    const ordersSnap = await userRef.collection('orders').get();
    if (ordersSnap.empty) {
      log('  (empty — skipped)');
    } else {
      log(`  found ${ordersSnap.size} docs`);
      const docs = ordersSnap.docs.map(d => ({
        id:   d.id,
        data: transformOrder(d.data(), d.id),
      }));
      const written = await writeBatched('orders', docs);
      log(`  ✓ wrote ${written} docs`);
    }
  } else {
    log('\n▸ orders  (skipped — pass --with-orders to include)');
  }

  log('\n▸ purchases    (starts empty — record via admin portal)');
  log('▸ suppliers    (starts empty — add via admin portal)');
  log('▸ promotions   (localStorage only — configure in admin portal)');

  log('\n═══════════════════════════════════════════');
  log('  Migration complete!');
  log('═══════════════════════════════════════════');
  log('\nNext steps:');
  log('  1. Fill in .env with the NEW Firebase web app credentials');
  log('  2. Set VITE_USE_MOCK=false in .env');
  log('  3. npm run dev');
  log('  4. In admin portal → Products: update units for wax/fragrance/bulk items\n');

  process.exit(0);
}

main().catch(err => {
  console.error('\nMigration failed:', err.message);
  console.error(err);
  process.exit(1);
});
