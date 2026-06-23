import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { orderNumber, customerName, total, itemCount } = req.body ?? {};

  const message =
    `New order ${orderNumber ?? 'unknown'}\n` +
    `${customerName ?? 'Unknown'} — LKR ${Number(total ?? 0).toLocaleString('en-US')}\n` +
    `${itemCount ?? 0} item${itemCount !== 1 ? 's' : ''}`;

  const smsRes = await fetch('https://app.text.lk/api/v3/sms/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TEXTLK_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      recipient: '94705320205',
      sender_id: 'TextLKDemo',
      type: 'plain',
      message,
    }),
  });

  const data = await smsRes.json();
  console.log('[notify] SMS response:', JSON.stringify(data));

  return res.status(200).json({ ok: true });
}
