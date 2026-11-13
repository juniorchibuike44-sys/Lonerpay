import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import handler from '../api/monnify-webhook.js';
import {processFunding} from '../api/_monnify-reconciliation.js';
import accountHandler,{accountView} from '../api/monnify-account.js';
import {moneyKobo,validMonnifySignature,validateReservedPayment,monnifyConfig} from '../api/_monnify.js';

const uid='11111111-1111-1111-1111-111111111111';
const account={user_id:uid,account_reference:'LP-live-'+uid,status:'ACTIVE',mode:'live'};
const payment={transactionReference:'MNFY|test|1',paymentStatus:'PAID',currency:'NGN',paymentMethod:'ACCOUNT_TRANSFER',product:{type:'RESERVED_ACCOUNT',reference:account.account_reference},amountPaid:'5000.00',settlementAmount:'4950.00'};
const env={MONNIFY_ENABLED:'true',MONNIFY_ROLLOUT:'all',MONNIFY_MODE:'live',MONNIFY_API_KEY:'test-key',MONNIFY_SECRET_KEY:'test-secret',MONNIFY_CONTRACT_CODE:'contract',SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'db-test'};
function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(d){this.data=d;return this;}};}
function webhook(data,signature){const raw=Buffer.from(JSON.stringify(data));const req=Readable.from([raw]);req.method='POST';req.headers={'monnify-signature':signature??createHmac('sha512',env.MONNIFY_SECRET_KEY).update(raw).digest('hex')};return req;}
async function fixture(fn){const before={...process.env};const fetch=globalThis.fetch;Object.assign(process.env,env);try{await fn();}finally{globalThis.fetch=fetch;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}}

test('funding validation rejects tampering, wrong ownership, currency, status, and imprecise amounts',()=>{
 for(const v of [null,'','NaN',Infinity,-1,0,'1.001','1e3',{},true])assert.throws(()=>moneyKobo(v));
 assert.equal(moneyKobo('100.01'),10001);
 const raw=Buffer.from('{ "event": true }');const signature=createHmac('sha512','secret').update(raw).digest('hex');
 assert.ok(validMonnifySignature(raw,signature,'secret'));
 assert.equal(validMonnifySignature(Buffer.from('{"event":true}'),signature,'secret'),false);
 assert.equal(validMonnifySignature(raw,'wrong','secret'),false);
 assert.equal(validateReservedPayment(payment,payment,account,{mode:'live',contract:'contract'}).p_amount,5000);
 for(const patch of [{currency:'USD'},{paymentStatus:'PENDING'},{paymentStatus:'REVERSED'},{paymentMethod:'CARD'},{transactionReference:'other'},{product:{type:'RESERVED_ACCOUNT',reference:'victim'}},{amountPaid:'4999'},{contractCode:'other'}])assert.throws(()=>validateReservedPayment({...payment,...patch},payment,account,{mode:'live',contract:'contract'}));
 assert.throws(()=>validateReservedPayment(payment,payment,{...account,mode:'sandbox'},{mode:'live'}));
 assert.throws(()=>accountView({accountReference:'other'},account.account_reference,{contract:'contract'}));
});

test('webhook is disabled by default and invalid signatures never reach the API or ledger',()=>fixture(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 delete process.env.MONNIFY_ENABLED;let res=response();await handler(webhook({}),res);assert.equal(res.code,503);assert.equal(calls,0);
 assert.throws(()=>monnifyConfig());process.env.MONNIFY_ENABLED='true';
 res=response();await handler(webhook({eventType:'SUCCESSFUL_TRANSACTION'},'0'.repeat(128)),res);assert.equal(res.code,401);assert.equal(calls,0);
 res=response();await handler(webhook({eventType:'SETTLEMENT_COMPLETED'}),res);assert.equal(res.code,200);assert.equal(calls,0);
}));

