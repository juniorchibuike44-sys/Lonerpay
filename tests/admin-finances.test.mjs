import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {JSDOM} from 'jsdom';

const migration=await readFile(new URL('../supabase/admin-finances.sql',import.meta.url),'utf8');
test('company snapshot counts every wallet, excludes deposits and reversed sales, includes losses and subscription refunds',async()=>{
 const db=new PGlite();
 await db.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
 create table wallets(user_id uuid,balance numeric);
 create table wallet_transactions(user_id uuid,request_id text,transaction_type text,service text,amount numeric,status text,details jsonb,created_at timestamptz);
 create table lp_business_subscription_payments(user_id uuid,reference text,amount_kobo bigint,received_kobo bigint,fees_kobo bigint,actual_refunded_kobo bigint,status text,paid_at timestamptz,created_at timestamptz);
 insert into auth.users values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"full_name":"Latest Customer"}','customer@example.com');
 insert into wallets select null,1 from generate_series(1,2501);insert into wallets values(null,-50);
 insert into wallet_transactions values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','fund','credit','paystack_wallet_funding',50000,'successful','{}','2026-01-01'),
 (null,'sale','debit','mtn',100,'successful','{"provider_cost":"90"}','2026-01-01'),
 (null,'loss','debit','mtn',100,'successful','{"provider_cost":"110","gross_profit":0}','2026-01-02'),
 (null,'reversed','debit','mtn',200,'refunded','{"provider_cost":"50"}','2026-01-02'),
 (null,'pending','debit','mtn',200,'pending','{"provider_cost":"50"}','2026-01-02');
 insert into lp_business_subscription_payments values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','LPBIZ-latest',100000,101523,1523,0,'paid','2026-02-01','2026-02-01'),
 (null,'LPBIZ-refunded',100000,100000,1500,100000,'refunded','2026-01-01','2026-01-01'),
 (null,'LPBIZ-pending',100000,null,null,0,'pending',null,'2025-01-01');`);
 await db.exec(migration);await db.exec(migration);
 const snapshot=async()=>(await db.query('select lp_admin_finances() as f')).rows[0].f;
 let f=await snapshot();assert.equal(f.customer_available,2501);assert.equal(f.wallet_count,2502);assert.equal(f.negative_wallets,1);assert.equal(f.service_margin,0);assert.equal(f.subscription_net,985);assert.equal(f.recorded_profit,985);assert.equal(f.profit_complete,true);assert.equal(f.latest_transaction.customer_name,'Latest Customer');assert.equal(f.latest_transaction.reference,'LPBIZ-latest');
 await db.exec(`insert into wallet_transactions values(null,'missing','debit','glo',100,'successful','{"provider_cost":"unknown"}','2026-03-01')`);
 f=await snapshot();assert.equal(f.unpriced_sales,1);assert.equal(f.profit_complete,false);assert.equal(f.recorded_profit,985);assert.equal(f.latest_transaction.customer_name,'Name not provided');
 await db.exec('set role authenticated');await assert.rejects(snapshot,/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(snapshot,/permission denied/);await db.exec('reset role;set role service_role');assert.equal((await snapshot()).customer_available,2501);await db.close();
});

test('admin view separates all-time customer liability from recorded earnings and escapes customer names',async()=>{
 const html=await readFile(new URL('../ceo.html',import.meta.url),'utf8');
 const data={generated_at:new Date().toISOString(),period_days:30,totals:{},transactions:[],finances:{customer_available:4567,recorded_profit:12,service_margin:2,subscription_net:10,profit_complete:false,unpriced_sales:3,unknown_subscription_fees:1,latest_transaction:{customer_name:'<img src=x onerror=alert(1)>',reference:'last',date:new Date().toISOString(),amount:100,status:'successful',service:'MTN'}}};
 const dom=new JSDOM(html,{url:'https://lonerpay.com/ceo.html',runScripts:'dangerously',beforeParse(w){w.localStorage.setItem('lonerpay_access_token','test');w.fetch=async()=>({ok:true,json:async()=>data});w.setInterval=()=>0;}});
 await new Promise(r=>setTimeout(r,30));const root=dom.window.document.querySelector('#content');assert.match(root.textContent,/4,567.00/);assert.match(root.textContent,/Total profit · recorded/);assert.match(root.textContent,/Incomplete: some costs are missing/);assert.match(root.textContent,/3 successful service sales/);assert.equal(root.querySelector('img'),null);
 dom.window.eval(`report.finances=null;report.finance_error='Finance report unavailable';render()`);assert.match(root.textContent,/Finance report unavailable/);dom.window.close();
});
