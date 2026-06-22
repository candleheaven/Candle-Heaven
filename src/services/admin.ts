import {
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, where, serverTimestamp, increment, deleteField,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Product, Order, OrderStatus, CartItem, Purchase, PurchaseItem, Supplier, Settlement, PaymentInfo, CourierAssignment } from '../types';
import { MOCK_PRODUCTS } from './mockData';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

const PRODUCTS_KEY = 'ch_mock_products';
const ORDERS_KEY = 'ch_dev_orders';
const SEEDED_KEY = 'ch_mock_seeded';
const VERSION_KEY = 'ch_mock_version';
// Bump this whenever MOCK_PRODUCTS schema changes (e.g. new required fields added)
const MOCK_VERSION = '7';

// ─── Mock helpers ────────────────────────────────────────────────────────────

/** Clear stale cached data when the mock schema version changes. */
function checkMockVersion(): void {
  if (localStorage.getItem(VERSION_KEY) !== MOCK_VERSION) {
    localStorage.removeItem(PRODUCTS_KEY);
    localStorage.removeItem(SEEDED_KEY);
    localStorage.setItem(VERSION_KEY, MOCK_VERSION);
  }
}

function initMockProducts(): Product[] {
  checkMockVersion();
  const stored = localStorage.getItem(PRODUCTS_KEY);
  if (stored) {
    try { return JSON.parse(stored) as Product[]; } catch { /* fall through */ }
  }
  const initial = MOCK_PRODUCTS.map(p => ({ ...p }));
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(initial));
  return initial;
}

function saveMockProducts(products: Product[]): void {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

// Orders per calendar month (Jan=0 … Dec=11) reflecting candle business seasonality.
// Nov/Dec spike due to holiday gifting; April spike for Sinhala New Year.
const ORDERS_PER_MONTH = [7, 8, 8, 10, 9, 9, 9, 10, 10, 12, 16, 12];

function statusByAge(daysAgo: number, seed: number): OrderStatus {
  if (seed % 12 === 0) return 'cancelled';
  if (daysAgo > 45) return 'delivered';
  if (daysAgo > 20) return seed % 6 === 0 ? 'shipped' : 'delivered';
  if (seed % 20 === 0 && daysAgo > 20) return 'returned';
  if (daysAgo > 10) return 'shipped';
  if (daysAgo > 2)  return 'confirmed';
  return 'pending';
}

function seedMockOrdersIfNeeded(): void {
  if (localStorage.getItem(SEEDED_KEY)) return;

  const products = initMockProducts();
  const names = [
    'Aisha Fernando', 'Priya Perera', 'Nimasha Silva', 'Dinuka Jayawardena',
    'Malini Wickramasinghe', 'Rashmi Karunaratne', 'Harshi Bandara',
    'Chamara De Mel', 'Suthira Rajapaksa', 'Lahiru Herath',
    'Kasuni Wijesinghe', 'Nimal Perera', 'Dilani Samarawickrama',
  ];
  const cities = ['Colombo', 'Kandy', 'Galle', 'Negombo', 'Matara', 'Kurunegala', 'Ratnapura'];
  const districts = ['Colombo', 'Kandy', 'Galle', 'Gampaha', 'Matara', 'Kurunegala', 'Ratnapura'];

  const now = new Date();
  const nowMs = now.getTime();
  const pick = <T,>(arr: T[], seed: number): T => arr[seed % arr.length];

  const orders: object[] = [];
  let globalIdx = 0;

  // Generate orders across the past 12 calendar months
  for (let monthsBack = 11; monthsBack >= 0; monthsBack--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const monthIdx = monthDate.getMonth();
    const count = ORDERS_PER_MONTH[monthIdx];
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();

    for (let j = 0; j < count; j++) {
      const i = globalIdx++;
      const dayOfMonth = Math.max(1, Math.floor((j / count) * daysInMonth) + 1);
      const orderDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOfMonth, (i * 3) % 22);

      if (orderDate > now) continue; // don't create future orders

      const daysAgo = Math.floor((nowMs - orderDate.getTime()) / 86400000);
      const status = statusByAge(daysAgo, i);

      const itemCount = (i % 3) + 1;
      const items: CartItem[] = [];
      let subtotal = 0;
      for (let k = 0; k < itemCount; k++) {
        const p = products[(i * 7 + k * 3) % products.length];
        const qty = (k % 3) + 1;
        items.push({ productId: p.id, cartKey: p.id, name: p.name, price: p.price, quantity: qty, unit: p.unit, image: p.images[0] });
        subtotal += p.price * qty;
      }

      const name = pick(names, i * 3);
      const city = pick(cities, i * 5);
      const district = pick(districts, i * 5);
      const ts = (nowMs - i * 1000).toString(36).toUpperCase();
      const rnd = (i * 777 + 12345).toString(36).toUpperCase().slice(0, 4);

      orders.push({
        orderNumber: `CH-${ts}-${rnd}`,
        customer: {
          name,
          email: name.toLowerCase().replace(' ', '.') + '@gmail.com',
          phone: `07${((i * 97 + 10000000) % 100000000).toString().padStart(8, '0')}`,
          address: `${(i * 17 + 10) % 200} Main Street`,
          city,
          district,
        },
        items,
        subtotal,
        total: subtotal,
        status,
        createdAt: orderDate.toISOString(),
        userId: null,
      });
    }
  }

  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  localStorage.setItem(SEEDED_KEY, 'true');
}

// ─── Product CRUD ─────────────────────────────────────────────────────────────

export async function adminGetAllProducts(): Promise<Product[]> {
  if (USE_MOCK) return initMockProducts();
  const snap = await getDocs(query(collection(db, 'products'), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}

export async function adminAddProduct(product: Omit<Product, 'id'>): Promise<string> {
  if (USE_MOCK) {
    const products = initMockProducts();
    const id = `prod-${Date.now()}`;
    saveMockProducts([...products, { ...product, id }]);
    return id;
  }
  const clean = Object.fromEntries(Object.entries(product).filter(([, v]) => v !== undefined));
  const ref = await addDoc(collection(db, 'products'), clean);
  return ref.id;
}

export async function adminUpdateProduct(id: string, updates: Partial<Product>): Promise<void> {
  if (USE_MOCK) {
    const products = initMockProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) products[idx] = { ...products[idx], ...updates };
    saveMockProducts(products);
    return;
  }
  // Replace undefined values with deleteField() so optional fields are removed cleanly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    payload[k] = v === undefined ? deleteField() : v;
  }
  await updateDoc(doc(db, 'products', id), payload);
}

