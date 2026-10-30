import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import pay from '../api/secure-pay.js';
const pin_hash='pbkdf2_sha256$100000$salt$'+pbkdf2Sync('1234','salt',100000,32,'sha256').toString('hex');
Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'test',PAIRGATE_API_KEY:'test'});
for(const outcome of ['successful','failed','timeout'])test('data outcome '+outcome,async()=>{
 const previous=fetch,patches=[];let refunds=0,purchases=0;
 global.fetch=async(u,o={})=>{
  u=String(u);
  if(u.includes('lp_check_rate_limit'))return Response.json({allowed:true,remaining:10,retry_after:0});
  if(u.endsWith('/auth/v1/user'))return Response.json({id:'owner'});
  if(u.includes('/payment_pins'))return Response.json([{pin_hash,failed_attempts:0}]);
  if(u.includes('/lp_catalogue_cache'))return Response.json([{path:'/data-plans?provider_id=mtn&plan_type=GIFTING',saved_at:new Date().toISOString(),payload:{status:'success',data:{MTN:[{plan_id:'272',price:1000}]}}}]);
  if(u.includes('/rpc/debit_wallet'))return Response.json({success:true,new_balance:2000,transaction_id:'id'});
  if(u.includes('/wallet_transactions')&&o.method==='PATCH'){patches.push(JSON.parse(o.body));return new Response(null,{status:204});}
  if(u.endsWith('/data/purchase')){purchases++;return Response.json({status:'success',data:{status:true,reference_code:'TRXDATA-test'}});}
  if(u.includes('/transaction/status')){if(outcome==='timeout')throw Error('timeout');return Response.json({status:'success',data:{status:outcome,reference_code:'TRXDATA-test'}});}
  if(u.includes('/rpc/refund_wallet')){refunds++;return Response.json({success:true,new_balance:3000});}
  throw Error('Unexpected request '+u);
 };
 const res={setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}};
 try{
  await pay({method:'POST',headers:{authorization:'Bearer test'},socket:{remoteAddress:'test'},body:{serviceID:'mtn-data',billersCode:'09131123780',phone:'09131123780',variation_code:'272',amount:1000,pin:'1234'}},res);
  assert.equal(purchases,1);assert.equal(patches[0].status,'pending');assert.equal(patches[0].details.provider_reference,'TRXDATA-test');assert.equal(patches[0].details.wallet_debited,true);
  assert.equal(res.code,outcome==='successful'?200:outcome==='failed'?502:202);
  assert.equal(refunds,outcome==='failed'?1:0);
  assert.equal(patches.at(-1).status,outcome==='successful'?'successful':outcome==='failed'?'refunded':'pending');
 }finally{global.fetch=previous;}
});
