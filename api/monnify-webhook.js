import { hardenResponse } from './_security.js';
import { monnifyConfig, validMonnifySignature, monnifyRequest, monnifyDb, validateReservedPayment } from './_monnify.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let c;
  try { c = monnifyConfig(); } catch { return res.status(503).json({ error: 'Monnify funding is not configured' }); }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += data.length;
      if (size > 131072) return res.status(413).json({ error: 'Notification too large' });
      chunks.push(data);
    }
    const raw = Buffer.concat(chunks);
    // Sandbox also requires a valid signature here. Unsigned simulator messages never credit real wallets.
    if (!validMonnifySignature(raw, req.headers['monnify-signature'], c.secret)) return res.status(401).json({ error: 'Invalid signature' });
    let notification;
    try { notification = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    if (notification?.eventType !== 'SUCCESSFUL_TRANSACTION') return res.status(200).json({ received: true, ignored: true });
    const event = notification.eventData;
    if (!event || typeof event.transactionReference !== 'string' || event.transactionReference.length > 200 || !event.transactionReference) return res.status(400).json({ error: 'Invalid transaction reference' });
    if (event.product?.type !== 'RESERVED_ACCOUNT') return res.status(200).json({ received: true, ignored: true });
    if (typeof event.product.reference !== 'string' || event.product.reference.length > 100) return res.status(400).json({ error: 'Invalid account reference' });
    const accounts = await monnifyDb('lp_monnify_accounts?account_reference=eq.' + encodeURIComponent(event.product.reference) + '&mode=eq.' + c.mode + '&select=user_id,account_reference,status,mode&limit=1');
    if (!accounts[0]) return res.status(409).json({ error: 'Account mapping needs review' });
    const verified = await monnifyRequest(c, '/api/v2/merchant/transactions/query?transactionReference=' + encodeURIComponent(event.transactionReference));
    const payment = validateReservedPayment(verified, event, accounts[0], c);
    // Sandbox is deliberately verification-only, even with a correctly signed synthetic event.
    if (c.mode !== 'live') return res.status(200).json({ received: true, sandbox: true, credited: false });
    const result = await monnifyDb('rpc/lp_credit_monnify', 'POST', payment);
    return res.status(200).json({ received: true, credited: result?.credited === true });
  } catch {
    // Non-2xx preserves provider retries. Never acknowledge before the atomic database commit.
    console.error('Monnify notification requires retry or reconciliation');
    return res.status(503).json({ error: 'Payment confirmation pending; retry notification' });
  }
}