export async function adminDeleteProduct(id: string): Promise<void> {
  if (USE_MOCK) {
    saveMockProducts(initMockProducts().filter(p => p.id !== id));
    return;
  }
  await deleteDoc(doc(db, 'products', id));
}

// ─── Stock management ─────────────────────────────────────────────────────────

// Statuses that mean stock has been committed to the order
const STOCK_ACTIVE: Set<OrderStatus> = new Set(['confirmed', 'shipped', 'delivered']);

/**
 * Adjust product stock for every item in an order.
 * delta = -1 to deduct (on confirmation), +1 to restore (on rollback/cancel).
 * For tiered items stock is stored in base units (grams/ml), so we multiply
 * quantity × tierBase. For simple items stock is in natural units.
 */
async function adjustProductStock(items: CartItem[], delta: -1 | 1): Promise<void> {
  if (USE_MOCK) {
    const products = initMockProducts();
    for (const item of items) {
      const idx = products.findIndex(p => p.id === item.productId);
      if (idx === -1) continue;
      const baseUnits = item.tierBase ? item.quantity * item.tierBase : item.quantity;
      products[idx] = {
        ...products[idx],
        stock: Math.max(0, products[idx].stock + Math.round(baseUnits * delta)),
      };
    }
    saveMockProducts(products);
    return;
  }
  for (const item of items) {
    const baseUnits = item.tierBase ? item.quantity * item.tierBase : item.quantity;
    await updateDoc(doc(db, 'products', item.productId), {
      stock: increment(Math.round(baseUnits * delta)),
    });
  }
}

/**
 * Restock only the non-damaged portion of each item.
 * damagedQty maps cartKey → damaged quantity in the same units as CartItem.quantity.
 * Damaged items are written off — not returned to stock.
 */
