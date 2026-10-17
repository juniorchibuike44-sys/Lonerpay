import { createHmac, timingSafeEqual } from 'node:crypto';
import { settleVtu } from './_vtu-settle.js';
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const pin = process.env.VTU_NG_PIN;
  if (!pin) return res.status(503).json({ error: 'Webhook is not configured' });
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 65536) return res.status(413).end(); chunks.push(Buffer.from(chunk)); }
    const raw = Buffer.concat(chunks);
    const signature = String(req.headers['x-signature'] || '');
    if (!/^[a-f0-9]{64}$/i.test(signature)) return res.status(403).end();
    const expected = createHmac('sha256', pin).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return res.status(403).end();
    const payload = JSON.parse(raw.toString('utf8'));
    const requestId = String(payload.request_id || '');
    if (!/^\d{12}[A-Za-z0-9_-]{1,38}$/.test(requestId)) return res.status(400).end();
    const key = process.env.SUPABASE_SECRET_KEY;
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/wallet_transactions?request_id=eq.${encodeURIComponent(requestId)}&select=user_id,request_id,status,details,amount&limit=2`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return res.status(503).end();
    const rows = await r.json();
    const transaction = rows.length === 1 ? rows[0] : null;
    if (transaction?.details?.provider === 'vtu-ng' && transaction.status === 'pending') await settleVtu(transaction);
    return res.status(200).json({ received: true });
  } catch { return res.status(503).json({ error: 'Confirmation pending; retry later' }); }
}
