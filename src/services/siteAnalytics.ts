import { doc, setDoc, getDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

export type VisitType = 'shop' | 'tracking';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

export async function recordVisit(type: VisitType): Promise<void> {
  const today = todayStr();
  const lsKey = `ch_visit_${type}`;
  if (localStorage.getItem(lsKey) === today) return;
  try {
    await setDoc(
      doc(db, 'analytics', 'siteVisits'),
      { [`${type}Total`]: increment(1), [`${type}_${today}`]: increment(1) },
      { merge: true },
    );
    // Only mark as visited after successful write so a rules/network failure
    // doesn't permanently suppress the count for today.
    localStorage.setItem(lsKey, today);
  } catch {
    // non-critical — will retry on next page load
  }
}

export interface VisitStats {
  shopToday: number;
  shopTotal: number;
  trackingToday: number;
  trackingTotal: number;
}

export async function getVisitStats(): Promise<VisitStats> {
  try {
    const snap = await getDoc(doc(db, 'analytics', 'siteVisits'));
    if (!snap.exists()) return { shopToday: 0, shopTotal: 0, trackingToday: 0, trackingTotal: 0 };
    const d = snap.data();
    const today = todayStr();
    return {
      shopToday:     d[`shop_${today}`]     ?? 0,
      shopTotal:     d.shopTotal            ?? 0,
      trackingToday: d[`tracking_${today}`] ?? 0,
      trackingTotal: d.trackingTotal        ?? 0,
    };
  } catch {
    return { shopToday: 0, shopTotal: 0, trackingToday: 0, trackingTotal: 0 };
  }
}
