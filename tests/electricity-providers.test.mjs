import test from 'node:test';import assert from 'node:assert/strict';import {pbkdf2Sync} from 'node:crypto';
import {electricityProviderAliases,electricityProviderId} from '../api/_electricity-providers.js';
import verify from '../api/verify-meter.js';import pay from '../api/secure-pay.js';
const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}});
const env={SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'server',PAIRGATE_API_KEY:'provider'};
test('every dashboard electricity alias and canonical slug verifies with both meter types',async()=>{
 const old=fetch;Object.assign(process.env,env);const sent=[];
 globalThis.fetch=async(u,o={})=>{if(String(u).endsWith('/auth/v1/user'))return Response.json({id:'user'});assert.match(String(u),/electricity\/verify$/);sent.push(JSON.parse(o.body));return Response.json({status:'success',data:{status:true,customer_name:'Meter Customer'}});};
 try{for(const [alias,canonical] of Object.entries(electricityProviderAliases)){assert.equal(electricityProviderId(alias),canonical);assert.equal(electricityProviderId(canonical),canonical);for(const type of ['prepaid','postpaid']){const r=res();await verify({method:'POST',headers:{authorization:'Bearer user','x-forwarded-for':alias+type},body:{serviceID:alias,billersCode:'0159000606701',type}},r);assert.equal(r.code,200);assert.equal(sent.at(-1).provider_id,canonical);assert.equal(sent.at(-1).meter_type,type==='prepaid'?1:2);assert.equal(sent.at(-1).meter_number,'0159000606701');}}
 const before=sent.length;const r=res();await verify({method:'POST',headers:{},body:{serviceID:'unknown-electric',billersCode:'0159000606701',type:'postpaid'}},r);assert.equal(r.code,400);assert.equal(sent.length,before);assert.equal(electricityProviderId('constructor'),null);
 }finally{globalThis.fetch=old;}
});
test('Enugu legacy selection uses identical canonical slug for verification and purchase before a single debit',async()=>{
 const old=fetch;Object.assign(process.env,env);let debits=0,purchases=0;const calls=[];
 const hash='pbkdf2_sha256$100000$salt$'+pbkdf2Sync('1234','salt',100000,32,'sha256').toString('hex');
 globalThis.fetch=async(u,o={})=>{u=String(u);calls.push(u);if(u.endsWith('/auth/v1/user'))return Response.json({id:'user'});if(u.includes('/payment_pins'))return Response.json([{pin_hash:hash,failed_attempts:0}]);
 if(u.endsWith('/electricity/verify')){const b=JSON.parse(o.body);assert.equal(b.provider_id,'enugu');assert.equal(b.meter_type,2);assert.equal(debits,0);return Response.json({status:'success',data:{status:true,customer_name:'Meter Customer'}});}
 if(u.endsWith('/debit_wallet')){debits++;assert.ok(calls.some(c=>c.endsWith('/electricity/verify')));const b=JSON.parse(o.body);assert.equal(b.p_service,'enugu');return Response.json({success:true,new_balance:1000});}
 if(u.endsWith('/electricity/purchase')){purchases++;const b=JSON.parse(o.body);assert.equal(b.provider_id,'enugu');assert.equal(b.meter_type,2);assert.equal(b.meter_number,'0159000606701');return Response.json({status:'success',data:{status:true,reference_code:'PG-electric',balance_before:2000,balance_after:1000}});}
 if(u.includes('/transaction/status'))return Response.json({status:'success',data:{status:'successful',reference_code:'PG-electric',pin:'TOKEN'}});
 if(u.includes('/wallet_transactions')||u.endsWith('/lp_profit_save_cost'))return Response.json({saved:true});
 throw Error('Unexpected '+u);};
 try{const r=res();await pay({method:'POST',headers:{authorization:'Bearer user','x-forwarded-for':'electric-pay'},body:{serviceID:'enugu-electric',billersCode:'0159000606701',variation_code:'postpaid',amount:1000,phone:'08012345678',pin:'1234',recipient_name:'Meter Customer'}},r);assert.equal(r.code,200);assert.equal(debits,1);assert.equal(purchases,1);assert.equal(r.data.pending,false);}finally{globalThis.fetch=old;}
});
