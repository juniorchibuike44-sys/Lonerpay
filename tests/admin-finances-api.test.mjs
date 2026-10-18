import test from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/ceo-profit.js';
test('finance RPC stays owner-only, uses server credentials and reports unavailable instead of inventing balances',async()=>{
 const old=globalThis.fetch;process.env.SUPABASE_URL='https://db.example';process.env.SUPABASE_SECRET_KEY='server-key';
 let email='someone@example.com',rpc=0,fail=false;
 globalThis.fetch=async(url,options={})=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'owner',email})};
  if(url.includes('/rpc/lp_admin_finances')){rpc++;assert.equal(options.headers.Authorization,'Bearer server-key');return {ok:!fail,json:async()=>fail?{message:'missing'}:{scope:'company',customer_available:100,recorded_profit:5}};}
  if(url.includes('/wallet_transactions?'))return {ok:true,json:async()=>[]};
  throw Error('Provider not configured');
 };
 const call=async()=>{let status=200,body;const res={setHeader(){},status(s){status=s;return this;},json(d){body=d;return this;}};await handler({method:'GET',headers:{authorization:'Bearer owner-token','x-forwarded-for':'finance-test'},query:{days:30}},res);return {status,body};};
 try{let r=await call();assert.equal(r.status,403);assert.equal(rpc,0);email='juniorchibuike44@gmail.com';r=await call();assert.equal(r.status,200);assert.equal(r.body.finances.customer_available,100);assert.equal(rpc,1);fail=true;r=await call();assert.equal(r.body.finances,null);assert.match(r.body.finance_error,/admin-finances.sql/);}finally{globalThis.fetch=old;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;}
});
