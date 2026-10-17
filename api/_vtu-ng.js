import { randomUUID, createHash } from 'node:crypto';
const BASE = 'https://vtu.ng/wp-json';
const fail = message => Object.assign(new Error(message), { statusCode: 503 });
const headers = () => ({ apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' });
async function control(action, path, owner, payload = null) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/lp_catalogue_control`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ p_action: action, p_path: path, p_owner: owner, p_payload: payload, p_delay: 5 }), signal: AbortSignal.timeout(5000)
  });
  if (!r.ok) throw fail('Provider cache is unavailable. Please try again.');
  return r.json();
}
// The existing service-role-only catalogue lock serializes token issuance across
// Vercel instances: VTU invalidates earlier tokens whenever a new one is issued.
async function shared(path, produce) {
  const owner = randomUUID(), deadline = Date.now() + 12000;
  while (true) {
    const state = await control('claim', path, owner);
    if (state.state === 'cached') return state.payload;
    if (state.state === 'acquired') break;
    if (Date.now() > deadline) throw fail('Provider is busy. Please try again shortly.');
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  let released = false;
  try {
    const payload = await produce();
    const result = await control('finish', path, owner, payload);
    released = true;
    if (result.state === 'lost') throw fail('Provider refresh expired. Please try again.');
    return payload;
  } finally {
    if (!released) await control('finish', path, owner).catch(() => {});
  }
}
export async function vtuToken() {
  const username = process.env.VTU_NG_USERNAME, password = process.env.VTU_NG_PASSWORD;
  if (!username || !password) throw fail('VTU.ng credentials are missing.');
  const fingerprint = createHash('sha256').update(username + '\0' + password).digest('hex');
  const data = await shared('/vtu-ng/auth/' + fingerprint, async () => {
    const r = await fetch(BASE + '/jwt-auth/v1/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(12000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || typeof d.token !== 'string' || !d.token) throw fail('VTU.ng login failed. Check the server credentials and API access.');
    return { token: d.token };
  });
  return data.token;
}
export async function vtuRequest(path, body, token) {
  const r = await fetch(BASE + '/api/v2/' + path, {
    method: 'POST', headers: { Authorization: `Bearer ${token || await vtuToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  // A non-JSON reply is ambiguous, even if its HTTP status looks like an error.
  const data = await r.json();
  return { response: r, data };
}
export function vtuOutcome(result) {
  const status = String(result.data?.data?.status || '').toLowerCase();
  if (result.response.ok && result.data?.code === 'success') {
    if (status === 'completed-api') return 'successful';
    if (['refunded', 'failed', 'cancelled'].includes(status)) return 'failed';
  }
  // Only documented rejections establish that no order was accepted. Unknown
  // codes, HTTP 5xx, duplicate IDs and transport failures must remain pending.
  const rejected = new Set(['missing_fields', 'invalid_service', 'invalid_variation_id', 'below_minimum_amount', 'above_maximum_amount', 'insufficient_funds', 'rest_forbidden', 'jwt_auth_failed', 'jwt_auth_invalid_token', 'invalid_product', 'product_unavailable', 'invalid_field', 'invalid_request_id']);
  if (result.response.status >= 400 && result.response.status < 500 && rejected.has(result.data?.code)) return 'failed';
  return 'pending';
}
export const vtuNetwork = service => service.startsWith('etisalat') || service === '9mobile' ? '9mobile' : service.replace(/-data$/, '');
export async function vtuCatalogue() {
  return shared('/vtu-ng/catalogue/data', async () => {
    const r = await fetch(BASE + '/api/v2/variations/data', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (!r.ok || d.code !== 'success' || !Array.isArray(d.data)) throw fail('VTU.ng data plans could not be loaded. Please try again shortly.');
    return { rows: d.data, savedAt: Date.now() };
  });
}
export function vtuPlans(catalogue, network) {
  // Sell at the provider's published retail price. reseller_price is our cost,
  // never a customer-supplied amount. Keep IDs namespaced across provider changes.
  return catalogue.rows.filter(p => p.service_id === network && p.availability === 'Available')
    .map(p => ({ code: 'vtu:' + p.variation_id, name: String(p.data_plan || 'Data plan'), amount: Number(p.price) }))
    .filter(p => /^vtu:\d+$/.test(p.code) && Number.isFinite(p.amount) && p.amount > 0).sort((a,b) => a.amount-b.amount);
}