test('verified worker and SQL credit once; conflicts, DB failures, and API outages cannot double credit',()=>fixture(async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${uid}');
 create table wallets(user_id uuid primary key,balance numeric,currency text,updated_at timestamptz);
 create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,request_id text unique,transaction_type text,service text,amount numeric,status text,details jsonb);
 insert into wallets values('${uid}',100,'NGN',now());`);
 await db.exec(await readFile(new URL('../supabase/monnify-funding.sql',import.meta.url),'utf8'));
 await db.exec(`create table lp_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,title text,body text,funding_transaction_id uuid unique);
 create table lp_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid);
 create table lp_push_jobs(notification_id uuid,subscription_id uuid,user_id uuid);
 grant all on lp_notifications,lp_push_subscriptions,lp_push_jobs to service_role;
 insert into lp_push_subscriptions(user_id) values('${uid}');`);
 await db.exec(await readFile(new URL('../supabase/monnify-funding-alerts.sql',import.meta.url),'utf8'));
 await db.exec('create trigger lp_funding_notice after insert or update of status on wallet_transactions for each row execute function lp_funding_notice()');
 await db.query('insert into lp_monnify_accounts(user_id,mode,account_reference,status,accounts) values($1,$2,$3,$4,$5)',[uid,'live',account.account_reference,'ACTIVE','[]']);
 let apiPayment=payment,dbFail=false,apiFail=false,creditCalls=0;
 globalThis.fetch=async(url,options={})=>{
   if(url.endsWith('/api/v1/auth/login'))return Response.json({requestSuccessful:true,responseBody:{accessToken:'token'}});
   if(url.includes('/merchant/transactions/query?')){assert.ok(url.includes(encodeURIComponent(payment.transactionReference)));if(apiFail)throw Error('timeout');return Response.json({requestSuccessful:true,responseBody:apiPayment});}
   if(url.includes('/lp_monnify_accounts?'))return Response.json([account]);
   if(url.includes('/lp_monnify_inbox?'))return Response.json([]);
   if(url.endsWith('/rpc/lp_credit_monnify')){creditCalls++;if(dbFail)return Response.json({}, {status:503});const p=JSON.parse(options.body);const result=await db.query('select lp_credit_monnify($1,$2,$3,$4) as result',[p.p_account,p.p_mode,p.p_reference,p.p_amount]);return Response.json(result.rows[0].result);}
   throw Error('Unexpected URL');
 };
 const call=async()=>{const result=await processFunding({id:'test',reference:payment.transactionReference,event_type:'SUCCESSFUL_TRANSACTION',payload:payment,state:'pending'},{mode:'live',rollout:'all',contract:'contract',apiKey:'key',secret:'secret',base:'https://api.monnify.com'});return {code:result.pending?503:200,data:result};};
 await db.exec('set role service_role');
 assert.equal((await call()).data.credited,true);assert.equal((await call()).data.credited,false);
 assert.equal(Number((await db.query('select balance from wallets')).rows[0].balance),5100);
 assert.equal(Number((await db.query('select count(*) as n from wallet_transactions')).rows[0].n),1);
 assert.equal(Number((await db.query('select count(*) as n from lp_notifications')).rows[0].n),1);
 assert.equal(Number((await db.query('select count(*) as n from lp_push_jobs')).rows[0].n),1);
 await db.exec('reset role');
 apiPayment={...payment,currency:'USD'};assert.equal((await call()).code,503);assert.equal(creditCalls,2);
 apiPayment=payment;apiFail=true;assert.equal((await call()).code,503);assert.equal(creditCalls,2);apiFail=false;
 dbFail=true;assert.equal((await call()).code,503);dbFail=false;
 await assert.rejects(()=>db.query('select lp_credit_monnify($1,$2,$3,$4)',[account.account_reference,'live',payment.transactionReference,4000]),/conflict/);
 await assert.rejects(()=>db.query('select lp_credit_monnify($1,$2,$3,$4)',[account.account_reference,'sandbox','sandbox',5000]),/Invalid/);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select lp_credit_monnify($1,$2,$3,$4)',[account.account_reference,'live','attack',5000]),/permission denied/);
 await assert.rejects(()=>db.query('select * from lp_monnify_accounts'),/permission denied/);
 await db.exec('reset role');
 // A failure updating the wallet must roll back the receipt too, allowing a safe retry.
 await db.exec('alter table wallets add constraint balance_limit check(balance <= 5100)');
 await assert.rejects(()=>db.query('select lp_credit_monnify($1,$2,$3,$4)',[account.account_reference,'live','rollback',1]),/balance_limit/);
 assert.equal(Number((await db.query("select count(*) n from wallet_transactions where request_id='MONNIFY:rollback'")).rows[0].n),0);
 }finally{await db.close();}
}));

test('account creation binds authenticated user, requires KYC consent, and never stores identity numbers',()=>fixture(async()=>{
 const provider={accountReference:account.account_reference,contractCode:'contract',currencyCode:'NGN',status:'ACTIVE',accountName:'Test User',bvn:'12345678901',accounts:[{accountNumber:'1234567890',bankName:'Test Bank',bankCode:'001'}]};
 let creation=0,saved=null,consent=false;
 globalThis.fetch=async(url,options={})=>{
  if(url.endsWith('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:7,retry_after:0});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,email:'test@example.com'});
  if(url.includes('/lp_monnify_accounts?')&&options.method==='GET')return Response.json([]);
  if(url.endsWith('/api/v1/auth/login'))return Response.json({requestSuccessful:true,responseBody:{accessToken:'token'}});
  if(url.endsWith('/api/v2/bank-transfer/reserved-accounts')){creation++;const body=JSON.parse(options.body);assert.equal(body.accountReference,account.account_reference);assert.equal(body.customerEmail,'test@example.com');return Response.json({requestSuccessful:true,responseBody:provider});}
  if(url.includes('/lp_monnify_accounts?')&&options.method==='POST'){saved=JSON.parse(options.body);return Response.json([saved]);}
  throw Error('Unexpected URL '+url);
 };
 const req=()=>({method:'POST',headers:{authorization:'Bearer user'},body:{full_name:'Test User',bvn:'12345678901',consent,user_id:'victim'}});
 let res=response();await accountHandler(req(),res);assert.equal(res.code,400);assert.equal(creation,0);
 consent=true;res=response();await accountHandler(req(),res);assert.equal(res.code,200);assert.equal(creation,1);assert.equal(saved.user_id,uid);assert.ok(!JSON.stringify(saved).includes('12345678901'));assert.ok(!JSON.stringify(res.data).includes('12345678901'));
}));

test('account recovery reuses the exact provider reference after an ambiguous creation',()=>fixture(async()=>{
 let creates=0,recoveries=0;
 globalThis.fetch=async(url,options={})=>{
  if(url.endsWith('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:7,retry_after:0});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:uid,email:'test@example.com'});
  if(url.includes('/lp_monnify_accounts?'))return Response.json(options.method==='GET'?[]:[{}]);
  if(url.endsWith('/api/v1/auth/login'))return Response.json({requestSuccessful:true,responseBody:{accessToken:'token'}});
  if(options.method==='POST'&&url.endsWith('/reserved-accounts')){creates++;throw Error('timeout after provider accepted');}
  if(url.endsWith('/reserved-accounts/'+encodeURIComponent(account.account_reference))){recoveries++;return Response.json({requestSuccessful:true,responseBody:{accountReference:account.account_reference,contractCode:'contract',currencyCode:'NGN',status:'ACTIVE',accountName:'Test User',accounts:[{accountNumber:'1234567890',bankName:'Test Bank'}]}});}
  throw Error('Unexpected URL');
 };
 const res=response();await accountHandler({method:'POST',headers:{authorization:'Bearer token'},body:{full_name:'Test User',nin:'12345678901',consent:true}},res);
 assert.equal(res.code,200);assert.equal(creates,1);assert.equal(recoveries,1);
}));

test('signed sandbox notifications are verified but never credit a production wallet',()=>fixture(async()=>{
 process.env.MONNIFY_MODE='sandbox';
 const sandboxAccount={...account,mode:'sandbox'};
 let credited=false;
 globalThis.fetch=async(url)=>{
  if(url.includes('/lp_monnify_accounts?'))return Response.json([sandboxAccount]);
  if(url==='https://sandbox.monnify.com/api/v1/auth/login')return Response.json({requestSuccessful:true,responseBody:{accessToken:'token'}});
  if(url.startsWith('https://sandbox.monnify.com/api/v2/merchant/transactions/query?'))return Response.json({requestSuccessful:true,responseBody:payment});
  credited=true;throw Error('unexpected');
 };
 const res=response();await handler(webhook({eventType:'SUCCESSFUL_TRANSACTION',eventData:payment}),res);
 assert.equal(res.code,200);assert.equal(res.data.credited,false);assert.equal(credited,false);
}));
