import { hardenResponse, enforceSharedRateLimit, requireUser, cleanText } from './_security.js';
import { monnifyConfig, monnifyRequest, monnifyDb } from './_monnify.js';

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
  try {
    if (!await enforceSharedRateLimit(req, res, { key: 'monnify-account', limit: 8, windowMs: 600000 })) return;
    const auth = await requireUser(req, res);
    if (!auth) return;
    const reference = 'LP-' + c.mode + '-' + auth.user.id;
    const saved = await monnifyDb('lp_monnify_accounts?user_id=eq.' + encodeURIComponent(auth.user.id) + '&mode=eq.' + c.mode + '&select=account_reference,mode,status,accounts&limit=1');
    if (saved[0]?.status === 'ACTIVE' || req.method === 'GET') return res.status(200).json({ success: true, account: saved[0] || null });
    const bvn = typeof req.body?.bvn === 'string' ? req.body.bvn.trim() : '';
    const nin = typeof req.body?.nin === 'string' ? req.body.nin.trim() : '';
    if ((!/^\d{11}$/.test(bvn) && !/^\d{11}$/.test(nin)) || (bvn && !/^\d{11}$/.test(bvn)) || (nin && !/^\d{11}$/.test(nin))) return res.status(400).json({ error: 'A valid 11-digit BVN or NIN is required' });
    if (req.body?.consent !== true || !auth.user.email) return res.status(400).json({ error: 'Identity verification consent and an account email are required' });
    const name = cleanText(req.body?.full_name, 100);
    if (name.length < 3) return res.status(400).json({ error: 'Enter your full legal name' });
    // Reuse one deterministic reference. Recover an earlier completed creation after a network/DB failure.
    let account;
    try {
      account = await monnifyRequest(c, '/api/v2/bank-transfer/reserved-accounts', 'POST', {
        accountReference: reference, accountName: name, currencyCode: 'NGN', contractCode: c.contract,
        customerEmail: auth.user.email, customerName: name, getAllAvailableBanks: true,
        ...(bvn ? { bvn } : {}), ...(nin ? { nin } : {})
      });
    } catch {
      // A duplicate reference or ambiguous response may mean the original creation succeeded.
      // Recover that exact account; never generate a replacement reference on retry.
      account = await monnifyRequest(c, '/api/v2/bank-transfer/reserved-accounts/' + encodeURIComponent(reference));
    }
    const view = accountView(account, reference, c);
    await monnifyDb('lp_monnify_accounts?on_conflict=user_id,mode', 'POST', { user_id: auth.user.id, ...view });
    // Never persist or return raw provider responses: they can contain BVN/NIN.
    return res.status(200).json({ success: true, account: view });
  } catch {
    return res.status(503).json({ error: 'Account setup is pending. Retry later; do not transfer until an account is displayed.' });
  }
}
