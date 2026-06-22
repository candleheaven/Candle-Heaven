import type { Promotion, CartItem } from '../types';

const STORAGE_KEY = 'ch_promotions';
const USAGE_KEY = 'ch_promo_usage';

const MOCK_SEED: Promotion[] = [
  {
    id: 'promo-welcome',
    code: 'WELCOME10',
    title: 'New Customer Welcome',
    description: 'Get 10% off your very first order. Welcome to the Candle Heaven family!',
    category: 'newcomer',
    discountType: 'percentage',
    discountValue: 10,
    minOrderAmount: 0,
    startDate: '',
    endDate: '',
    usageLimit: 0,
    usageCount: 12,
    perUserLimit: 1,
    active: true,
    badgeLabel: 'NEWCOMER OFFER',
    targetType: 'all',
    targetCategories: [],
    targetProductIds: [],
    targetProductNames: [],
  },
  {
    id: 'promo-festive',
    code: 'FESTIVE500',
    title: 'Festive Season Special',
    description: 'LKR 500 off on orders above LKR 3,000. Celebrate the season with premium candle ingredients!',
    category: 'seasonal',
    discountType: 'fixed',
    discountValue: 500,
    minOrderAmount: 3000,
    startDate: '2026-11-01',
    endDate: '2027-01-15',
    usageLimit: 100,
    usageCount: 34,
    perUserLimit: 0,
    active: true,
    badgeLabel: 'SEASONAL',
    targetType: 'all',
    targetCategories: [],
    targetProductIds: [],
    targetProductNames: [],
  },
  {
    id: 'promo-wax20',
    code: 'WAX20',
    title: '20% Off All Waxes',
    description: 'Stock up on premium waxes — 20% off any wax product.',
    category: 'general',
    discountType: 'percentage',
    discountValue: 20,
    minOrderAmount: 0,
    startDate: '',
    endDate: '',
    usageLimit: 0,
    usageCount: 8,
    perUserLimit: 0,
    active: true,
    badgeLabel: 'WAX DEAL',
    targetType: 'category',
    targetCategories: ['wax'],
    targetProductIds: [],
    targetProductNames: [],
  },
];

/** Ensure old persisted promos get the new fields defaulted. */
function normalise(p: Partial<Promotion> & { id: string }): Promotion {
  return {
    targetType: 'all',
    targetCategories: [],
    targetProductIds: [],
    targetProductNames: [],
    usageCount: 0,
    ...p,
  } as Promotion;
}

function loadAll(): Promotion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return (JSON.parse(raw) as Promotion[]).map(normalise);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_SEED));
    return MOCK_SEED;
  } catch {
    return [];
  }
}

function saveAll(promos: Promotion[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(promos));
  } catch { /* storage quota */ }
}

function userUsageKey(promoId: string, userId: string) {
  return `${promoId}_${userId}`;
}

function getUserUsage(promoId: string, userId: string): number {
  try {
    const map = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') as Record<string, number>;
    return map[userUsageKey(promoId, userId)] ?? 0;
  } catch {
    return 0;
  }
}

function incrementUserUsage(promoId: string, userId: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') as Record<string, number>;
    const k = userUsageKey(promoId, userId);
    map[k] = (map[k] ?? 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(map));
  } catch { /* quota */ }
}

export async function getPromotions(): Promise<Promotion[]> {
  await new Promise(r => setTimeout(r, 100));
  return loadAll();
}

export async function getActivePromotions(): Promise<Promotion[]> {
  const all = await getPromotions();
  const today = new Date().toISOString().slice(0, 10);
  return all.filter(p => {
    if (!p.active) return false;
    if (p.startDate && today < p.startDate) return false;
    if (p.endDate && today > p.endDate) return false;
    return true;
  });
}

export async function savePromotion(
  promo: Omit<Promotion, 'id' | 'usageCount'> & { id?: string; usageCount?: number },
): Promise<Promotion> {
  const all = loadAll();
  if (promo.id) {
    const idx = all.findIndex(p => p.id === promo.id);
    const updated = normalise({ ...(all[idx] ?? {}), ...promo });
    if (idx >= 0) all[idx] = updated; else all.push(updated);
    saveAll(all);
    return updated;
  }
  const newPromo = normalise({ ...promo, id: `promo-${Date.now()}`, usageCount: 0 });
  saveAll([...all, newPromo]);
  return newPromo;
}

