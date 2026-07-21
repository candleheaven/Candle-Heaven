const TOKEN = import.meta.env.VITE_CURFOX_TOKEN as string;
const BASE = 'https://v2-operations.api.curfox.com/api';
const TENANT = 'royalexpress';
const COURIER_NAME = 'Royal Express';

// ─── Tracking ─────────────────────────────────────────────────────────────────

export interface TrackingEvent {
  description: string;    // human-readable status name
  dateTimeAgo: string;    // e.g. "20 hours ago"
  dateFormatted: string;  // e.g. "Jun 18, 2026 · 09:22"
  extraInfo: string;      // e.g. "Received Branch: Ampara"
  performedBy: string;    // staff member name
  color: string;          // hex colour from the API
}

export interface TrackingInfo {
  waybillNumber: string;
  courierName: string;
  currentStatus: string;
  currentColor: string;
  recipientName?: string;
  weight?: number;
  events: TrackingEvent[];
}

function toTitleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatIso(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch {
    return iso;
  }
}

// Accepted response shape:
// { data: { timeline: [{ status: { name, color }, date_time, date_time_ago, user, proofs, ...extra }], order: { ... } } }
function parseTracking(waybillNumber: string, raw: unknown): TrackingInfo {
  const data = ((raw as Record<string, unknown>)?.data ?? {}) as Record<string, unknown>;
  const timeline = Array.isArray(data?.timeline) ? (data.timeline as Record<string, unknown>[]) : [];
  const order = (data?.order ?? {}) as Record<string, unknown>;

  // Keys that are not metadata — everything else is extra event info
  const META_KEYS = new Set(['status', 'date_time', 'date_time_ago', 'user', 'proofs']);

  const events: TrackingEvent[] = timeline.map(ev => {
    const statusObj = (ev.status ?? {}) as Record<string, unknown>;
    const rawName = String(statusObj.name ?? '');
    const color = String(statusObj.color ?? '#9E9E9E');
    const description = rawName.split(' ').map(toTitleCase).join(' ');

    const user = (ev.user ?? {}) as Record<string, unknown>;
    const performedBy = [user.first_name, user.last_name].filter(Boolean).join(' ');

    const extraParts = Object.entries(ev)
      .filter(([k]) => !META_KEYS.has(k))
      .map(([k, v]) => `${k}: ${v}`);

    return {
      description,
      dateTimeAgo: String(ev.date_time_ago ?? ''),
      dateFormatted: ev.date_time ? formatIso(String(ev.date_time)) : '',
      extraInfo: extraParts.join(' · '),
      performedBy,
      color,
    };
  });

  const first = events[0];
  return {
    waybillNumber,
    courierName: COURIER_NAME,
    currentStatus: first?.description ?? 'Unknown',
    currentColor: first?.color ?? '#9E9E9E',
    recipientName: order.customer_name ? String(order.customer_name) : undefined,
    weight: order.weight != null ? Number(order.weight) : undefined,
    events,
  };
}

export async function trackShipment(waybillNumber: string): Promise<TrackingInfo> {
  const res = await fetch(`${BASE}/public/order/tracking-info`, {
    method: 'POST',
    headers: { 'X-tenant': TENANT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ waybill_number: waybillNumber }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as Record<string, unknown>)?.message;
    throw new Error(msg ? String(msg) : `Tracking request failed (${res.status})`);
  }

  return parseTracking(waybillNumber, data);
}

// ─── Courier Order Creation ────────────────────────────────────────────────────

const MERCHANT_BUSINESS_ID = '7650';
const ORIGIN_CITY_ID = '1500';
const PICKUP_ADDRESS_ID = '7984';

export interface CourierOrderInput {
  orderNo: string;
  waybillNumber?: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  customerSecondaryPhone?: string;
  destinationCityName: string;
  destinationStateName: string;
  cod: number;
  description: string;
  weight: number;
  remark?: string;
}

export interface CourierOrderResult {
  waybillNumber: string;
  message: string;
}

export async function createCourierOrder(input: CourierOrderInput): Promise<CourierOrderResult> {
  const orderEntry: Record<string, unknown> = {
    order_no: input.orderNo,
    waybill_number: input.waybillNumber,
    customer_name: input.customerName,
    customer_address: input.customerAddress,
    customer_phone: input.customerPhone,
    customer_secondary_phone: input.customerSecondaryPhone ?? '',
    destination_city_name: input.destinationCityName,
    destination_state_name: input.destinationStateName,
    cod: input.cod,
    description: input.description,
    weight: input.weight,
    remark: input.remark ?? '',
  };

  const res = await fetch(`${BASE}/public/merchant/order/single`, {
    method: 'POST',
    headers: {
      'X-tenant': TENANT,
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      general_data: {
        merchant_business_id: MERCHANT_BUSINESS_ID,
        origin_city_id: ORIGIN_CITY_ID,
        pickup_address_id: PICKUP_ADDRESS_ID,
      },
      order_data: [orderEntry],
    }),
  });

  const data = await res.json().catch(() => ({}));

  // Always log the full response to console for debugging
  console.log('[Courier API] status:', res.status, 'response:', JSON.stringify(data, null, 2));

  if (!res.ok) {
    const msg = (data as Record<string, unknown>)?.message;
    throw new Error(msg ? String(msg) : `Courier order creation failed (${res.status})`);
  }

  // Response: { data: { waybill_number } } or { data: [{ waybill_number }] } or { data: { orders: [...] } }
  const raw = (data as Record<string, unknown>)?.data ?? {};
  const first = Array.isArray(raw) ? (raw[0] as Record<string, unknown>) : (raw as Record<string, unknown>);
  const nested = (first?.orders as Record<string, unknown>[] | undefined)?.[0] ?? first;
  const waybillNumber = String(nested?.waybill_number ?? first?.waybill_number ?? '');

  return {
    waybillNumber,
    message: String((data as Record<string, unknown>)?.message ?? 'Courier order created.'),
  };
}

// ─── Pickup Ticket ─────────────────────────────────────────────────────────────

export interface TicketResult {
  ticketId: string;
  message: string;
}

export async function createPickupTicket(
  subject: string,
  message: string,
): Promise<TicketResult> {
  const body = new FormData();
  body.append('ticket_type_id', '4');
  body.append('subject', subject);
  body.append('message', message);

  const res = await fetch(`${BASE}/merchant/ticket`, {
    method: 'POST',
    headers: { 'X-tenant': TENANT, Authorization: `Bearer ${TOKEN}` },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as Record<string, unknown>)?.message;
    throw new Error(msg ? String(msg) : `Ticket creation failed (${res.status})`);
  }

  const d = ((data as Record<string, unknown>)?.data ?? data) as Record<string, unknown>;
  return {
    ticketId: String(d?.id ?? d?.ticket_id ?? ''),
    message: String((data as Record<string, unknown>)?.message ?? 'Pickup ticket created.'),
  };
}
