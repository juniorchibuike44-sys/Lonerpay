import { hardenResponse, requireUser, enforceSharedRateLimit } from './_security.js';
import { monnifyConfig, monnifyAccessAllowed, monnifyIsPrimary } from './_monnify.js';

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!await enforceSharedRateLimit(req, res, { key: 'monnify-access', limit: 40, windowMs: 60000 })) return;
    const auth = await requireUser(req, res);
    if (!auth) return;
    let c;
    const primary = monnifyIsPrimary(auth.user.id);
    try { c = monnifyConfig(); } catch { return res.status(200).json({ available: false, primary }); }
    return res.status(200).json({ available: monnifyAccessAllowed(c, auth.user.id), pilot: c.rollout === 'pilot', primary });
  } catch { return res.status(503).json({ error: 'Funding availability could not be checked' }); }
}
