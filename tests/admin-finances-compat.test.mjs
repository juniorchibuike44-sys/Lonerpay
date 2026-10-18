import test from 'node:test';import assert from 'node:assert/strict';
import {completeFinanceDetails} from '../api/_admin-finance-details.js';
test('older SQL response gets live wallet details and three named purchases without a migration',async()=>{
 const original=fetch;let requests=[];globalThis.fetch=async(url,options)=>{
  requests.push(url);assert.equal(options.headers.Authorization,'Bearer server');assert.equal(options.cache,'no-store');
  const u=new URL(url);let body;
  if(u.pathname==='/rest/v1/wallets'){assert.equal(u.searchParams.get('balance'),'gt.0');body=[{user_id:'owner',balance:11200},{user_id:'customer',balance:21}];}
  else if(u.pathname==='/rest/v1/wallet_transactions'){assert.equal(u.searchParams.get('status'),'eq.successful');assert.equal(u.searchParams.get('transaction_type'),'eq.debit');body=[{user_id:'customer',request_id:'p3',service:'mtn-data',amount:80,status:'successful',created_at:'2026-10-18T10:00:00Z',details:{variation_code:'302'}},{user_id:'customer',request_id:'p2',service:'mtn',amount:100,status:'successful',created_at:'2026-10-18T09:00:00Z'},{user_id:'owner',request_id:'p1',service:'glo',amount:200,status:'successful',created_at:'2026-10-17T08:00:00Z'}];}
  else if(u.pathname==='/rest/v1/lp_business_subscription_payments')body=[{user_id:'owner',reference:'LPBIZ-test',amount_kobo:100000,received_kobo:101523,status:'paid',paid_at:'2026-10-18T07:00:00Z'}];
  else if(u.pathname.endsWith('/owner'))body={email:'juniorchibuike44@gmail.com',user_metadata:{full_name:'Owner Name'}};
  else if(u.pathname.endsWith('/customer'))body={email:'customer@example.com',user_metadata:{full_name:'Customer Name'}};
  else throw Error(url);
  return {ok:true,headers:new Headers({'content-range':'0-1/2'}),json:async()=>body};
 };
 try{const f=await completeFinanceDetails({supabaseUrl:'https://db.example',secretKey:'server'},{scope:'company',customer_available:11221,recorded_profit:1000});assert.equal(f.balance_breakdown.length,2);assert.equal(f.balance_breakdown[0].customer_name,'Owner Name');assert.equal(f.balance_breakdown[0].is_owner,true);assert.equal(f.breakdown_other_balance,0);assert.equal(f.last_purchases.length,3);assert.deepEqual(f.last_purchases.map(p=>p.reference),['p3','p2','LPBIZ-test']);assert.equal(f.last_purchases[0].customer_name,'Customer Name');assert.equal(f.last_purchases[0].plan_code,'302');assert.equal(f.recorded_profit,1000);assert.equal(requests.filter(p=>p.includes('/auth/')).length,2);}finally{globalThis.fetch=original;}
});
test('failed detail reads stay unavailable and do not fabricate zero balances or empty purchase history',async()=>{const old=fetch;globalThis.fetch=async()=>({ok:false,json:async()=>({error:'unavailable'})});try{const f=await completeFinanceDetails({supabaseUrl:'https://db.example',secretKey:'server'},{scope:'company',customer_available:11221});assert.equal(f.balance_breakdown,undefined);assert.equal(f.last_purchases,undefined);assert.match(f.balance_breakdown_error,/could not be read/);assert.equal(f.customer_available,11221);}finally{globalThis.fetch=old;}});
test('current SQL detail arrays need no fallback requests',async()=>{const old=fetch;globalThis.fetch=()=>{throw Error('Must not query');};try{const f=await completeFinanceDetails({}, {balance_breakdown:[],last_purchases:[]});assert.deepEqual(f.balance_breakdown,[]);assert.deepEqual(f.last_purchases,[]);}finally{globalThis.fetch=old;}});
