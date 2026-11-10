import test from 'node:test';import assert from 'node:assert/strict';import {pbkdf2Sync} from 'node:crypto';import pay from '../api/secure-pay.js';
const pin_hash='pbkdf2_sha256$100000$salt$'+pbkdf2Sync('1234','salt',100000,32,'sha256').toString('hex');
Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'test',PAIRGATE_API_KEY:'test'});
for(const service of ['enugu','dstv','waec'])for(const outcome of ['server-error','timeout','malformed','duplicate','rejected','query-timeout','processing'])test(service+' '+outcome,async()=>{
 const old=fetch;let debits=0,refunds=0,purchases=0,queries=0;const patches=[];
 global.fetch=async(u,o={})=>{u=String(u);
 if(u.includes('/lp_check_rate_limit'))return Response.json({allowed:true,remaining:20,retry_after:0});
 if(u.endsWith('/auth/v1/user'))return Response.json({id:'u'});
 if(u.includes('/payment_pins'))return Response.json([{pin_hash,failed_attempts:0}]);
 if(u.includes('/cable-plans'))return Response.json({status:'success',data:[{plan_id:'plan',price:1000}]});
 if(u.endsWith('/verify'))return Response.json({status:'success',data:{status:true}});
 if(u.endsWith('/debit_wallet')){debits++;assert.equal(JSON.parse(o.body).p_details.provider,'pairgate');return Response.json({success:true,new_balance:2000});}
 if(u.includes('/wallet_transactions')){patches.push(JSON.parse(o.body));return new Response(null,{status:204});}
 if(u.endsWith('/purchase')){purchases++;if(outcome==='timeout')throw Error('timeout');if(outcome==='malformed')return new Response('<html>bad gateway</html>');if(['query-timeout','processing'].includes(outcome))return Response.json({status:'success',data:{status:true,reference_code:'PG1',details:[{reference:'PG1'}]}});return Response.json({message:outcome==='duplicate'?'Duplicate reference':'Rejected'},{status:outcome==='server-error'?503:422});}
 if(u.includes('/transaction/status')){queries++;if(outcome==='processing')return Response.json({data:{status:'processing',reference_code:'PG1'}});throw Error('query timeout');}
 if(u.endsWith('/refund_wallet')){refunds++;return Response.json({success:true,new_balance:3000});}
 throw Error('Unexpected '+u);
 };
 const res={setHeader(){},status(n){this.code=n;return this},json(d){this.body=d;return this}};
 try{await pay({method:'POST',headers:{authorization:'Bearer test'},socket:{remoteAddress:service+outcome},body:{serviceID:service,billersCode:'12345678901',phone:'08012345678',variation_code:service==='dstv'?'plan':'prepaid',amount:service==='waec'?5500:1000,pin:'1234'}},res);
 assert.ok(queries<=2);assert.equal(debits,1);assert.equal(purchases,1);assert.equal(refunds,outcome==='rejected'?1:0);assert.equal(res.body.pending,outcome==='rejected'?undefined:true);assert.equal(patches.at(-1).details.provider,'pairgate');assert.equal(patches.at(-1).details.wallet_debited,true);
 if(outcome==='query-timeout')assert.equal(patches.at(-1).details.provider_reference,'PG1');
 }finally{global.fetch=old;}
});
