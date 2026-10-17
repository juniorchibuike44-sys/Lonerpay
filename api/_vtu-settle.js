import { vtuRequest, vtuOutcome } from './_vtu-ng.js';
export async function settleVtu(transaction) {
  const result = await vtuRequest('requery', { request_id: transaction.request_id });
  const outcome = vtuOutcome(result);
  // Requery errors (including missing order/auth failures) are never proof of a
  // failed purchase. Only a successful lookup with a terminal status can settle.
  if (!result.response.ok || result.data?.code !== 'success' || outcome === 'pending') return { resolved: false, status: 'pending' };
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (outcome === 'failed') {
    const r = await fetch(`${base}/rest/v1/rpc/refund_wallet`, { method: 'POST', headers, body: JSON.stringify({ p_user_id: transaction.user_id, p_request_id: transaction.request_id, p_reason: 'VTU.ng confirmed ' + result.data.data.status }) });
    const data = await r.json();
    const refund = Array.isArray(data) ? data[0] : data;
    if (!r.ok || refund?.success === false) throw new Error('Refund confirmation is pending');
    return { resolved: true, status: 'refunded' };
  }
  const cost = Number(result.data?.data?.amount_charged);
  const r = await fetch(`${base}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(transaction.user_id)}&request_id=eq.${encodeURIComponent(transaction.request_id)}&status=eq.pending`, {
    method: 'PATCH', headers, body: JSON.stringify({ status: 'successful', details: {
      ...transaction.details, provider: 'vtu-ng', provider_status: result.data.data.status,
      provider_reference: String(result.data.data.order_id || ''),
      ...(Number.isFinite(cost) ? { provider_cost: cost, gross_profit: Number(transaction.details?.sale_amount || transaction.amount) - cost } : {})
    }, updated_at: new Date().toISOString() })
  });
  if (!r.ok) throw new Error('Transaction status could not be saved');
  return { resolved: true, status: 'successful' };
}
