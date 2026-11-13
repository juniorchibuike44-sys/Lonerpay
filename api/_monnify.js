import { createHmac, timingSafeEqual } from 'node:crypto';

export function monnifyConfig() {
  const mode = process.env.MONNIFY_MODE;
  if (process.env.MONNIFY_ENABLED !== 'true' || !['live', 'sandbox'].includes(mode)) {
    throw Error('Monnify funding is not enabled');
  }
  const apiKey = process.env.MONNIFY_API_KEY;
  const secret = process.env.MONNIFY_SECRET_KEY;
  const contract = process.env.MONNIFY_CONTRACT_CODE;
  if (!apiKey || !secret || !contract) throw Error('Monnify configuration is incomplete');
  const rollout = process.env.MONNIFY_ROLLOUT || 'pilot';
  const pilotUserId = process.env.MONNIFY_PILOT_USER_ID;
  if (!['pilot', 'all'].includes(rollout) || (rollout === 'pilot' && !/^[a-f0-9-]{36}$/i.test(pilotUserId || ''))) throw Error('Monnify pilot account is not configured');
  // Never allow caller-controlled URLs or an implicit production/sandbox fallback.
  return { apiKey, secret, contract, mode, rollout, pilotUserId, base: mode === 'live' ? 'https://api.monnify.com' : 'https://sandbox.monnify.com' };
}

export function monnifyAccessAllowed(c, userId) {
  return c.rollout === 'all' || (c.rollout === 'pilot' && userId === c.pilotUserId);
}

export function validMonnifySignature(raw, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function moneyKobo(value) {
  if (!['string', 'number'].includes(typeof value)) throw Error('Invalid payment amount');
  const str = String(value);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(str)) throw Error('Invalid payment amount');
  const [whole, fraction = ''] = str.split('.');
  const kobo = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(kobo) || kobo < 1) throw Error('Invalid payment amount');
  return kobo;
}

export async function monnifyAuthenticate(c) {
  const login = await fetch(c.base + '/api/v1/auth/login', {
    method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(c.apiKey + ':' + c.secret).toString('base64') },
    signal: AbortSignal.timeout(8000)
  });
  const auth = await login.json();
  if (!login.ok || auth.requestSuccessful !== true || !auth.responseBody?.accessToken) throw Error('Monnify authentication unavailable');
  return auth.responseBody.accessToken;
}

export async function monnifyRequest(c, path, method = 'GET', body) {
  const accessToken = await monnifyAuthenticate(c);
  const response = await fetch(c.base + path, {
    method, headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000), cache: 'no-store'
  });
  const result = await response.json();
  if (!response.ok || result.requestSuccessful !== true || !result.responseBody) {
    const error = Error('Monnify request could not be completed');
    error.providerCode = String(result.responseCode || '');
    throw error;
  }
  return result.responseBody;
}

export async function monnifyDb(path, method = 'GET', body) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !secret) throw Error('Funding database is not configured');
  const response = await fetch(base + '/rest/v1/' + path, {
    method, headers: { apikey: secret, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000), cache: 'no-store'
  });
  if (!response.ok) throw Error('Funding records unavailable');
  return response.status === 204 ? null : response.json();
}

export function validateReservedPayment(t, event, account, c) {
  if (!account || account.mode !== c.mode || account.status !== 'ACTIVE') throw Error('Reserved account is not active');
  if (t.transactionReference !== event.transactionReference || !t.transactionReference) throw Error('Payment reference mismatch');
  if (t.paymentStatus !== 'PAID' || t.currency !== 'NGN' || t.paymentMethod !== 'ACCOUNT_TRANSFER') throw Error('Payment is not a confirmed NGN transfer');
  if (t.product?.type !== 'RESERVED_ACCOUNT' || t.product.reference !== account.account_reference) throw Error('Payment account mismatch');
  if (event.product?.reference !== account.account_reference) throw Error('Notification account mismatch');
  if (t.contractCode != null && String(t.contractCode) !== c.contract) throw Error('Payment contract mismatch');
  const kobo = moneyKobo(t.amountPaid);
  if (kobo !== moneyKobo(event.amountPaid)) throw Error('Notification amount mismatch');
  // Credit the gross confirmed transfer; provider charges are a business expense.
  // Any future customer fee must be disclosed before collection and separately accounted.
  return { p_account: account.account_reference, p_mode: c.mode, p_reference: t.transactionReference, p_amount: kobo / 100 };
}
