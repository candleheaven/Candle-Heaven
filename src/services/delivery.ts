const SETTINGS_KEY = 'ch_delivery_settings';

export interface DeliverySettings {
  baseWeightKg: number;    // weight included in the base fee (default 1.25)
  zone1to4Fee: number;     // base fee for zones 1–4 (default 450)
  zone5PlusFee: number;    // base fee for zones 5+ (default 500)
  additionalPerKg: number; // per additional kg above base weight, rounded up (default 100)
  zone5Threshold: number;  // zones >= this use zone5PlusFee (default 5)
}

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  baseWeightKg: 1.25,
  zone1to4Fee: 450,
  zone5PlusFee: 500,
  additionalPerKg: 100,
  zone5Threshold: 5,
};

export function getDeliverySettings(): DeliverySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_DELIVERY_SETTINGS, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...DEFAULT_DELIVERY_SETTINGS };
}

export function saveDeliverySettings(settings: DeliverySettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Calculates the delivery fee.
 *   Base fee covers the first `baseWeightKg` kg.
 *   Each additional kg (ceiling) costs `additionalPerKg`.
 */
export function calculateDeliveryFee(
  totalWeightKg: number,
  zoneId: number,
  settings: DeliverySettings = DEFAULT_DELIVERY_SETTINGS,
): number {
  const baseFee = zoneId < settings.zone5Threshold ? settings.zone1to4Fee : settings.zone5PlusFee;
  if (totalWeightKg <= settings.baseWeightKg) return baseFee;
  const extraKg = Math.ceil(totalWeightKg - settings.baseWeightKg);
  return baseFee + extraKg * settings.additionalPerKg;
}
