import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import pay from '../api/secure-pay.js';
import {recipients} from '../api/_resellers.js';
process.env.SUPABASE_URL='https://bulk.invalid'; process.env.SUPABASE_SECRET_KEY='test-server'; process.env.PAIRGATE_API_KEY='test-provider';
const pin_hash='pbkdf2_sha256$100000$salt$'+pbkdf2Sync('1234','salt',100000,32,'sha256').toString('hex');
const id='11111111-1111-4111-8111-111111111111',batch='22222222-2222-4222-8222-222222222222';
async function run({claimed=true,own=true,cost=270,price=275,state='queued',reject=false,pin='1234'}={}){
 const previous=global.fetch;let purchases=0,claims=0,refunds=0,normalDebits=0;const patches=[];
 global.fetch=async(url,options={})=>{
  const u=String(url),body=options.body?JSON.parse(options.body):null;
  if(u.includes('/auth/v1/user'))return Response.json({id:'customer'});
  if(u.includes('/payment_pins'))return Response.json([{pin_hash,failed_attempts:0}]);
  if(u.includes('/lp_bulk_items?'))return Response.json([{id,batch_id:batch,recipient:'08011111111',network:'mtn',plan_code:'plan',price:275,provider_cost:270,fee_reserve:2,minimum_margin:3,state,request_id:'bulk-'+id}]);
  if(u.includes('/lp_bulk_batches?'))return Response.json(own?[{id:batch,expires_at:new Date(Date.now()+60000).toISOString()}]:[]);
  if(u.includes('/lp_catalogue_cache?'))return Response.json([{path:'/data-plans?provider_id=mtn&plan_type=CG',saved_at:new Date().toISOString(),payload:{status:'success',data:[{plan_id:'plan',price:cost}]}}]);
  if(u.includes('/rpc/lp_bulk_claim')){claims++;return Response.json({claimed,success:claimed,state:claimed?'started':'started',request_id:'bulk-'+id,new_balance:725});}
  if(u.includes('/rpc/debit_wallet')){normalDebits++;throw Error('Bulk must not debit twice');}
  if(u.includes('/data/purchase')){purchases++;assert.equal(body.reference,'bulk-'+id);return reject?Response.json({message:'Rejected'},{status:422}):Response.json({status:'success',data:{status:true,reference_code:'PG',amount:270}});}
  if(u.includes('/transaction/status'))return Response.json({data:{status:'successful',amount:270,reference_code:'PG'}});
  if(u.includes('/rpc/lp_bulk_refund')){refunds++;return Response.json({success:true,new_balance:1000});}
  if(u.includes('/wallet_transactions?')){patches.push(body);return new Response(null,{status:204});}
  if(u.includes('/rpc/lp_profit_save_cost'))return Response.json({saved:true});
  throw Error('Unexpected '+u);
 };
 const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
 const log=console.error;console.error=()=>{};
 try{await pay({method:'POST',headers:{authorization:'Bearer test','x-forwarded-for':crypto.randomUUID()},body:{serviceID:'mtn-data',billersCode:'08011111111',phone:'08011111111',variation_code:'plan',amount:price,pin,bulk_item_id:id}},res);return{res,purchases,claims,refunds,normalDebits,patches};}
 finally{global.fetch=previous;console.error=log;}
}
test('bulk uses saved price and deterministic reference with one atomic debit',async()=>{const r=await run();assert.equal(r.res.code,200);assert.equal(r.purchases,1);assert.equal(r.claims,1);assert.equal(r.normalDebits,0);assert.equal(r.patches.at(-1).details.gross_profit,5);});
test('a concurrent or repeated bulk claim never calls the provider',async()=>{for(const opts of [{claimed:false},{state:'started'}]){const r=await run(opts);assert.equal(r.res.code,202);assert.equal(r.purchases,0);assert.equal(r.normalDebits,0);}});
test('ownership, tampered prices, increased costs and wrong PIN fail before debit',async()=>{for(const opts of [{own:false},{price:1},{cost:271},{pin:'0000'}]){const r=await run(opts);assert.ok(r.res.code>=400);assert.equal(r.claims,0);assert.equal(r.purchases,0);}});
test('definitively rejected bulk order uses the bulk refund path',async()=>{const r=await run({reject:true});assert.equal(r.refunds,1);assert.equal(r.res.body.refunded,true);assert.equal(r.purchases,1);});
test('recipient validation prevents duplicate and malformed bulk deliveries',()=>{assert.deepEqual(recipients(['08011111111','08022222222']),['08011111111','08022222222']);for(const rows of [[],['08011111111','08011111111'],['+2348011111111','08022222222'],Array.from({length:21},(_,i)=>'080'+String(i).padStart(8,'0'))])assert.throws(()=>recipients(rows));});
