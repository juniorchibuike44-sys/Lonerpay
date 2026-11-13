import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import webhook from '../api/monnify-webhook.js';
import cron from '../api/monnify-reconcile.js';
import {fundingNotification,processFunding} from '../api/_monnify-reconciliation.js';
import admin from '../api/admin-funding-review.js';
const uid='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222',reference='LP-live-'+uid;
const env={MONNIFY_ENABLED:'true',MONNIFY_ROLLOUT:'all',MONNIFY_MODE:'live',MONNIFY_API_KEY:'key',MONNIFY_SECRET_KEY:'secret',MONNIFY_CONTRACT_CODE:'contract',SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'db-test'};
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}});
function notification(ref='MNFY|1'){return {eventType:'SUCCESSFUL_TRANSACTION',eventData:{transactionReference:ref,product:{type:'RESERVED_ACCOUNT',reference},amountPaid:'100.00',customer:{bvn:'DO-NOT-STORE'},paymentSourceInformation:{accountNumber:'DO-NOT-STORE'}}};}
function request(n){const raw=Buffer.from(JSON.stringify(n)),r=Readable.from([raw]);r.method='POST';r.headers={'monnify-signature':createHmac('sha512','secret').update(raw).digest('hex')};return r;}
async function fixture(fn){const before={...process.env},fetch=globalThis.fetch;Object.assign(process.env,env);try{await fn();}finally{globalThis.fetch=fetch;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}}

test('notifications contain only reconciliation fields, not customer identities',()=>{
 const row=fundingNotification(notification());assert.ok(!JSON.stringify(row).includes('DO-NOT-STORE'));
 assert.equal(fundingNotification({eventType:'SETTLEMENT_COMPLETED'}),null);
 assert.throws(()=>fundingNotification({...notification(),eventData:{...notification().eventData,amountPaid:{bvn:'bad'}}}));
});

