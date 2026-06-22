const TOKEN = import.meta.env.VITE_CURFOX_TOKEN as string;
const BASE = 'https://v2-operations.api.curfox.com/api/public/merchant';

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/json',
  'X-tenant': 'royalexpress',
};

export interface CurfoxState {
  id: number;
  name: string;
}

export interface CurfoxCity {
  id: number;
  name: string;
  postal_code: string;
  state_id: number;
  zone_id: number;
}

interface ApiResponse<T> {
  data: T[];
  meta: { current_page: number; last_page: number };
}

/** Fetches every page of a paginated endpoint. Appends ?page=N to the given base URL. */
async function fetchAllPages<T>(urlBase: string): Promise<T[]> {
  const getPage = async (page: number): Promise<ApiResponse<T>> => {
    const url = new URL(urlBase);
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) throw new Error(`Curfox API error ${res.status}`);
    return res.json() as Promise<ApiResponse<T>>;
  };

  const first = await getPage(1);
  if (first.meta.last_page === 1) return first.data;

  const rest = await Promise.all(
    Array.from({ length: first.meta.last_page - 1 }, (_, i) => getPage(i + 2))
  );
  return first.data.concat(rest.flatMap(p => p.data));
}

// ─── Caches ──────────────────────────────────────────────────────────────────

let stateCache: CurfoxState[] | null = null;
const cityCache = new Map<number, CurfoxCity[]>();

/** All districts/states — loaded once per session. */
export async function getStates(): Promise<CurfoxState[]> {
  if (stateCache) return stateCache;
  const all = await fetchAllPages<CurfoxState>(`${BASE}/state`);
  stateCache = all.filter(s => s.name).sort((a, b) => a.name.localeCompare(b.name));
  return stateCache;
}

/** Cities for a specific state — loaded on demand and cached per state. */
export async function getCitiesByState(stateId: number): Promise<CurfoxCity[]> {
  if (cityCache.has(stateId)) return cityCache.get(stateId)!;
  const all = await fetchAllPages<CurfoxCity>(`${BASE}/city?state_id=${stateId}`);
  const filtered = all.filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name));
  cityCache.set(stateId, filtered);
  return filtered;
}
