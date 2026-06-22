#!/usr/bin/env node
/**
 * Grant or revoke the 'admin' custom claim on Firebase employee accounts.
 * Uses only Node.js built-ins (crypto + fetch) — no firebase-admin dependency.
 *
 * Usage:
 *   node scripts/set-admin-claim.mjs <service-account.json> <email> [email2 ...] [--revoke]
 *
 *   --revoke   Remove admin access instead of granting it
 *
 * The user must sign out and back in after the claim is changed.
 * Create accounts first: Firebase Console → Authentication → Add user
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createSign } from 'crypto';

const [, , keyPath, ...rest] = process.argv;
const REVOKE = rest.includes('--revoke');
const emails = rest.filter(a => !a.startsWith('--'));

if (!keyPath || emails.length === 0) {
  console.error('Usage: node scripts/set-admin-claim.mjs <service-account.json> <email> [email2 ...] [--revoke]');
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(keyPath), 'utf8'));
const projectId = key.project_id;

// ── Service-account → OAuth2 access token (pure Node crypto + fetch) ──────────

function makeJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/identitytoolkit',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');
  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(serviceAccount.private_key, 'base64url');
  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(serviceAccount) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  makeJwt(serviceAccount),
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Identity Toolkit REST helpers ─────────────────────────────────────────────

async function getUid(token, email) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.users?.[0]?.localId ?? null;
}

async function setCustomClaims(token, uid, claims) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const token = await getAccessToken(key);

for (const email of emails) {
  try {
    const uid = await getUid(token, email);
    if (!uid) {
      console.error(`✗  ${email}: account not found.`);
      console.error(`   Create it first: Firebase Console → Authentication → Add user`);
      continue;
    }
    await setCustomClaims(token, uid, REVOKE ? {} : { admin: true });
    const action = REVOKE ? 'Revoked admin access for' : 'Granted admin access to';
    console.log(`✓  ${action} ${email}  (uid: ${uid})`);
    if (!REVOKE) {
      console.log(`   Sign out and back in for the change to take effect.`);
    }
  } catch (err) {
    console.error(`✗  ${email}: ${err.message}`);
  }
}
