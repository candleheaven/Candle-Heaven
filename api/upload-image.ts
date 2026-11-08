import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Commit a product photo into public/products/ on GitHub.
 *
 * The site is static, so a product image has to be a file in the repo. Pushing
 * the commit triggers a Vercel rebuild, which means the image is not actually
 * live for a minute or two after this returns.
 *
 * The GitHub token can write to the repo, and anything in the repo is deployed,
 * so this endpoint is effectively code execution. It must never be reachable by
 * anyone but a signed-in admin — hence the token check below, which mirrors the
 * `admin === true` custom claim that firestore.rules enforces.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID;
const REPO = process.env.GITHUB_REPO ?? 'candleheaven/Candle-Heaven';
const BRANCH = process.env.GITHUB_BRANCH ?? 'main';

// Google's public keys for Firebase ID tokens. jose caches and refreshes these.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

/** Decoded size of a base64 payload, without allocating the buffer. */
function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

const MAX_BYTES = 3 * 1024 * 1024;

/** Reject anything that could escape public/products/ or collide oddly. */
function safeName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
  if (!cleaned || cleaned.startsWith('.') || cleaned.length > 80) return null;
  if (!/\.(jpe?g|png|webp)$/.test(cleaned)) return null;
  return cleaned;
}

async function requireAdmin(req: VercelRequest): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  if (!PROJECT_ID) return null;

  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
      algorithms: ['RS256'],
    });
    if (payload.admin !== true) return null;
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.GITHUB_TOKEN;
  if (!token || !PROJECT_ID) {
    console.error('[upload-image] missing GITHUB_TOKEN or project id');
    return res.status(500).json({ error: 'Image upload is not configured.' });
  }

  const uid = await requireAdmin(req);
  if (!uid) return res.status(403).json({ error: 'Admin sign-in required.' });

  const { filename, contentBase64 } = req.body ?? {};
  const name = safeName(filename);
  if (!name) return res.status(400).json({ error: 'Invalid file name.' });
  if (typeof contentBase64 !== 'string' || !contentBase64) {
    return res.status(400).json({ error: 'Missing image data.' });
  }
  if (base64Bytes(contentBase64) > MAX_BYTES) {
    return res.status(413).json({ error: 'Image is too large.' });
  }

  const path = `public/products/${name}`;
  const ghRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Add product image ${name}`,
      content: contentBase64,
      branch: BRANCH,
    }),
  });

  if (!ghRes.ok) {
    const detail = await ghRes.text();
    console.error('[upload-image] GitHub rejected the commit:', ghRes.status, detail);
    // 422 here is almost always "file already exists" — the client names files
    // uniquely, so it means a retry of a request that actually succeeded.
    const message = ghRes.status === 422
      ? 'An image with that name already exists.'
      : 'Could not save the image. Please try again.';
    return res.status(502).json({ error: message });
  }

  // Served from the site root — public/ is the Vite public directory.
  return res.status(200).json({ path: `/products/${name}`, pending: true });
}