async function restockWithDamage(
  items: CartItem[],
  damagedQty: Record<string, number>,
): Promise<void> {
  if (USE_MOCK) {
    const products = initMockProducts();
    for (const item of items) {
      const idx = products.findIndex(p => p.id === item.productId);
      if (idx === -1) continue;
      const damaged = Math.min(damagedQty[item.cartKey] ?? 0, item.quantity);
      const restockUnits = Math.round(Math.max(0, item.quantity - damaged) * (item.tierBase ?? 1));
      if (restockUnits > 0) {
        products[idx] = { ...products[idx], stock: products[idx].stock + restockUnits };
      }
    }
    saveMockProducts(products);
    return;
  }
  for (const item of items) {
    const damaged = Math.min(damagedQty[item.cartKey] ?? 0, item.quantity);
    const restockUnits = Math.round(Math.max(0, item.quantity - damaged) * (item.tierBase ?? 1));
    if (restockUnits > 0) {
      await updateDoc(doc(db, 'products', item.productId), { stock: increment(restockUnits) });
    }
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface AdminOrder extends Omit<Order, 'createdAt'> {
  id: string;
  orderNumber: string;
  createdAt: string;
}

export async function adminGetAllOrders(): Promise<AdminOrder[]> {
  if (USE_MOCK) {
    seedMockOrdersIfNeeded();
    const raw = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as (AdminOrder & { createdAt?: string })[];
    return raw
      .map((o, i) => ({
        ...o,
        id: o.orderNumber ?? `order-${i}`,
        orderNumber: o.orderNumber ?? `CH-UNKNOWN-${i}`,
        createdAt: o.createdAt ?? new Date().toISOString(),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => {
    const data = d.data();
    // Firestore returns createdAt as a Timestamp object; normalize to ISO string
    if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
    return { id: d.id, ...data } as AdminOrder;
  });
}

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CH-${ts}-${rand}`;
}

export async function adminPlaceOrder(
  order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>,
  status: OrderStatus = 'confirmed'
): Promise<string> {
  const orderNumber = generateOrderNumber();

  if (STOCK_ACTIVE.has(status)) {
    await adjustProductStock([...order.items, ...(order.packagingItems ?? [])], -1);
  }

  if (USE_MOCK) {
    const existing = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]');
    const newOrder = { ...order, orderNumber, status, createdAt: new Date().toISOString() };
    localStorage.setItem(ORDERS_KEY, JSON.stringify([newOrder, ...existing]));
    return orderNumber;
  }

  await addDoc(collection(db, 'orders'), {
    ...order,
    orderNumber,
    status,
    createdAt: serverTimestamp(),
  });
  return orderNumber;
}

export async function adminUpdateOrderStatus(
  orderId: string,
  status: OrderStatus,
  damagedQty?: Record<string, number>, // cartKey → damaged qty; only used when status === 'returned'
): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    const order = orders.find(o => o.id === orderId);
    if (order) {
      const wasActive = STOCK_ACTIVE.has(order.status as OrderStatus);
      const willBeActive = STOCK_ACTIVE.has(status);
      const allItems = [...order.items, ...(order.packagingItems ?? [])];
      if (!wasActive && willBeActive) {
        await adjustProductStock(allItems, -1);
      } else if (wasActive && !willBeActive) {
        if (status === 'returned' && damagedQty) {
          await restockWithDamage(allItems, damagedQty);
        } else {
          await adjustProductStock(allItems, 1);
        }
      }
    }
    const damagedRecord = damagedQty
      ? Object.entries(damagedQty)
          .filter(([, qty]) => qty > 0)
          .map(([cartKey, qty]) => ({ cartKey, damagedQty: qty }))
      : undefined;
    localStorage.setItem(
      ORDERS_KEY,
      JSON.stringify(orders.map(o => {
        if (o.id !== orderId) return o;
        return { ...o, status, ...(damagedRecord?.length ? { damagedItems: damagedRecord } : {}) };
      }))
    );
    return;
  }
  await updateDoc(doc(db, 'orders', orderId), { status });
}

/**
 * Update order items (and packaging items) with proper stock reconciliation.
 * If the order is in a STOCK_ACTIVE status, restores old items and deducts new ones.
 */
export async function adminUpdateOrderItems(
  orderId: string,
  newItems: CartItem[],
  newPackagingItems: CartItem[],
  newSubtotal: number,
  newTotal: number,
): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    const order = orders.find(o => o.id === orderId);
    if (order && STOCK_ACTIVE.has(order.status as OrderStatus)) {
      const oldAllItems = [...order.items, ...(order.packagingItems ?? [])];
      const newAllItems = [...newItems, ...newPackagingItems];
      await adjustProductStock(oldAllItems, 1);
      await adjustProductStock(newAllItems, -1);
    }
    localStorage.setItem(
      ORDERS_KEY,
      JSON.stringify(orders.map(o => {
        if (o.id !== orderId) return o;
        const updated = { ...o, items: newItems, subtotal: newSubtotal, total: newTotal } as AdminOrder;
        if (newPackagingItems.length > 0) updated.packagingItems = newPackagingItems;
        else delete updated.packagingItems;
        return updated;
      })),
    );
    return;
  }
  await updateDoc(doc(db, 'orders', orderId), {
    items: newItems,
    packagingItems: newPackagingItems.length > 0 ? newPackagingItems : null,
    subtotal: newSubtotal,
    total: newTotal,
  });
}

export async function adminUpdateOrderField(
  orderId: string,
  fields: Partial<AdminOrder>,
): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    localStorage.setItem(
      ORDERS_KEY,
      JSON.stringify(orders.map(o => (o.id === orderId ? { ...o, ...fields } : o))),
    );
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateDoc(doc(db, 'orders', orderId), fields as any);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface StockValueEntry {
  category: string;
  value: number;
}

export interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  lowStockCount: number;
  pendingOrders: number;
  revenueByDay: { date: string; revenue: number }[];
  ordersByStatus: { status: string; count: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
  revenueByCategory: { category: string; revenue: number }[];
  stockValue: number;
  stockValueByCategory: StockValueEntry[];
  stockValueMissingCost: number;
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const [orders, products] = await Promise.all([adminGetAllOrders(), adminGetAllProducts()]);

  const active = orders.filter(o => o.status !== 'cancelled');
  const totalRevenue = active.reduce((sum, o) => sum + o.total, 0);
  const totalOrders = orders.length;
  const totalProducts = products.length;
  const lowStockCount = products.filter(p => p.stock < 20).length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;

  // Revenue by day — last 30 days
  const dayMap = new Map<string, number>();
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dayMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of active) {
    const day = o.createdAt?.slice(0, 10);
    if (day && dayMap.has(day)) dayMap.set(day, (dayMap.get(day) ?? 0) + o.total);
  }
  const revenueByDay = Array.from(dayMap.entries()).map(([date, revenue]) => ({ date, revenue }));

  // Orders by status
  const statusMap = new Map<string, number>();
  for (const o of orders) statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);
  const ordersByStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // Top products by revenue
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const o of active) {
    for (const item of o.items) {
      const e = productMap.get(item.productId) ?? { name: item.name, quantity: 0, revenue: 0 };
      e.quantity += item.quantity;
      e.revenue += item.price * item.quantity;
      productMap.set(item.productId, e);
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Revenue by category
  const catMap = new Map<string, number>();
  const productById = new Map(products.map(p => [p.id, p]));
  for (const o of active) {
    for (const item of o.items) {
      const cat = productById.get(item.productId)?.category ?? 'other';
      catMap.set(cat, (catMap.get(cat) ?? 0) + item.price * item.quantity);
    }
  }
  const revenueByCategory = Array.from(catMap.entries())
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // Stock value — stock × averageCost (both in base units)
  let stockValue = 0;
  let stockValueMissingCost = 0;
  const catValueMap = new Map<string, number>();
  for (const p of products) {
    if (p.averageCost !== undefined) {
      const val = p.stock * p.averageCost;
      stockValue += val;
      const cat = p.isPackaging ? 'packaging' : p.category;
      catValueMap.set(cat, (catValueMap.get(cat) ?? 0) + val);
    } else {
      stockValueMissingCost++;
    }
  }
  const stockValueByCategory = Array.from(catValueMap.entries())
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);

  return {
    totalRevenue, totalOrders, totalProducts, lowStockCount, pendingOrders,
    revenueByDay, ordersByStatus, topProducts, revenueByCategory,
    stockValue: Math.round(stockValue),
    stockValueByCategory,
    stockValueMissingCost,
  };
}

// ─── Product Analytics ────────────────────────────────────────────────────────

// Seasonal demand multipliers (Jan=0 … Dec=11) for a candle/craft supply business.
// Higher values = higher than average demand that month.
export const SEASONAL_MULTIPLIERS = [
  0.85, // Jan — post-holiday
  0.90, // Feb
  0.95, // Mar
  1.05, // Apr — Sinhala New Year
  0.95, // May
  0.90, // Jun
  0.95, // Jul
  1.00, // Aug
  1.05, // Sep
  1.10, // Oct
  1.30, // Nov — holiday gifting starts
  1.40, // Dec — Christmas / New Year peak
];

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Convert a cart item to its equivalent quantity in base units (grams, ml, or raw count). */
function itemBaseQty(item: CartItem): number {
  if (item.tierBase) return item.quantity * item.tierBase;
  // Parse unit strings like "250g", "1 kg+", "50ml", "1 L"
  const m = item.unit.match(/^([\d.]+)\s*(g|ml|kg|L)\+?$/i);
  if (m) {
    const n = parseFloat(m[1]);
    const u = m[2].toLowerCase();
    if (u === 'kg') return item.quantity * n * 1000;
    if (u === 'l')  return item.quantity * n * 1000;
    return item.quantity * n;
  }
  return item.quantity;
}

/** Weighted prediction for next month using last-3-months data + seasonal adjustment. */
function predictNextMonthQty(monthlyData: { qty: number; month: string }[], nextMonthIdx: number): number {
  const withData = monthlyData.filter(m => m.qty > 0);
  if (withData.length === 0) return 0;

  const recent = withData.slice(-3);
  // Weights: most recent = 50%, middle = 30%, oldest = 20%
  const rawWeights = [0.5, 0.3, 0.2].slice(0, recent.length).reverse();
  const wSum = rawWeights.reduce((a, b) => a + b, 0);
  const weightedAvg = recent.reduce((s, m, i) => s + m.qty * rawWeights[i] / wSum, 0);

  // De-seasonalise based on last data month, then re-apply next month's multiplier
  const lastMonthIdx = new Date(recent[recent.length - 1].month + '-01').getMonth();
  const baserate = SEASONAL_MULTIPLIERS[lastMonthIdx] > 0
    ? weightedAvg / SEASONAL_MULTIPLIERS[lastMonthIdx]
    : weightedAvg;
  return Math.ceil(baserate * SEASONAL_MULTIPLIERS[nextMonthIdx]);
}

export interface ProductMonthlyStats {
  productId: string;
  name: string;
  category: string;
  unit: string;
  displayUnit: string;  // "kg" for wax, "ml" for oils, natural unit for simple
  isTiered: boolean;
  currentStock: number;
  monthlyData: { month: string; label: string; qty: number; revenue: number }[];
  totalQty: number;
  totalRevenue: number;
  avgMonthlySales: number;
  predictedNextMonth: number;
  nextMonthLabel: string;
  stockCoverage: number; // months of stock at predicted rate
  stockStatus: 'sufficient' | 'order-soon' | 'critical';
}

export async function getProductAnalytics(lookbackMonths = 6): Promise<ProductMonthlyStats[]> {
  const [orders, products] = await Promise.all([adminGetAllOrders(), adminGetAllProducts()]);
  const active = orders.filter(o => o.status !== 'cancelled');

  const now = new Date();
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthIdx = nextMonthDate.getMonth();
  const nextMonthLabel = nextMonthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Build ordered list of month keys and short labels
  const months: string[] = [];
  const monthLabels: string[] = [];
  for (let i = lookbackMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 7));
    monthLabels.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
  }

  // Aggregate per product per month
  const productMonthMap = new Map<string, Map<string, { qty: number; revenue: number }>>();

  for (const order of active) {
    const orderMonth = (order.createdAt as string)?.slice(0, 7);
    if (!orderMonth || !months.includes(orderMonth)) continue;
    for (const item of order.items) {
      if (!productMonthMap.has(item.productId)) {
        productMonthMap.set(item.productId, new Map(months.map(m => [m, { qty: 0, revenue: 0 }])));
      }
      const mm = productMonthMap.get(item.productId)!;
      const cur = mm.get(orderMonth) ?? { qty: 0, revenue: 0 };
      cur.qty += itemBaseQty(item);
      cur.revenue += item.price * item.quantity;
      mm.set(orderMonth, cur);
    }
  }

  const result: ProductMonthlyStats[] = [];

  for (const product of products) {
    const mm = productMonthMap.get(product.id);
    if (!mm) continue;

    const monthlyData = months.map((m, idx) => ({
      month: m,
      label: monthLabels[idx],
      qty: mm.get(m)?.qty ?? 0,
      revenue: mm.get(m)?.revenue ?? 0,
    }));

    const totalQty = monthlyData.reduce((s, x) => s + x.qty, 0);
    const totalRevenue = monthlyData.reduce((s, x) => s + x.revenue, 0);
    if (totalQty === 0) continue;

    const isTiered = Boolean(product.priceTiers?.length);
    const bulkTier = product.priceTiers?.find(t => t.isBulk);
    const displayUnit = isTiered
      ? (bulkTier?.inputUnit ?? product.priceTiers![0].inputUnit)
      : product.unit;

    const avgMonthlySales = totalQty / lookbackMonths;
    const predicted = predictNextMonthQty(monthlyData, nextMonthIdx);
    const stockCoverage = predicted > 0 ? product.stock / predicted : 99;
    const stockStatus: ProductMonthlyStats['stockStatus'] =
      stockCoverage >= 2 ? 'sufficient' : stockCoverage >= 1 ? 'order-soon' : 'critical';

    result.push({
      productId: product.id, name: product.name, category: product.category,
      unit: product.unit, displayUnit, isTiered,
      currentStock: product.stock, monthlyData,
      totalQty, totalRevenue, avgMonthlySales,
      predictedNextMonth: predicted, nextMonthLabel,
      stockCoverage, stockStatus,
    });
  }

  return result.sort((a, b) => b.totalRevenue - a.totalRevenue);
}

// ─── Purchases ────────────────────────────────────────────────────────────────

const PURCHASES_KEY = 'ch_mock_purchases';
const SETTLEMENTS_KEY = 'ch_mock_settlements';
const PURCHASES_SEEDED_KEY = 'ch_purchases_seeded';

function generatePurchaseNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `PO-${ts}-${rand}`;
}

/** Returns cost per base stock unit (per g, per ml, or per piece). */
function baseCostRate(product: Product): number {
  if (product.priceTiers?.length) {
    const t = product.priceTiers[0];
    return (t.price / t.qty) * 0.40;
  }
  return product.price * 0.40;
}

/** Seed sample purchase history and set averageCost on all products. Runs once. */
function seedMockPurchasesIfNeeded(): void {
  if (localStorage.getItem(PURCHASES_SEEDED_KEY)) return;

  const products = initMockProducts();

  // Set averageCost ≈ 40% of base selling rate for every product
  const withCosts = products.map(p => ({
    ...p,
    averageCost: parseFloat(baseCostRate(p).toFixed(4)),
  }));
  saveMockProducts(withCosts);

  const productMap = new Map(withCosts.map(p => [p.id, p]));
  const regular = withCosts.filter(p => !p.isPackaging);
  const pkg = withCosts.filter(p => p.isPackaging);

  type SeedLine = { productId: string; qty: number; pct: number };
  type SeedDef = { daysAgo: number; supplier: string; lines: SeedLine[] };

  function linesFor(cat: string, qty: number, pct: number, limit = 99): SeedLine[] {
    return regular.filter(p => p.category === cat).slice(0, limit).map(p => ({ productId: p.id, qty, pct }));
  }

  const seeds: SeedDef[] = [
    { daysAgo: 130, supplier: 'Lanka Wax Imports',  lines: linesFor('wax', 5000, 0.38, 2) },
    { daysAgo: 100, supplier: 'Fragrance World',    lines: linesFor('fragrance', 300, 0.40, 3) },
    { daysAgo: 80,  supplier: 'Craft Supplies LK',  lines: [...linesFor('wicks', 100, 0.42, 2), ...linesFor('dye', 50, 0.40, 1)] },
    { daysAgo: 60,  supplier: 'Lanka Wax Imports',  lines: linesFor('wax', 8000, 0.36) },
    { daysAgo: 45,  supplier: 'Glass & More',       lines: linesFor('molds', 30, 0.50, 2) },
    { daysAgo: 28,  supplier: 'Fragrance World',    lines: linesFor('fragrance', 200, 0.38, 4) },
    { daysAgo: 14,  supplier: 'Craft Supplies LK',  lines: linesFor('tools', 10, 0.55, 2) },
    { daysAgo: 7,   supplier: 'Box & Pack',         lines: pkg.map(p => ({ productId: p.id, qty: 100, pct: 0.60 })) },
  ];

  const now = new Date();
  const purchases: Purchase[] = [];

  seeds.forEach((seed, idx) => {
    const validLines = seed.lines.filter(l => productMap.has(l.productId));
    if (!validLines.length) return;

    const date = new Date(now);
    date.setDate(date.getDate() - seed.daysAgo);

    const items: PurchaseItem[] = validLines.map(l => {
      const p = productMap.get(l.productId)!;
      const unit = p.priceTiers?.length ? p.priceTiers[0].inputUnit : p.unit;
      const costPerUnit = parseFloat((baseCostRate(p) * (l.pct / 0.40)).toFixed(4));
      return {
        productId: l.productId,
        name: p.name,
        quantity: l.qty,
        unit,
        costPerUnit,
        totalCost: parseFloat((l.qty * costPerUnit).toFixed(2)),
      };
    });

    purchases.push({
      id: `po-seed-${idx}`,
      purchaseNumber: `PO-SEED-${String(idx + 1).padStart(3, '0')}`,
      date: date.toISOString().slice(0, 10),
      items,
      totalCost: parseFloat(items.reduce((s, i) => s + i.totalCost, 0).toFixed(2)),
      supplier: seed.supplier,
      createdAt: date.toISOString(),
    });
  });

  localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases));
  localStorage.setItem(PURCHASES_SEEDED_KEY, 'true');
}

export async function adminGetAllPurchases(): Promise<Purchase[]> {
  if (USE_MOCK) {
    seedMockPurchasesIfNeeded();
    const raw = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? '[]') as Purchase[];
    return raw.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const snap = await getDocs(query(collection(db, 'purchases'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Purchase));
}

export async function adminRecordPurchase(
  purchase: Omit<Purchase, 'id' | 'purchaseNumber' | 'createdAt'>,
): Promise<string> {
  const purchaseNumber = generatePurchaseNumber();

  if (USE_MOCK) {
    const products = initMockProducts();

    for (const item of purchase.items) {
      const idx = products.findIndex(p => p.id === item.productId);
      if (idx === -1) continue;
      const p = products[idx];
      const baseQty  = toBaseUnits(item.quantity, item.unit);
      const baseCost = toBaseCost(item.costPerUnit, item.unit);
      const currentCost = p.averageCost ?? baseCost;
      const newAvgCost = p.stock > 0
        ? (p.stock * currentCost + baseQty * baseCost) / (p.stock + baseQty)
        : baseCost;
      products[idx] = { ...p, stock: p.stock + baseQty, averageCost: parseFloat(newAvgCost.toFixed(4)) };
    }

    saveMockProducts(products);

    const existing = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? '[]');
    const newPurchase: Purchase = {
      ...purchase,
      id: `po-${Date.now()}`,
      purchaseNumber,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(PURCHASES_KEY, JSON.stringify([newPurchase, ...existing]));
    return purchaseNumber;
  }

  await addDoc(collection(db, 'purchases'), { ...purchase, purchaseNumber, createdAt: serverTimestamp() });

  // Update stock + WAC for each purchased item
  for (const item of purchase.items) {
    const productRef = doc(db, 'products', item.productId);
    const snap = await getDoc(productRef);
    if (!snap.exists()) continue;
    const p = snap.data() as Product;
    const baseQty  = toBaseUnits(item.quantity, item.unit);
    const baseCost = toBaseCost(item.costPerUnit, item.unit);
    const currentCost = p.averageCost ?? baseCost;
    const newAvgCost = p.stock > 0
      ? (p.stock * currentCost + baseQty * baseCost) / (p.stock + baseQty)
      : baseCost;
    await updateDoc(productRef, { stock: increment(baseQty), averageCost: parseFloat(newAvgCost.toFixed(4)) });
  }

  return purchaseNumber;
}

// ─── Profit Analytics ─────────────────────────────────────────────────────────

export interface ProfitAnalytics {
  totalPurchaseCost: number;
  totalCOGS: number;
  totalRevenue: number;
  totalProfit: number;
  profitMargin: number;             // percentage
  profitByDay: { date: string; revenue: number; cogs: number; profit: number }[];
  purchasesByDay: { date: string; cost: number }[];
  profitByCategory: { category: string; revenue: number; cogs: number; profit: number }[];
}

function orderItemCOGS(item: CartItem, productMap: Map<string, Product>): number {
  const p = productMap.get(item.productId);
  const cost = p?.averageCost ?? (p?.price ?? item.price) * 0.40;
  const baseUnits = item.tierBase ? item.quantity * item.tierBase : item.quantity;
  return baseUnits * cost;
}

export async function getProfitAnalytics(): Promise<ProfitAnalytics> {
  const [orders, products, purchases] = await Promise.all([
    adminGetAllOrders(),
    adminGetAllProducts(),
    adminGetAllPurchases(),
  ]);

  const active = orders.filter(o => o.status !== 'cancelled');
  const productMap = new Map(products.map(p => [p.id, p]));

  let totalCOGS = 0;
  let totalRevenue = 0;
  for (const order of active) {
    totalRevenue += order.total;
    for (const item of order.items)           totalCOGS += orderItemCOGS(item, productMap);
    for (const item of order.packagingItems ?? []) totalCOGS += orderItemCOGS(item, productMap);
  }

  const totalProfit = totalRevenue - totalCOGS;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const totalPurchaseCost = purchases.reduce((s, p) => s + p.totalCost, 0);

  // By day — last 30 days
  const now = new Date();
  const dayMap = new Map<string, { revenue: number; cogs: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    dayMap.set(d.toISOString().slice(0, 10), { revenue: 0, cogs: 0 });
  }
  for (const order of active) {
    const day = (order.createdAt as string)?.slice(0, 10);
    if (!day || !dayMap.has(day)) continue;
    const cur = dayMap.get(day)!;
    cur.revenue += order.total;
    for (const item of order.items)               cur.cogs += orderItemCOGS(item, productMap);
    for (const item of order.packagingItems ?? []) cur.cogs += orderItemCOGS(item, productMap);
  }
  const profitByDay = Array.from(dayMap.entries()).map(([date, { revenue, cogs }]) => ({
    date, revenue: Math.round(revenue), cogs: Math.round(cogs), profit: Math.round(revenue - cogs),
  }));

  // Purchases by day — last 30 days
  const purchDayMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    purchDayMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of purchases) {
    if (purchDayMap.has(p.date)) purchDayMap.set(p.date, (purchDayMap.get(p.date) ?? 0) + p.totalCost);
  }
  const purchasesByDay = Array.from(purchDayMap.entries()).map(([date, cost]) => ({ date, cost: Math.round(cost) }));

  // By category
  const catMap = new Map<string, { revenue: number; cogs: number }>();
  for (const order of active) {
    for (const item of order.items) {
      const cat = productMap.get(item.productId)?.category ?? 'other';
      const cur = catMap.get(cat) ?? { revenue: 0, cogs: 0 };
      cur.revenue += item.price * item.quantity;
      cur.cogs += orderItemCOGS(item, productMap);
      catMap.set(cat, cur);
    }
  }
  const profitByCategory = Array.from(catMap.entries())
    .map(([category, { revenue, cogs }]) => ({
      category,
      revenue: Math.round(revenue),
      cogs: Math.round(cogs),
      profit: Math.round(revenue - cogs),
    }))
    .sort((a, b) => b.profit - a.profit);

  return {
    totalPurchaseCost: Math.round(totalPurchaseCost),
    totalCOGS: Math.round(totalCOGS),
    totalRevenue: Math.round(totalRevenue),
    totalProfit: Math.round(totalProfit),
    profitMargin: parseFloat(profitMargin.toFixed(1)),
    profitByDay,
    purchasesByDay,
    profitByCategory,
  };
}

// Convert purchase display qty/cost to base units (g/ml).
// Purchases are entered in human-friendly units (kg, L) but stock is in base units (g, ml).
function toBaseUnits(qty: number, unit: string): number {
  return (unit === 'kg' || unit === 'L') ? qty * 1000 : qty;
}
function toBaseCost(costPerUnit: number, unit: string): number {
  return (unit === 'kg' || unit === 'L') ? costPerUnit / 1000 : costPerUnit;
}

// ─── Purchase edit / delete ───────────────────────────────────────────────────

/** Edit a purchase: reverses old stock, then applies new stock + WAC update. */
export async function adminUpdatePurchase(
  purchaseId: string,
  updated: Omit<Purchase, 'id' | 'purchaseNumber' | 'createdAt'>,
): Promise<void> {
  if (USE_MOCK) {
    const purchases = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? '[]') as Purchase[];
    const old = purchases.find(p => p.id === purchaseId);
    if (!old) return;

    const products = initMockProducts();

    // Step 1 – reverse old items (decrease stock; floor at 0)
    for (const item of old.items) {
      const idx = products.findIndex(p => p.id === item.productId);
      if (idx !== -1) {
        const baseQty = toBaseUnits(item.quantity, item.unit);
        products[idx] = { ...products[idx], stock: Math.max(0, products[idx].stock - baseQty) };
      }
    }

    // Step 2 – apply new items (increase stock + WAC)
    for (const item of updated.items) {
      const idx = products.findIndex(p => p.id === item.productId);
      if (idx === -1) continue;
      const p = products[idx];
      const baseQty  = toBaseUnits(item.quantity, item.unit);
      const baseCost = toBaseCost(item.costPerUnit, item.unit);
      const currentCost = p.averageCost ?? baseCost;
      const newAvgCost = p.stock > 0
        ? (p.stock * currentCost + baseQty * baseCost) / (p.stock + baseQty)
        : baseCost;
      products[idx] = { ...p, stock: p.stock + baseQty, averageCost: parseFloat(newAvgCost.toFixed(4)) };
    }

    saveMockProducts(products);
    localStorage.setItem(
      PURCHASES_KEY,
      JSON.stringify(purchases.map(p => p.id !== purchaseId ? p : { ...p, ...updated })),
    );
    return;
  }

  // Firebase: reverse old stock, apply new stock + WAC, update document
  const oldSnap = await getDoc(doc(db, 'purchases', purchaseId));
  if (oldSnap.exists()) {
    const old = oldSnap.data() as Purchase;
    for (const item of old.items) {
      const baseQty = toBaseUnits(item.quantity, item.unit);
      await updateDoc(doc(db, 'products', item.productId), { stock: increment(-baseQty) });
    }
  }
  for (const item of updated.items) {
    const productRef = doc(db, 'products', item.productId);
    const snap = await getDoc(productRef);
    if (!snap.exists()) continue;
    const p = snap.data() as Product;
    const baseQty  = toBaseUnits(item.quantity, item.unit);
    const baseCost = toBaseCost(item.costPerUnit, item.unit);
    const currentCost = p.averageCost ?? baseCost;
    const newAvgCost = p.stock > 0
      ? (p.stock * currentCost + baseQty * baseCost) / (p.stock + baseQty)
      : baseCost;
    await updateDoc(productRef, { stock: increment(baseQty), averageCost: parseFloat(newAvgCost.toFixed(4)) });
  }
  await updateDoc(doc(db, 'purchases', purchaseId), { ...updated });
}

/** Delete a purchase: reverses its stock contribution. WAC stays as-is (conservative). */
export async function adminDeletePurchase(purchaseId: string): Promise<void> {
  if (USE_MOCK) {
    const purchases = JSON.parse(localStorage.getItem(PURCHASES_KEY) ?? '[]') as Purchase[];
    const purchase = purchases.find(p => p.id === purchaseId);
    if (purchase) {
      const products = initMockProducts();
      for (const item of purchase.items) {
        const idx = products.findIndex(p => p.id === item.productId);
        if (idx !== -1) {
          const baseQty = toBaseUnits(item.quantity, item.unit);
          products[idx] = { ...products[idx], stock: Math.max(0, products[idx].stock - baseQty) };
        }
      }
      saveMockProducts(products);
    }
    localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases.filter(p => p.id !== purchaseId)));
    return;
  }
  const snap = await getDoc(doc(db, 'purchases', purchaseId));
  if (snap.exists()) {
    const purchase = snap.data() as Purchase;
    for (const item of purchase.items) {
      const baseQty = toBaseUnits(item.quantity, item.unit);
      await updateDoc(doc(db, 'products', item.productId), { stock: increment(-baseQty) });
    }
  }
  await deleteDoc(doc(db, 'purchases', purchaseId));
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

const SUPPLIERS_KEY = 'ch_mock_suppliers';
const SUPPLIERS_SEEDED_KEY = 'ch_suppliers_seeded';

function seedMockSuppliersIfNeeded(): void {
  if (localStorage.getItem(SUPPLIERS_SEEDED_KEY)) return;
  const seeds: Supplier[] = [
    { id: 'sup-1', name: 'Lanka Wax Imports',  phone: '0112345678', notes: 'Main wax supplier' },
    { id: 'sup-2', name: 'Fragrance World',     phone: '0119876543', notes: 'Essential oils & fragrances' },
    { id: 'sup-3', name: 'Craft Supplies LK',   phone: '0114567890' },
    { id: 'sup-4', name: 'Glass & More',        phone: '0117654321', notes: 'Glass containers & jars' },
    { id: 'sup-5', name: 'Box & Pack',          phone: '0112233445', notes: 'Packaging materials' },
  ];
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(seeds));
  localStorage.setItem(SUPPLIERS_SEEDED_KEY, 'true');
}

export async function adminGetAllSuppliers(): Promise<Supplier[]> {
  if (USE_MOCK) {
    seedMockSuppliersIfNeeded();
    return JSON.parse(localStorage.getItem(SUPPLIERS_KEY) ?? '[]') as Supplier[];
  }
  const snap = await getDocs(query(collection(db, 'suppliers'), orderBy('name')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
}

export async function adminSaveSupplier(supplier: Omit<Supplier, 'id'> & { id?: string }): Promise<Supplier> {
  if (USE_MOCK) {
    const list = JSON.parse(localStorage.getItem(SUPPLIERS_KEY) ?? '[]') as Supplier[];
    if (supplier.id) {
      const updated = list.map(s => s.id === supplier.id ? ({ ...supplier, id: supplier.id } as Supplier) : s);
      localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(updated));
      return supplier as Supplier;
    }
    const created: Supplier = { ...supplier, id: `sup-${Date.now()}` };
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify([...list, created]));
    return created;
  }
  if (supplier.id) {
    await updateDoc(doc(db, 'suppliers', supplier.id), { ...supplier });
    return supplier as Supplier;
  }
  const ref = await addDoc(collection(db, 'suppliers'), supplier);
  return { ...supplier, id: ref.id };
}

export async function adminDeleteSupplier(id: string): Promise<void> {
  if (USE_MOCK) {
    const list = JSON.parse(localStorage.getItem(SUPPLIERS_KEY) ?? '[]') as Supplier[];
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(list.filter(s => s.id !== id)));
    return;
  }
  await deleteDoc(doc(db, 'suppliers', id));
}

// ─── Per-order profit ─────────────────────────────────────────────────────────

export interface OrderProfitBreakdown {
  itemBreakdown: { name: string; unit: string; quantity: number; revenue: number; cogs: number; profit: number }[];
  packagingBreakdown: { name: string; unit: string; quantity: number; cogs: number }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  totalCOGS: number;
  grossProfit: number;
  profitMargin: number;
}

// ─── Monthly stats ────────────────────────────────────────────────────────────

export interface MonthlyStats {
  month: string;       // YYYY-MM
  label: string;       // "Jun 25"
  orders: number;      // non-cancelled orders
  revenue: number;
  cogs: number;
  profit: number;
  profitMargin: number;
  purchaseCost: number;
}

export async function getMonthlyStats(lookbackMonths = 12): Promise<MonthlyStats[]> {
  const [orders, products, purchases] = await Promise.all([
    adminGetAllOrders(),
    adminGetAllProducts(),
    adminGetAllPurchases(),
  ]);

  const active = orders.filter(o => o.status !== 'cancelled');
  const productMap = new Map(products.map(p => [p.id, p]));

  const now = new Date();
  const months: { key: string; label: string }[] = [];
  for (let i = lookbackMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) });
  }

  const monthMap = new Map<string, { orders: number; revenue: number; cogs: number; purchaseCost: number }>();
  for (const m of months) monthMap.set(m.key, { orders: 0, revenue: 0, cogs: 0, purchaseCost: 0 });

  for (const order of active) {
    const month = (order.createdAt as string)?.slice(0, 7);
    if (!month || !monthMap.has(month)) continue;
    const cur = monthMap.get(month)!;
    cur.orders++;
    cur.revenue += order.total;
    for (const item of order.items)               cur.cogs += orderItemCOGS(item, productMap);
    for (const item of order.packagingItems ?? []) cur.cogs += orderItemCOGS(item, productMap);
  }

  for (const purchase of purchases) {
    const month = purchase.date.slice(0, 7);
    if (monthMap.has(month)) monthMap.get(month)!.purchaseCost += purchase.totalCost;
  }

  return months.map(m => {
    const d = monthMap.get(m.key)!;
    const profit = d.revenue - d.cogs;
    const profitMargin = d.revenue > 0 ? (profit / d.revenue) * 100 : 0;
    return {
      month: m.key, label: m.label, orders: d.orders,
      revenue: Math.round(d.revenue), cogs: Math.round(d.cogs),
      profit: Math.round(profit), profitMargin: parseFloat(profitMargin.toFixed(1)),
      purchaseCost: Math.round(d.purchaseCost),
    };
  });
}

export async function getOrderProfitBreakdown(order: AdminOrder): Promise<OrderProfitBreakdown> {
  const products = await adminGetAllProducts();
  const productMap = new Map(products.map(p => [p.id, p]));

  const itemBreakdown = order.items.map(item => {
    const p = productMap.get(item.productId);
    const cost = p?.averageCost ?? (p?.price ?? item.price) * 0.40;
    const baseUnits = item.tierBase ? item.quantity * item.tierBase : item.quantity;
    const cogs = baseUnits * cost;
    const revenue = item.price * item.quantity;
    return {
      name: item.name, unit: item.unit, quantity: item.quantity,
      revenue: Math.round(revenue), cogs: Math.round(cogs), profit: Math.round(revenue - cogs),
    };
  });

  const packagingBreakdown = (order.packagingItems ?? []).map(item => {
    const p = productMap.get(item.productId);
    const cost = p?.averageCost ?? (p?.price ?? item.price) * 0.40;
    const baseUnits = item.tierBase ? item.quantity * item.tierBase : item.quantity;
    return { name: item.name, unit: item.unit, quantity: item.quantity, cogs: Math.round(baseUnits * cost) };
  });

  const totalCOGS = [...itemBreakdown.map(i => i.cogs), ...packagingBreakdown.map(i => i.cogs)].reduce((s, v) => s + v, 0);
  const subtotal = Math.round(order.subtotal ?? order.items.reduce((s, i) => s + i.price * i.quantity, 0));
  const deliveryFee = Math.round(order.deliveryFee ?? 0);
  const discount = Math.round(order.promoDiscount ?? 0);
  const grossProfit = order.total - totalCOGS;
  const profitMargin = order.total > 0 ? (grossProfit / order.total) * 100 : 0;

  return {
    itemBreakdown, packagingBreakdown,
    subtotal, deliveryFee, discount,
    total: Math.round(order.total),
    totalCOGS,
    grossProfit: Math.round(grossProfit),
    profitMargin: parseFloat(profitMargin.toFixed(1)),
  };
}

// ─── Settlements ──────────────────────────────────────────────────────────────

export async function adminGetAllSettlements(): Promise<Settlement[]> {
  if (USE_MOCK) {
    const raw = JSON.parse(localStorage.getItem(SETTLEMENTS_KEY) ?? '[]') as Settlement[];
    return raw.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const snap = await getDocs(query(collection(db, 'settlements'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Settlement));
}

export async function adminRecordPayment(orderId: string, paymentInfo: PaymentInfo): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(
      orders.map(o => o.id === orderId ? { ...o, paymentStatus: 'paid', paymentInfo } : o)
    ));
    return;
  }
  await updateDoc(doc(db, 'orders', orderId), { paymentStatus: 'paid', paymentInfo });
}

export async function adminMarkOrderUnpaid(orderId: string): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(
      orders.map(o => {
        if (o.id !== orderId) return o;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { paymentStatus: _ps, paymentInfo: _pi, ...rest } = o;
        return rest as AdminOrder;
      })
    ));
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateDoc(doc(db, 'orders', orderId), { paymentStatus: deleteField(), paymentInfo: deleteField() } as any);
}

/** Create a new courier invoice settlement (without linking orders — orders assigned separately). */
export async function adminCreateCourierInvoice(
  reference: string,
  date: string,
  totalAmount: number,
  courierName?: string,
  notes?: string,
): Promise<string> {
  const settlement: Omit<Settlement, 'id'> = {
    type: 'courier_invoice',
    reference,
    date,
    totalAmount,
    courierName,
    notes,
    isCompleted: false,
    createdAt: new Date().toISOString(),
  };

  if (USE_MOCK) {
    const id = `SI-${Date.now()}`;
    const existing = JSON.parse(localStorage.getItem(SETTLEMENTS_KEY) ?? '[]') as Settlement[];
    localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify([{ ...settlement, id }, ...existing]));
    return id;
  }

  const ref = await addDoc(collection(db, 'settlements'), settlement);
  await updateDoc(ref, { id: ref.id });
  return ref.id;
}

/** Get all orders assigned to a specific courier invoice. */
export async function adminGetOrdersByInvoiceId(invoiceId: string): Promise<AdminOrder[]> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    return orders.filter(o => o.courierInvoice?.invoiceId === invoiceId);
  }
  const snap = await getDocs(query(collection(db, 'orders'), where('courierInvoice.invoiceId', '==', invoiceId)));
  return snap.docs.map(d => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.()?.toISOString() ?? data.createdAt } as AdminOrder;
  });
}

/** Assign an order to a courier invoice with the actual shipping fee charged by courier. */
export async function adminAssignOrderToInvoice(
  orderId: string,
  assignment: CourierAssignment,
): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(
      orders.map(o => o.id === orderId ? { ...o, courierInvoice: assignment } : o)
    ));
    return;
  }
  await updateDoc(doc(db, 'orders', orderId), { courierInvoice: assignment });
}

/** Remove courier invoice assignment from an order. */
export async function adminUnassignOrderFromInvoice(orderId: string): Promise<void> {
  if (USE_MOCK) {
    const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) ?? '[]') as AdminOrder[];
    localStorage.setItem(ORDERS_KEY, JSON.stringify(
      orders.map(o => {
        if (o.id !== orderId) return o;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { courierInvoice: _ci, ...rest } = o;
        return rest as AdminOrder;
      })
    ));
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await updateDoc(doc(db, 'orders', orderId), { courierInvoice: deleteField() } as any);
}

/** Toggle completion status of a courier invoice. */
export async function adminMarkInvoiceCompleted(invoiceId: string, isCompleted: boolean): Promise<void> {
  if (USE_MOCK) {
    const list = JSON.parse(localStorage.getItem(SETTLEMENTS_KEY) ?? '[]') as Settlement[];
    localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(
      list.map(s => s.id === invoiceId ? { ...s, isCompleted } : s)
    ));
    return;
  }
  await updateDoc(doc(db, 'settlements', invoiceId), { isCompleted });
}

/** Get all open (not completed) courier invoices — used for assigning orders. */
export async function adminGetOpenCourierInvoices(): Promise<Settlement[]> {
  if (USE_MOCK) {
    const list = JSON.parse(localStorage.getItem(SETTLEMENTS_KEY) ?? '[]') as Settlement[];
    return list.filter(s => s.type === 'courier_invoice' && !s.isCompleted);
  }
  const snap = await getDocs(query(
    collection(db, 'settlements'),
    where('type', '==', 'courier_invoice'),
    where('isCompleted', '==', false),
    orderBy('date', 'desc'),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Settlement));
}

/** Update invoice received amount. */
export async function adminUpdateInvoiceAmount(invoiceId: string, totalAmount: number): Promise<void> {
  if (USE_MOCK) {
    const list = JSON.parse(localStorage.getItem(SETTLEMENTS_KEY) ?? '[]') as Settlement[];
    localStorage.setItem(SETTLEMENTS_KEY, JSON.stringify(
      list.map(s => s.id === invoiceId ? { ...s, totalAmount } : s)
    ));
    return;
  }
  await updateDoc(doc(db, 'settlements', invoiceId), { totalAmount });
}
