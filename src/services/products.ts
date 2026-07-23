import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Product } from '../types';
import { MOCK_PRODUCTS } from './mockData';

const COLLECTION = 'products';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

const MOCK_VERSION = '7'; // keep in sync with admin.ts

function getMockProducts(): Product[] {
  // Drop stale cache if schema version changed
  if (localStorage.getItem('ch_mock_version') !== MOCK_VERSION) {
    localStorage.removeItem('ch_mock_products');
    localStorage.removeItem('ch_mock_seeded');
    localStorage.setItem('ch_mock_version', MOCK_VERSION);
    return MOCK_PRODUCTS;
  }
  const stored = localStorage.getItem('ch_mock_products');
  if (stored) {
    try { return JSON.parse(stored) as Product[]; } catch { /* fall through */ }
  }
  return MOCK_PRODUCTS;
}

function toProduct(snap: QueryDocumentSnapshot<DocumentData>): Product {
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name ?? '',
    description: d.description ?? '',
    price: d.price ?? 0,
    unit: d.unit ?? 'piece',
    category: d.category ?? 'other',
    stock: d.stock ?? 0,
    images: d.images ?? (d.image ? [d.image] : []),
    minOrder: d.minOrder ?? 1,
    featured: d.featured ?? false,
    ...(d.priceTiers   && { priceTiers: d.priceTiers }),
    ...(d.isPackaging  && { isPackaging: d.isPackaging }),
    ...(d.allowDecimal && { allowDecimal: d.allowDecimal }),
    ...(d.weightGrams  && { weightGrams: d.weightGrams }),
    ...(d.averageCost        !== undefined && { averageCost: d.averageCost }),
    ...(d.lowStockThreshold  !== undefined && { lowStockThreshold: d.lowStockThreshold }),
    ...(d.isStarterPack  && { isStarterPack: d.isStarterPack }),
    ...(d.packComponents && { packComponents: d.packComponents }),
  };
}

const inStock = (p: Product) => p.stock > 0;

export async function getAllProducts(): Promise<Product[]> {
  if (USE_MOCK) return getMockProducts().filter(p => !p.isPackaging && (p.isStarterPack || inStock(p))).sort((a, b) => a.name.localeCompare(b.name));
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('name')));
  return snap.docs.map(toProduct).filter(p => !p.isPackaging && (p.isStarterPack || inStock(p)));
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  if (USE_MOCK) return getMockProducts().filter(p => ids.includes(p.id ?? ''));
  const results = await Promise.all(ids.map(id => getDoc(doc(db, COLLECTION, id))));
  return results
    .filter(s => s.exists())
    .map(s => toProduct(s as QueryDocumentSnapshot<DocumentData>));
}

export async function getProductsByCategory(category: string): Promise<Product[]> {
  if (USE_MOCK) return getMockProducts().filter(p => p.category === category && !p.isPackaging && inStock(p));
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('category', '==', category), orderBy('name'))
  );
  return snap.docs.map(toProduct).filter(p => !p.isPackaging && inStock(p));
}

export async function getFeaturedProducts(n = 8): Promise<Product[]> {
  if (USE_MOCK) return getMockProducts().filter(p => p.featured && !p.isPackaging && inStock(p)).slice(0, n);
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('featured', '==', true), limit(n))
  );
  return snap.docs.map(toProduct).filter(p => !p.isPackaging && inStock(p));
}

export async function getProductById(id: string): Promise<Product | null> {
  if (USE_MOCK) {
    const p = getMockProducts().find(p => p.id === id);
    return p && !p.isPackaging ? p : null;
  }
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return toProduct(snap as QueryDocumentSnapshot<DocumentData>);
}
