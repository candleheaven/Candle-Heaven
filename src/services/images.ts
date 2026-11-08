import { auth } from './firebase';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

/** Longest edge of a stored product photo, in pixels. */
const MAX_EDGE = 1600;
/** JPEG quality for the re-encoded upload. */
const QUALITY = 0.85;
/** Largest file we accept from the picker, before downscaling. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
export const ACCEPT_ATTR = ACCEPTED.join(',');

export class ImageUploadError extends Error {}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new ImageUploadError('That file could not be read as an image.')); };
    img.src = url;
  });
}

/**
 * Shrink to MAX_EDGE and re-encode as JPEG. Phone photos run to several MB,
 * which is slow to upload here and slower still for a customer on mobile data.
 */
async function downscale(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageUploadError('This browser could not process the image.');
  // PNGs with transparency would otherwise go black once encoded as JPEG.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new ImageUploadError('Could not encode the image.')),
      'image/jpeg',
      QUALITY,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new ImageUploadError('Could not read the processed image.'));
    reader.readAsDataURL(blob);
  });
}

function validate(file: File): void {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageUploadError('Only JPEG, PNG and WebP images can be uploaded.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageUploadError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
}

/** Turn a product name into the file name stem, so uploads are recognisable in git. */
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

/**
 * Upload one product photo and return the path to store on the product.
 *
 * The image is committed to public/products/ on GitHub by api/upload-image,
 * which triggers a Vercel rebuild. The path returned is therefore NOT live yet
 * — it serves once that deploy finishes, usually a minute or two. Callers that
 * want to show the image immediately should keep their own local preview.
 *
 * In mock mode there is no API route, so the processed image comes back as a
 * data URL instead. Fine for development, never for real data.
 */
export async function uploadProductImage(file: File, productName?: string): Promise<string> {
  validate(file);
  const processed = await downscale(file);

  if (USE_MOCK) return blobToDataUrl(processed);

  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ImageUploadError('Your admin session has expired. Please sign in again.');

  const dataUrl = await blobToDataUrl(processed);
  const contentBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

  // Unique, so an upload never overwrites an existing image — including the
  // older photos already committed by hand.
  const stem = (productName && slugify(productName)) || 'product';
  const filename = `${stem}-${Date.now().toString(36)}.jpg`;

  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename, contentBase64 }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ImageUploadError(body.error ?? 'Upload failed. Please try again.');
  }
  const { path } = await res.json();
  return path as string;
}