test('durable replay, refund holds, refund-before-credit and explicit audited resolution preserve money',()=>fixture(async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${uid}'),('${other}');
 create table wallets(user_id uuid primary key,balance numeric,currency text,updated_at timestamptz);
 create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,request_id text unique,transaction_type text,service text,amount numeric,status text,details jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
 create table lp_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,title text,body text,funding_transaction_id uuid unique);
 grant all on lp_notifications to service_role;
 insert into wallets values('${uid}',21,'NGN',now()),('${other}',50,'NGN',now());`);
 await db.exec(await readFile(new URL('../supabase/monnify-funding.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/payment-reconciliation.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/monnify-reconciliation.sql',import.meta.url),'utf8'));
 assert.equal(Number((await db.query('select balance from wallets where user_id=$1',[uid])).rows[0].balance),21);
 await db.query("insert into lp_monnify_accounts(user_id,mode,account_reference,status,accounts) values($1,'live',$2,'ACTIVE','[]')",[uid,reference]);
 let outage=true;
 globalThis.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,u=new URL(url),q=u.searchParams;
  if(url.endsWith('/api/v1/auth/login'))return Response.json({requestSuccessful:true,responseBody:{accessToken:'token'}});
  if(url.includes('/merchant/transactions/query?')){if(outage)throw Error('outage');return Response.json({requestSuccessful:true,responseBody:{...notification(q.get('transactionReference')).eventData,paymentStatus:'PAID',currency:'NGN',paymentMethod:'ACCOUNT_TRANSFER',settlementAmount:'99.00'}});}
  if(url.includes('/lp_monnify_accounts?'))return Response.json([{user_id:uid,account_reference:reference,mode:'live',status:'ACTIVE'}]);
  if(url.endsWith('/rpc/lp_monnify_enqueue'))return Response.json((await db.query('select lp_monnify_enqueue($1,$2,$3,$4) result',[body.p_id,body.p_reference,body.p_type,body.p_payload])).rows[0].result);
  if(url.endsWith('/rpc/lp_credit_monnify'))return Response.json((await db.query('select lp_credit_monnify($1,$2,$3,$4) result',[body.p_account,body.p_mode,body.p_reference,body.p_amount])).rows[0].result);
  if(url.endsWith('/rpc/lp_monnify_review'))return Response.json((await db.query('select lp_monnify_review($1,$2) result',[body.p_reference,body.p_reason])).rows[0].result);
  if(url.includes('/lp_monnify_inbox?')&&options.method==='PATCH'){
   await db.query('update lp_monnify_inbox set state=coalesce($1,state),checked_at=$2,last_error=$3,verified=coalesce($4,verified) where id=$5',[body.state||null,body.checked_at,body.last_error||null,body.verified||null,q.get('id').slice(3)]);return Response.json([]);
  }
  if(url.includes('/lp_monnify_inbox?'))return Response.json((await db.query('select * from lp_monnify_inbox where reference=$1 and event_type=$2',[q.get('reference')?.slice(3),q.get('event_type')?.slice(3)])).rows);
  throw Error('Unexpected URL');
 };
 await db.exec('set role service_role');
 let res=response();await webhook(request(notification()),res);assert.equal(res.code,200);assert.equal(res.data.pending,true);
 let stored=(await db.query('select * from lp_monnify_inbox')).rows[0];assert.equal(stored.state,'pending');assert.ok(!JSON.stringify(stored).includes('DO-NOT-STORE'));
 assert.equal(Number((await db.query('select balance from wallets where user_id=$1',[uid])).rows[0].balance),21);
 outage=false;assert.equal((await processFunding(stored)).credited,true);
 res=response();await webhook(request(notification()),res);assert.equal(res.data.credited,false);
 assert.equal(Number((await db.query('select balance from wallets where user_id=$1',[uid])).rows[0].balance),121);
 const verified=(await db.query('select verified from lp_monnify_inbox')).rows[0].verified;assert.equal(verified.provider_net_amount,99);assert.equal(verified.provider_fee,1);
 const refund={eventType:'SUCCESSFUL_REFUND',eventData:{transactionReference:'MNFY|1',refundReference:'refund-1',refundStatus:'COMPLETED'}};
 res=response();await webhook(request(refund),res);assert.equal(res.code,200);
 assert.equal((await db.query('select funding_hold from wallets where user_id=$1',[uid])).rows[0].funding_hold,true);
 await assert.rejects(()=>db.query('select * from debit_wallet($1,1,$2,$3,$4)',[uid,'purchase-on-hold','mtn',{provider:'pairgate'}]),/under review/);
 assert.equal(Number((await db.query("select count(*) n from wallet_transactions where request_id='purchase-on-hold'")).rows[0].n),0);
 await db.query('update wallets set balance=balance-1 where user_id=$1',[other]);
 assert.equal(Number((await db.query('select balance from wallets where user_id=$1',[other])).rows[0].balance),49);
 await db.exec('set role authenticated');await assert.rejects(()=>db.query('select lp_monnify_resolve_review($1,$2,$3)',['MNFY|1',uid,'I reconciled the original payment with the bank.']),/permission denied/);
 await db.exec('set role service_role');
 await assert.rejects(()=>db.query('select lp_monnify_resolve_review($1,$2,$3)',['MNFY|1',uid,'short']),/note/);
 await db.query('select lp_monnify_resolve_review($1,$2,$3)',['MNFY|1',uid,'I reconciled the original payment and recovered the funds.']);
 assert.equal((await db.query('select funding_hold from wallets where user_id=$1',[uid])).rows[0].funding_hold,false);
 res=response();await webhook(request(refund),res);assert.equal((await db.query('select funding_hold from wallets where user_id=$1',[uid])).rows[0].funding_hold,false);
 assert.equal(Number((await db.query('select count(*) n from lp_monnify_review_actions')).rows[0].n),1);
 const earlyRefund={eventType:'SUCCESSFUL_REFUND',eventData:{transactionReference:'MNFY|2',refundReference:'early',refundStatus:'COMPLETED'}};
 res=response();await webhook(request(earlyRefund),res);res=response();await webhook(request(notification('MNFY|2')),res);assert.equal(res.data.credited,false);
 await assert.rejects(()=>db.query('select lp_credit_monnify($1,$2,$3,$4)',[reference,'live','MNFY|2',100]),/requires review/);
 assert.equal(Number((await db.query('select balance from wallets where user_id=$1',[uid])).rows[0].balance),121);
 const again={...refund,eventData:{...refund.eventData,refundReference:'refund-2'}};res=response();await webhook(request(again),res);
 assert.equal((await db.query('select funding_hold from wallets where user_id=$1',[uid])).rows[0].funding_hold,true);
 }finally{await db.close();}
}));

test('cron and review resolution require authentication; customer metadata grants no admin rights',()=>fixture(async()=>{
 let r=response();await cron({method:'GET',headers:{}},r);assert.equal(r.code,401);
 globalThis.fetch=async(url)=>Response.json(url.endsWith('/rpc/lp_check_rate_limit')?{allowed:true,remaining:10,retry_after:0}:{id:uid,email:'customer@example.com',user_metadata:{role:'owner'}});
 r=response();await admin({method:'POST',headers:{authorization:'Bearer user'},body:{reference:'MNFY|1',funds_reconciled:true,note:'I reconciled all the funds.'}},r);assert.equal(r.code,403);
}));
