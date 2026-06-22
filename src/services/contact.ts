import type { CustomerInfo } from '../types';
import type { CurfoxState, CurfoxCity } from './cities';

const KEY = 'ch_contact_info';

export interface StoredContact {
  form: CustomerInfo;
  district: CurfoxState | null;
  city: CurfoxCity | null;
}

export function saveContactInfo(
  form: CustomerInfo,
  district: CurfoxState | null,
  city: CurfoxCity | null,
): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ form, district, city }));
  } catch { /* storage quota */ }
}

export function loadContactInfo(): StoredContact | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredContact) : null;
  } catch {
    return null;
  }
}
