"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewOrder = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
const TEXTLK_TOKEN = (0, params_1.defineSecret)('TEXTLK_TOKEN');
exports.onNewOrder = (0, firestore_1.onDocumentCreated)({ document: 'orders/{orderId}', secrets: [TEXTLK_TOKEN] }, async (event) => {
    const order = event.data?.data();
    if (!order || order.source !== 'web')
        return;
    const orderNumber = order.orderNumber ?? event.params.orderId;
    const customerName = order.customerName ?? order.customer?.name ?? 'Unknown';
    const total = order.total ?? 0;
    const itemCount = (order.items ?? []).length;
    const message = `New order ${orderNumber}\n` +
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
});
//# sourceMappingURL=index.js.map