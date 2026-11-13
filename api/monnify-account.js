import { hardenResponse, enforceSharedRateLimit, requireUser, cleanText } from './_security.js';
import { monnifyConfig, monnifyRequest, monnifyDb, monnifyAccessAllowed, monnifyAuthenticate } from './_monnify.js';

export function accountView(account, reference, c) {
  if (account.accountReference !== reference || String(account.contractCode) !== c.contract || account.currencyCode !== 'NGN' || account.status !== 'ACTIVE') throw Error('Account is not ready');
  const accounts = (account.accounts || []).filter(a => /^\d{10}$/.test(a.accountNumber) && typeof a.bankName === 'string').map(a => ({ account_number: a.accountNumber, account_name: a.accountName || account.accountName, bank_name: a.bankName, bank_code: a.bankCode }));
  if (!accounts.length) throw Error('Account details are not ready');
  return { account_reference: reference, mode: c.mode, status: 'ACTIVE', accounts };
}

export default async function handler(req, res) {
  hardenResponse(res);
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  let c;
  try { c = monnifyConfig(); } catch { return res.status(503).json({ error: 'Monnify funding is not configured' }); }
  let stage = 'session';
  try {
    if (!await enforceSharedRateLimit(req, res, { key: 'monnify-account', limit: 8, windowMs: 600000 })) return;
    const auth = await requireUser(req, res);
    if (!auth) return;
    if (!monnifyAccessAllowed(c, auth.user.id)) return res.status(403).json({ error: 'Monnify testing is not available for this account' });
    const reference = 'LP-' + c.mode + '-' + auth.user.id;
    stage = 'load_account';
    const saved = await monnifyDb('lp_monnify_accounts?user_id=eq.' + encodeURIComponent(auth.user.id) + '&mode=eq.' + c.mode + '&select=account_reference,mode,status,accounts&limit=1');
    if (req.method === 'GET') {
      stage = 'authentication';
      await monnifyAuthenticate(c);
      return res.status(200).json({ success: true, connection_verified: true, account: saved[0] || null });
    }
    if (saved[0]?.status === 'ACTIVE') return res.status(200).json({ success: true, account: saved[0] });
    const bvn = typeof req.body?.bvn === 'string' ? req.body.bvn.trim() : '';
    const nin = typeof req.body?.nin === 'string' ? req.body.nin.trim() : '';
    if ((!/^\d{11}$/.test(bvn) && !/^\d{11}$/.test(nin)) || (bvn && !/^\d{11}$/.test(bvn)) || (nin && !/^\d{11}$/.test(nin))) return res.status(400).json({ error: 'A valid 11-digit BVN or NIN is required' });
    if (req.body?.consent !== true || !auth.user.email) return res.status(400).json({ error: 'Identity verification consent and an account email are required' });
    const name = cleanText(req.body?.full_name, 100);
    if (name.length < 3) return res.status(400).json({ error: 'Enter your full legal name' });
    // Reuse one deterministic reference. Recover an earlier completed creation after a network/DB failure.
    let account;
    stage = 'create_account';
    try {
      account = await monnifyRequest(c, '/api/v2/bank-transfer/reserved-accounts', 'POST', {
        accountReference: reference, accountName: name, currencyCode: 'NGN', contractCode: c.contract,
        customerEmail: auth.user.email, customerName: name, getAllAvailableBanks: true,
        ...(bvn ? { bvn } : {}), ...(nin ? { nin } : {})
      });
    } catch (error) {
      if (String(error.code || '').startsWith('monnify_auth_')) throw error;
      // A duplicate reference or ambiguous response may mean the original creation succeeded.
      // Recover that exact account; never generate a replacement reference on retry.
      account = await monnifyRequest(c, '/api/v2/bank-transfer/reserved-accounts/' + encodeURIComponent(reference));
    }
    const view = accountView(account, reference, c);
    stage = 'save_account';
    await monnifyDb('lp_monnify_accounts?on_conflict=user_id,mode', 'POST', { user_id: auth.user.id, ...view });
    // Never persist or return raw provider responses: they can contain BVN/NIN.
    return res.status(200).json({ success: true, account: view });
  } catch (error) {
    const known = {
      monnify_auth_rejected: 'Monnify refused API authentication. Check that the saved API Key and Secret Key are both from Live mode.',
      monnify_auth_unreachable: 'The server could not reach Monnify authentication. Please try again shortly.',
      monnify_auth_invalid_response: 'Monnify authentication returned an unexpected response. Please try again shortly.',
      funding_records_unavailable: 'LonerPay could not load or save the funding account records. Support needs to check the database setup.'
    };
    const code = Object.hasOwn(known, error.code) ? error.code : 'monnify_account_' + stage;
    // Never log raw provider messages, credentials, identity data, or auth tokens.
    console.error('Monnify account check failed', { stage, code, http_status: Number.isInteger(error.httpStatus) ? error.httpStatus : null });
    const message = known[code] || (stage === 'load_account' || stage === 'save_account'
      ? 'LonerPay funding account records are temporarily unavailable. Please try again shortly.'
      : 'Monnify account setup could not be confirmed. Please retry later.');
    return res.status(503).json({ error: message + ' Do not transfer until an account is displayed.', code });
  }
}
