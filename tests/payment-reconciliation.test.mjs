import test from 'node:test';import assert from 'node:assert/strict';
import {reconcilePurchase,reconciliationBatch} from '../api/_payment-reconciliation.js';
import cron from '../api/payment-reconcile.js';
Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'test',PAIRGATE_API_KEY:'test'});
const row={user_id:'u',request_id:'202611101200x',service:'enugu',amount:1000,status:'pending',created_at:'2026-11-01',details:{provider:'pairgate',provider_reference:'PG1'}};
for(const status of ['successful','failed','processing','server-error','timeout','mismatch'])test('reconciliation '+status,async()=>{
 const old=fetch,calls=[];
 global.fetch=async(u,o={})=>{calls.push([String(u),o.body&&JSON.parse(o.body)]);
 if(String(u).includes('/transaction/status')){if(status==='timeout')throw Error('timeout');return Response.json({data:{status,reference_code:status==='mismatch'?'other':'PG1',pin:'TOKEN'}},{status:status==='server-error'?503:200});}
 if(String(u).includes('/lp_pairgate_settle')){const s=JSON.parse(o.body).p_status;return Response.json({resolved:s!=='pending',status:s==='failed'?'refunded':s});}
 throw Error('Unexpected request');};
 try{if(status==='mismatch'){await assert.rejects(()=>reconcilePurchase(row),/different reference/);assert.equal(calls.length,1);return;}
 const r=await reconcilePurchase(row);assert.equal(r.status,status==='successful'?'successful':status==='failed'?'refunded':'pending');assert.equal(calls.filter(x=>x[0].includes('/lp_pairgate_settle')).length,1);assert.equal(calls.some(x=>x[0].includes('/purchase')),false);
 if(status==='successful')assert.equal(calls[1][1].p_details.purchased_code,'TOKEN');
 }finally{global.fetch=old;}
});
test('missing references enter review without guessing a provider reference',async()=>{
 const old=fetch;global.fetch=async(u,o)=>{assert.match(String(u),/lp_pairgate_settle/);assert.equal(JSON.parse(o.body).p_details.reconciliation_reason,'missing_provider_reference');return Response.json({resolved:false,status:'pending'});};
 try{assert.equal((await reconcilePurchase({...row,details:{provider:'pairgate'}})).needs_review,true);}finally{global.fetch=old;}
});
test('cron rejects unauthenticated access',async()=>{const res={setHeader(){},status(n){this.code=n;return this},json(d){this.body=d;return this}};await cron({method:'GET',headers:{}},res);assert.equal(res.code,401);});
