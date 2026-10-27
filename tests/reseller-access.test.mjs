import test from 'node:test';
import assert from 'node:assert/strict';
import resellers from '../api/resellers.js';
import orders from '../api/bulk-orders.js';
process.env.SUPABASE_URL='https://resellers.invalid';process.env.SUPABASE_SECRET_KEY='test';
test('customers cannot approve themselves or publish offers; batch reads stay user scoped',async()=>{
 const old=fetch;const seen=[];
 global.fetch=async(url,opts={})=>{seen.push([String(url),opts]);if(String(url).includes('/auth/v1/user'))return Response.json({id:'customer',email:'customer@example.com'});return Response.json([]);};
 const run=async(handler,body,query)=>{const r={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await handler({method:body?'POST':'GET',body,query,headers:{authorization:'Bearer test','x-forwarded-for':crypto.randomUUID()}},r);return r;};
 try{
  for(const action of ['review','offer']){const r=await run(resellers,{action,user_id:'customer',status:'approved'});assert.equal(r.code,403);}
  assert.equal(seen.filter(([,o])=>o.method==='PATCH'||o.method==='POST').length,0);
  await run(orders,null,{});
  assert.ok(seen.some(([u])=>u.includes('lp_bulk_batches?user_id=eq.customer')));
  const r=await run(orders,{offer_id:'bad',client_key:'bad',recipients:['08011111111','08022222222']});assert.equal(r.code,400);
 }finally{global.fetch=old;}
});
