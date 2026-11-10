import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
test('bill debit, reconciliation and refund preserve balances and terminal outcomes',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table wallets(user_id uuid primary key,balance numeric,updated_at timestamptz);
 create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,request_id text unique,transaction_type text,service text,amount numeric,status text,details jsonb default '{}',created_at timestamptz default now(),updated_at timestamptz default now());
 insert into wallets values('11111111-1111-1111-1111-111111111111',10000,now());`);
 await db.exec(await readFile(new URL('../supabase/payment-reconciliation.sql',import.meta.url),'utf8'));
 const uid='11111111-1111-1111-1111-111111111111';
 const debit=async(id,service='enugu')=>(await db.query("select * from debit_wallet($1,1000,$2,$3,'{\"provider\":\"pairgate\",\"billersCode\":\"meter\"}')",[uid,id,service])).rows[0];
 const settle=async(id,status,details={})=>(await db.query('select lp_pairgate_settle($1,$2,$3,$4) as result',[uid,id,status,JSON.stringify(details)])).rows[0].result;
 const balance=async()=>Number((await db.query('select balance from wallets')).rows[0].balance);
 for(const service of ['mtn','mtn-data','enugu','dstv','waec','epin-mtn']){await debit(service,service);assert.equal((await db.query('select status from wallet_transactions where request_id=$1',[service])).rows[0].status,'pending');}
 assert.equal(await balance(),4000);assert.equal((await debit('enugu')).success,false);assert.equal(await balance(),4000);
 await settle('enugu','pending',{reconciliation_state:'needs_review'});
 assert.equal((await settle('enugu','failed',{provider_reference:'PG1',provider_status:'failed'})).status,'refunded');
 assert.equal(await balance(),5000);await settle('enugu','failed');assert.equal(await balance(),5000);
 assert.equal((await settle('enugu','successful',{provider_status:'successful'})).status,'refunded');
 await settle('dstv','successful',{provider_reference:'PG2',provider_status:'successful',purchased_code:'keep'});
 assert.equal((await settle('dstv','failed')).status,'successful');
 assert.equal((await db.query('select * from refund_wallet($1,$2)',[uid,'dstv'])).rows[0].success,false);
 assert.equal(await balance(),5000);
 const row=(await db.query("select details from wallet_transactions where request_id='dstv'")).rows[0];assert.equal(row.details.billersCode,'meter');assert.equal(row.details.purchased_code,'keep');assert.equal(row.details.wallet_debited,true);
 assert.equal(Number((await db.query("select count(*) n from wallet_transactions where transaction_type='refund'")).rows[0].n),1);
 await db.exec('set role authenticated');await assert.rejects(()=>settle('waec','successful'),/permission denied/);await assert.rejects(()=>debit('attack'),/permission denied/);
 }finally{await db.close();}
});
