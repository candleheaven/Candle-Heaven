import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { Order, OrderStatus } from '../types';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || !import.meta.env.VITE_FIREBASE_PROJECT_ID;

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CH-${ts}-${rand}`;
}

export async function placeOrder(order: Omit<Order, 'id' | 'orderNumber' | 'createdAt'>): Promise<string> {
  const orderNumber = generateOrderNumber();

  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 800));
    const mock = { ...order, orderNumber, status: 'pending', createdAt: new Date().toISOString() };
    const existing = JSON.parse(localStorage.getItem('ch_dev_orders') ?? '[]');
    localStorage.setItem('ch_dev_orders', JSON.stringify([...existing, mock]));
    return orderNumber;
  }

  await addDoc(collection(db, 'orders'), {
    ...order,
    orderNumber,
    status: 'pending',
    source: 'web',
    createdAt: serverTimestamp(),
  });

  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderNumber,
      customerName: order.customer?.name,
      total: order.total,
      itemCount: order.items.length,
    }),
  }).catch(() => {});

  return orderNumber;
}

export interface UserOrder extends Omit<Order, 'createdAt'> {
  orderNumber: string;
  createdAt: string;
}

export async function getMyOrders(userId: string): Promise<UserOrder[]> {
  if (USE_MOCK) {
    await new Promise(r => setTimeout(r, 300));
    const all = JSON.parse(localStorage.getItem('ch_dev_orders') ?? '[]') as (UserOrder & { userId?: string })[];
    return all
      .filter(o => o.userId === userId)
      .map((o, i) => ({
        ...o,
        orderNumber: o.orderNumber ?? `CH-UNKNOWN-${i}`,
        createdAt: o.createdAt ?? new Date().toISOString(),
        status: (o.status ?? 'pending') as OrderStatus,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const snap = await getDocs(
    query(collection(db, 'orders'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ ...d.data(), orderNumber: d.id } as UserOrder));
}
