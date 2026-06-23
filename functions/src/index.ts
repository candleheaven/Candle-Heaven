import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';

initializeApp();

const TEXTLK_TOKEN = defineSecret('TEXTLK_TOKEN');

export const onNewOrder = onDocumentCreated(
  { document: 'orders/{orderId}', secrets: [TEXTLK_TOKEN] },
  async (event) => {
    const order = event.data?.data();
    if (!order || order.source !== 'web') return;

    const orderNumber: string = order.orderNumber ?? event.params.orderId;
    const customerName: string = order.customerName ?? order.customer?.name ?? 'Unknown';
    const total: number = order.total ?? 0;
    const itemCount: number = (order.items ?? []).length;

    const message =
      `New order ${orderNumber}\n` +
      `${customerName} — LKR ${total.toLocaleString('en-US')}\n` +
      `${itemCount} item${itemCount !== 1 ? 's' : ''}`;

    await fetch('https://app.text.lk/api/v3/sms/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEXTLK_TOKEN.value()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        recipient: '94705320205',
        sender_id: 'TextLKDemo',
        type: 'plain',
        message,
      }),
    }).then(r => r.json()).then(res => {
      console.log('[SMS] sent for', orderNumber, JSON.stringify(res));
    }).catch(err => {
      console.error('[SMS] failed for', orderNumber, err);
    });
  }
);
