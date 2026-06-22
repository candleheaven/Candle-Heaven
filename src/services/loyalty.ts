import { doc, getDoc, setDoc, increment, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

function mockKey(userId: string) {
  return `ch_loyalty_${userId}`;
}

/** Points earned from a subtotal: 10 per LKR 1,000 spent. */
export function calcPointsEarned(subtotal: number): number {
  return Math.floor(subtotal / 1000) * 10;
}

export async function getPoints(userId: string): Promise<number> {
  if (USE_MOCK) {
    return parseInt(localStorage.getItem(mockKey(userId)) ?? '0', 10);
  }
  const snap = await getDoc(doc(db, 'loyalty', userId));
  return (snap.data()?.points as number) ?? 0;
}

/**
 * Atomically earn and redeem points after an order.
 * Returns the updated balance.
 */
export async function applyPointsTransaction(
  userId: string,
  earned: number,
  redeemed: number,
): Promise<number> {
  const net = earned - redeemed;

  if (USE_MOCK) {
    const current = parseInt(localStorage.getItem(mockKey(userId)) ?? '0', 10);
    const next = Math.max(0, current + net);
    localStorage.setItem(mockKey(userId), String(next));
    return next;
  }

  const ref = doc(db, 'loyalty', userId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { points: increment(net) });
  } else {
    await setDoc(ref, { points: Math.max(0, net) });
  }
  const updated = await getDoc(ref);
  return (updated.data()?.points as number) ?? 0;
}
