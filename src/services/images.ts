import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

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

/**
 * Upload one product photo and return the URL to store on the product.
 *
 * In mock mode there is no Storage bucket, so the downscaled image comes back
 * as a data URL. That keeps the form usable offline, but such a URL is carried
 * inside the product record itself — fine for development, never for real data.
 */
export async function uploadProductImage(file: File, productId?: string): Promise<string> {
  validate(file);
  const processed = await downscale(file);

  if (USE_MOCK) return blobToDataUrl(processed);

  // Collision-proof without needing a read first: products can be created
  // before they have an id, and two uploads can land in the same millisecond.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `products/${productId ?? 'new'}/${unique}.jpg`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, processed, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' });
  return getDownloadURL(objectRef);
}

/**
 * Remove an uploaded image from Storage. Silently ignores anything we did not
 * upload — committed /products/* paths and external URLs are not ours to delete.
 */
export async function deleteProductImage(url: string): Promise<void> {
  if (USE_MOCK || !url.startsWith('https://firebasestorage.googleapis.com/')) return;
  try {
    await deleteObject(ref(storage, url));
  } catch {
    // Already gone, or still referenced by another product that was copied
    // from this one. Not worth failing the save over.
  }
}
