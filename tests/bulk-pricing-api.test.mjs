import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/bulk-pricing.js';

test('quotes use server catalogue costs, enforce owner access and never purchase', async () => {
  const original = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://database.invalid'; process.env.SUPABASE_SECRET_KEY = 'test';
  let owner = true, calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push([String(url), options.method || 'GET']);
    if (String(url).endsWith('/auth/v1/user')) return Response.json({id: 'owner', email: owner ? 'juniorchibuike44@gmail.com' : 'customer@example.com'});
    if (String(url).includes('/lp_catalogue_cache?')) return Response.json([{path: '/data-plans?provider_id=mtn&plan_type=CG', saved_at: new Date().toISOString(), payload: {status: 'success', data: [{plan_id: 'plan-1', price: 270, name: 'Example bundle'}]}}]);
    throw Error('Unexpected API request: ' + url);
  };
  const run = async body => {
    const res = {setHeader(){}, status(n){this.code = n; return this;}, json(data){this.data = data; return this;}};
    await handler({method: 'POST', headers: {authorization: 'Bearer test', 'x-forwarded-for': 'bulk-test'}, body}, res);
    return res;
  };
  const body = {network: 'mtn', planCode: 'plan-1', cost: 1, price: 275, quantity: 10, feeReserve: 2, minimumMargin: 3, estimatedCashbackPercent: 2};
  try {
    let r = await run(body);
    assert.equal(r.code, 200); assert.equal(r.data.unit_cost, 270); assert.equal(r.data.estimated_cashback, 54);
    assert.equal(r.data.checkout_enabled, false);
    assert.ok(calls.every(([, method]) => method === 'GET'));
    calls = []; owner = false; r = await run(body);
    assert.equal(r.code, 403); assert.equal(calls.length, 1);
    calls = []; owner = true; r = await run({...body, quantity: 0});
    assert.equal(r.code, 400); assert.equal(calls.length, 1);
    calls = []; r = await run({...body, planCode: 'unknown'});
    assert.equal(r.code, 503); assert.equal(r.data.unit_cost, undefined);
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
});
