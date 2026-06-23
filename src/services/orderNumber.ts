import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

// Bijective shuffle: multiply by a number coprime to 36^4 = 1,679,616 (= 2^8 × 3^8)
// 51829 is odd and not divisible by 3, so gcd(51829, 1679616) = 1 → no collisions
const SHUFFLE_A = 51829;
const SHUFFLE_C = 7691;
const SHUFFLE_M = 1679616; // 36^4

export function encodeSeq(n: number): string {
  const shuffled = (n * SHUFFLE_A + SHUFFLE_C) % SHUFFLE_M;
  return shuffled.toString(36).toUpperCase().padStart(4, '0');
}

export function decodeSeq(code: string): number {
  // Modular inverse of SHUFFLE_A mod SHUFFLE_M via extended Euclidean algorithm
  const h = parseInt(code, 36);
  // Precomputed: modInverse(51829, 1679616) = 1231733
  return ((h - SHUFFLE_C + SHUFFLE_M) * 1231733) % SHUFFLE_M;
}

export async function generateOrderNumber(year?: number): Promise<{ orderNumber: string; seqNumber: number }> {
  const y = year ?? new Date().getFullYear();
  const yy = String(y).slice(-2);

  const counterRef = doc(db, 'counters', `orders_${y}`);
  const seqNumber = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.data()?.count ?? 0) + 1;
    tx.set(counterRef, { count: next });
    return next;
  });

  return { orderNumber: `CH-${yy}-${encodeSeq(seqNumber)}`, seqNumber };
}

export function generateOrderNumberMock(): { orderNumber: string; seqNumber: number } {
  const seqNumber = Math.floor(Math.random() * 500) + 1;
  const yy = String(new Date().getFullYear()).slice(-2);
  return { orderNumber: `CH-${yy}-${encodeSeq(seqNumber)}`, seqNumber };
}
