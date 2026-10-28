import { enforceSharedRateLimit, hardenResponse, requireUser } from './_security.js';
import { checkoutDataPlan } from './_catalogue.js';
import { bulkQuote } from './_bulk-pricing.js';

export default async function handler(req, res) {
  hardenResponse(res);
  if (req.method !== 'POST') return res.status(405).json({error: 'Method not allowed'});
  if (!await enforceSharedRateLimit(req, res, {key: 'bulk-pricing', limit: 20})) return;
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (String(auth.user.email || '').toLowerCase() !== 'juniorchibuike44@gmail.com') return res.status(403).json({error: 'Owner access only'});
  const b = req.body || {};
  if (!['mtn', 'airtel', 'glo', '9mobile'].includes(b.network) || typeof b.planCode !== 'string' || !b.planCode.trim() || b.planCode.length > 150) return res.status(400).json({error: 'Choose a network and enter a data plan ID'});
  try {
    // Validate the entire scenario before making any provider/catalogue request.
    bulkQuote({...b, cost: 1});
  } catch (e) { return res.status(400).json({error: e.message}); }
  try {
    const plan = await checkoutDataPlan(b.network, b.planCode);
    if (!plan) return res.status(409).json({error: 'This plan is unavailable. Refresh the data plans.'});
    const quote = bulkQuote({...b, cost: Number(plan.price || plan.amount)});
    return res.status(200).json({
      ...quote, network: b.network, plan_code: b.planCode,
      plan_name: String(plan.name || plan.plan_name || plan.plan || b.planCode).slice(0, 200),
      generated_at: new Date().toISOString(),
      note: 'Planning quote only. The selected cashback rate is an assumption, not a verified product entitlement. No purchase, discount or reward has been applied.'
    });
  } catch (e) {
    if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
    return res.status(Number(e.statusCode) || 503).json({error: 'Unable to verify this plan and price. Refresh the plans and try again.'});
  }
}
