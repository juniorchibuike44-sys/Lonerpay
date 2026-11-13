import { hardenResponse } from './_security.js';
import { monnifyConfig, validMonnifySignature, monnifyRequest, monnifyDb, validateReservedPayment } from './_monnify.js';
import {fundingNotification,processFunding} from './_monnify-reconciliation.js';

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
    let row;
    try { row = fundingNotification(notification); } catch { return res.status(400).json({error:'Invalid funding notification'}); }
    if (!row) return res.status(200).json({received:true,ignored:true});
    if (c.mode !== 'live') {
      if (row.event_type !== 'SUCCESSFUL_TRANSACTION') return res.status(200).json({received:true,sandbox:true,credited:false});
      const accounts = await monnifyDb('lp_monnify_accounts?account_reference=eq.'+encodeURIComponent(row.payload.product?.reference||'')+'&mode=eq.sandbox&select=user_id,account_reference,status,mode&limit=1');
      const verified = await monnifyRequest(c,'/api/v2/merchant/transactions/query?transactionReference='+encodeURIComponent(row.reference));
      validateReservedPayment(verified,row.payload,accounts[0],c);
      return res.status(200).json({received:true,sandbox:true,credited:false});
    }
    // Acknowledge only after durable storage. The cron can finish after a timeout or API outage.
    const state = await monnifyDb('rpc/lp_monnify_enqueue','POST',{p_id:row.id,p_reference:row.reference,p_type:row.event_type,p_payload:row.payload});
    if (state !== 'pending') return res.status(200).json({received:true,credited:false,state});
    const result = await processFunding({...row,state},c);
    return res.status(200).json({received:true,credited:result.credited===true,pending:result.pending===true,state:result.state});
  } catch {
    // Storage failures preserve provider retries. Stored notifications are retried by the cron.
    console.error('Monnify notification requires retry or reconciliation');
    return res.status(503).json({ error: 'Payment confirmation pending; retry notification' });
  }
}
