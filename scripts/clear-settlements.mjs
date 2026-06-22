#!/usr/bin/env node
/**
 * Delete all documents from the settlements collection.
 * Usage: node scripts/clear-settlements.mjs <service-account.json>
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , keyPath] = process.argv;
if (!keyPath) {
  console.error('Usage: node scripts/clear-settlements.mjs <service-account.json>');
  process.exit(1);
}

const app = initializeApp({ credential: cert(JSON.parse(readFileSync(resolve(keyPath), 'utf8'))) });
const db  = getFirestore(app);

const snap = await db.collection('settlements').get();
if (snap.empty) { console.log('settlements collection is already empty.'); process.exit(0); }

console.log(`Deleting ${snap.size} settlement documents…`);

// Firestore batch limit is 500
const chunks = [];
for (let i = 0; i < snap.docs.length; i += 500)
  chunks.push(snap.docs.slice(i, i + 500));

for (const chunk of chunks) {
  const batch = db.batch();
  chunk.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

console.log(`Done — deleted ${snap.size} documents.`);