export async function deletePromotion(id: string): Promise<void> {
  saveAll(loadAll().filter(p => p.id !== id));
}

/** Items from the cart that are eligible for this promo's target scope. */
export function eligibleItems(promo: Promotion, items: CartItem[]): CartItem[] {
  if (promo.targetType === 'category' && promo.targetCategories.length > 0) {
    return items.filter(i => i.category && promo.targetCategories.includes(i.category));
  }
  if (promo.targetType === 'product' && promo.targetProductIds.length > 0) {
    return items.filter(i => promo.targetProductIds.includes(i.productId));
  }
  return items;
}

function eligibleSubtotal(promo: Promotion, items: CartItem[], fullSubtotal: number): number {
  if (promo.targetType === 'all') return fullSubtotal;
  return eligibleItems(promo, items).reduce((s, i) => s + i.price * i.quantity, 0);
}

export function calcPromoDiscount(
  promo: Promotion,
  items: CartItem[],
  subtotal: number,
  deliveryFee: number,
): number {
  if (promo.discountType === 'free_delivery') return deliveryFee;
  const base = eligibleSubtotal(promo, items, subtotal);
  switch (promo.discountType) {
    case 'percentage': return Math.round(base * promo.discountValue / 100);
    case 'fixed': return Math.min(promo.discountValue, base);
    default: return 0;
  }
}

export interface PromoValidationResult {
  valid: boolean;
  promo?: Promotion;
  error?: string;
}

export function validatePromoCode(
  code: string,
  subtotal: number,
  opts: { userId?: string; orderCount?: number; items?: CartItem[] } = {},
): PromoValidationResult {
  const all = loadAll();
  const promo = all.find(p => p.code.toUpperCase() === code.trim().toUpperCase());

  if (!promo) return { valid: false, error: 'Invalid promo code.' };
  if (!promo.active) return { valid: false, error: 'This promo code is no longer active.' };

  const today = new Date().toISOString().slice(0, 10);
  if (promo.startDate && today < promo.startDate)
    return { valid: false, error: `This offer starts on ${promo.startDate}.` };
  if (promo.endDate && today > promo.endDate)
    return { valid: false, error: 'This promo code has expired.' };

  if (promo.usageLimit > 0 && promo.usageCount >= promo.usageLimit)
    return { valid: false, error: 'This promo code has reached its usage limit.' };

  if (promo.minOrderAmount > 0 && subtotal < promo.minOrderAmount)
    return { valid: false, error: `Minimum order of LKR ${promo.minOrderAmount.toLocaleString()} required.` };

  if (promo.category === 'newcomer') {
    if (!opts.userId) return { valid: false, error: 'Sign in to use this newcomer offer.' };
    if ((opts.orderCount ?? 0) > 0) return { valid: false, error: 'This offer is for first-time customers only.' };
  }

  if (promo.perUserLimit > 0 && opts.userId) {
    const used = getUserUsage(promo.id, opts.userId);
    if (used >= promo.perUserLimit)
      return { valid: false, error: 'You have already used this promo code the maximum number of times.' };
  }

  // For targeted promos, ensure at least one matching item is in the cart
  if (promo.targetType !== 'all' && opts.items) {
    const matching = eligibleItems(promo, opts.items);
    if (matching.length === 0) {
      if (promo.targetType === 'category') {
        const names = promo.targetCategories.join(', ');
        return { valid: false, error: `This promo applies to ${names} products only, which are not in your cart.` };
      }
      return { valid: false, error: 'None of the products in your cart are eligible for this promo.' };
    }
  }

  return { valid: true, promo };
}

export async function recordPromoUsage(promoId: string, userId?: string): Promise<void> {
  const all = loadAll();
  const idx = all.findIndex(p => p.id === promoId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], usageCount: all[idx].usageCount + 1 };
    saveAll(all);
  }
  if (userId) incrementUserUsage(promoId, userId);
}
