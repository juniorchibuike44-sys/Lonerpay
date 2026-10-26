import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import pay from '../api/secure-pay.js';
process.env.SUPABASE_URL='https://accounting.invalid';
process.env.SUPABASE_SECRET_KEY='server-test';
process.env.PAIRGATE_API_KEY='provider-test';
const pin_hash='pbkdf2_sha256$100000$salt$'+pbkdf2Sync('1234','salt',100000,32,'sha256').toString('hex');
async function purchase(patchStatus){
 const previous=fetch,previousError=console.error,patches=[],costs=[],errors=[];
 global.fetch=async(url,options={})=>{
  const u=String(url),body=options.body?JSON.parse(options.body):null;
  if(u.includes('/auth/v1/user'))return Response.json({id:'customer'});
  if(u.includes('/payment_pins'))return Response.json([{pin_hash,failed_attempts:0,locked_until:null}]);
  if(u.includes('/lp_catalogue_cache'))return Response.json([{path:'/data-plans?provider_id=mtn&plan_type=GIFTING',saved_at:new Date().toISOString(),payload:{status:'success',data:{MTN:[{plan_id:'297',price:750}]}}}]);
  if(u.includes('/rpc/debit_wallet'))return Response.json({success:true,new_balance:100,transaction_id:'test'});
  if(u.includes('/data/purchase'))return Response.json({status:'success',data:{status:true,reference_code:'verified-provider-ref',amount:720}});
  if(u.includes('/transaction/status'))return Response.json({status:'success',data:{status:'successful',reference_code:'verified-provider-ref',amount:720}});
  if(u.includes('/wallet_transactions?')){patches.push(body);return new Response(null,{status:patchStatus});}
  if(u.includes('/rpc/lp_profit_save_cost')){costs.push(body);return Response.json({saved:true});}
  throw Error('Unexpected request '+u);
 };
 console.error=(...args)=>errors.push(args);
 const res={code:200,setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this}};
 try{await pay({method:'POST',headers:{authorization:'Bearer test'},socket:{remoteAddress:'accounting-'+patchStatus},body:{serviceID:'mtn-data',billersCode:'08000000000',variation_code:'297',amount:750,phone:'08000000000',pin:'1234',request_id:'202610261000test'+patchStatus}},res);return {res,patches,costs,errors};}
 finally{global.fetch=previous;console.error=previousError;}
}
test('completed provider purchase records verified cost, margin and reference',async()=>{
 const r=await purchase(204);assert.equal(r.res.code,200);assert.equal(r.patches.at(-1).status,'successful');
 assert.equal(r.patches.at(-1).details.provider_reference,'verified-provider-ref');
 assert.equal(r.patches.at(-1).details.provider_cost,720);assert.equal(r.patches.at(-1).details.gross_profit,30);
 assert.equal(r.costs.at(-1).p_cost,720);assert.equal(r.errors.length,0);
});
test('rejected accounting write is reported without retrying purchase or refunding delivered service',async()=>{
 const r=await purchase(403);assert.equal(r.res.code,200);assert.equal(r.costs.length,0);
 assert.equal(r.errors.length,2);assert.equal(r.errors[0][0],'Transaction accounting update rejected');
 assert.equal(r.errors[0][1].http_status,403);assert.equal(JSON.stringify(r.errors).includes('server-test'),false);
});
