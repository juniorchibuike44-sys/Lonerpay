import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/vtpass-requery.js';

test('a successful wallet debit without provider confirmation is not reported as a successful data purchase', async () => {
  Object.assign(process.env, {SUPABASE_URL:'https://db.test', SUPABASE_SECRET_KEY:'test'});
  const previous = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({id:'u'});
    if (String(url).includes('/wallet_transactions')) return Response.json([{status:'successful', service:'mtn-data', details:{provider:'pairgate'}}]);
    throw Error('Unexpected request');
  };
  const res={setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}};
  try {
    await handler({method:'POST',headers:{authorization:'Bearer test'},body:{request_id:'202610301411abcdef'}},res);
    assert.equal(res.code,202); assert.equal(res.body.status,'pending'); assert.equal(res.body.resolved,false);
  } finally { globalThis.fetch=previous; }
});
