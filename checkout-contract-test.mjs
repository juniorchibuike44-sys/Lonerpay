import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import handler from './api/secure-pay.js';
import variations from './api/variations.js';
Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'secret',PAIRGATE_API_KEY:'pair-test'});
const hash='pbkdf2_sha256$100000$salt$'+pbkdf2Sync('1234','salt',100000,32,'sha256').toString('hex');
const json=(d,status=200)=>new Response(JSON.stringify(d),{status});
let network='mtn',mode='success',debits=0,refunds=0,posts=[],patches=[],paths=[];
const res=()=>({setHeader(){},status(n){this.statusCode=n;return this},json(d){this.data=d;return this}});
global.fetch=async(url,o={})=>{
 url=String(url);const p=new URL(url);paths.push(p.pathname+p.search);
 if(url.includes('vtu.ng'))throw Error('VTU must not be called');
 if(url.endsWith('/lp_catalogue_control')){const b=JSON.parse(o.body);if(b.p_action==='claim')return json({state:'acquired'});return json({state:'released'});}
 if(url.endsWith('/auth/v1/user'))return json({id:'user1'});
 if(url.includes('/payment_pins'))return o.method==='PATCH'?json({}):json([{pin_hash:hash,failed_attempts:0}]);
 if(url.endsWith('/lp_profit_save_cost'))return json({saved:true});
 if(url.endsWith('/debit_wallet')){debits++;const b=JSON.parse(o.body);assert.equal(b.p_details.provider,'pairgate');return json({success:true,new_balance:1000});}
 if(url.endsWith('/refund_wallet')){refunds++;return json({success:true,new_balance:1100});}
 if(url.includes('/wallet_transactions')){patches.push(JSON.parse(o.body));return json({});}
 if(url.includes('pairgate.com')){
 assert.equal(o.headers.Authorization,'Bearer pair-test');
 if(p.pathname.endsWith('/data-plans/categories'))return json({status:'success',data:[{provider_name:network,plan_type:'SME',service_type:'data'}]});
 if(p.pathname.endsWith('/data-plans')){assert.equal(o.method,'GET');assert.equal(p.searchParams.get('provider_id'),network);assert.equal(p.searchParams.get('plan_type'),'SME');return json({status:'success',data:{[network.toUpperCase()]:[{plan_id:'45',name:'1GB',price:100,duration:7}]}});}
 if(p.pathname.endsWith('/purchase')){const b=JSON.parse(o.body);posts.push(b);assert.equal(o.method,'POST');assert.equal(o.headers['Content-Type'],'application/json');assert.equal(b.provider_id,network);assert.equal(b.recipient,'08012345678');assert.ok(b.reference.length>=8&&b.reference.length<=100);if(p.pathname.includes('/data/'))assert.deepEqual(Object.keys(b).sort(),['plan_id','provider_id','recipient','reference']);else assert.deepEqual(Object.keys(b).sort(),['amount','provider_id','recipient','reference']);
 if(mode==='timeout')throw Error('timeout');if(mode==='reject')return json({status:'error',message:'Insufficient balance'},422);if(mode==='unknown')return json({message:'bad gateway'},502);
 return json({status:'success',data:{status:true,reference_code:'PG123',balance_before:200,balance_after:100}});}
 if(p.pathname.endsWith('/transaction/status')){assert.equal(p.searchParams.get('reference_code'),'PG123');if(mode==='polltimeout')throw Error('status timeout');return json({status:'success',data:{status:mode==='failed'?'failed':'successful',reference_code:'PG123'}});}
 }
 throw Error('Unexpected '+url);
};
async function pay(net,m='success',data=true,amount=100){network=net;mode=m;debits=refunds=0;posts=[];patches=[];paths=[];const r=res();await handler({method:'POST',headers:{authorization:'Bearer user','x-forwarded-for':Math.random()+''},body:{serviceID:data?(net==='9mobile'?'etisalat-data':net+'-data'):(net==='9mobile'?'etisalat':net),billersCode:'08012345678',variation_code:data?'45':'',amount,pin:'1234'}},r);return r;}
for(const net of ['mtn','airtel','glo','9mobile']){let r=await pay(net);assert.equal(r.statusCode,200);assert.equal(posts[0].plan_id,'45');assert.equal(patches.at(-1).details.provider_cost,100);assert.equal(patches.at(-1).details.gross_profit,0);r=await pay(net,'success',false);assert.equal(r.statusCode,200);assert.equal(posts[0].amount,100);}
let r=await pay('mtn','success',true,101);assert.equal(r.statusCode,409);assert.equal(debits,0);assert.equal(posts.length,0);
r=await pay('mtn','reject');assert.equal(r.data.refunded,true);assert.equal(refunds,1);
r=await pay('mtn','failed');assert.equal(r.data.refunded,true);assert.equal(refunds,1);
for(const m of ['timeout','unknown','polltimeout']){r=await pay('mtn',m);assert.equal(r.statusCode,202);assert.equal(refunds,0);assert.equal(patches.at(-1).details.provider,'pairgate');if(m==='polltimeout')assert.equal(patches.at(-1).details.provider_reference,'PG123');}
for(const net of ['mtn','airtel','glo','9mobile']){network=net;const r=res();await variations({method:'GET',headers:{authorization:'Bearer user'},query:{serviceID:net==='9mobile'?'etisalat-data':net+'-data'}},r);assert.equal(r.statusCode,200);assert.equal(r.data.provider,'pairgate');assert.equal(r.data.variations[0].code,'45');assert.equal(r.data.variations[0].amount,100);assert.match(r.data.variations[0].name,/7 days/);}
console.log('PASS: four-network catalogue and airtime/data POST contracts, authentication headers, raw Pairgate plan IDs, price validation before debit, rejection refunds, transport/5xx/poll timeout pending safety and reference persistence');
