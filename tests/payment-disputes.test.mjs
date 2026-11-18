import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler from '../api/payment-disputes.js';

Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'secret'});
const user={id:'11111111-1111-4111-8111-111111111111',email:'customer@example.com'};
function response(){return{headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(d){this.body=d;return this}}}

test('customer creates a payment dispute only for a transaction owned by their session',async()=>{
 const old=global.fetch,calls=[];
 global.fetch=async(url,options={})=>{
  const u=String(url);calls.push([u,options]);
  if(u.includes('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:5,retry_after:0});
  if(u.endsWith('/auth/v1/user'))return Response.json(user);
  if(u.includes('/wallet_transactions?'))return Response.json([{id:'22222222-2222-4222-8222-222222222222',user_id:user.id,request_id:'TRXDATA1',transaction_type:'debit',service:'mtn-data',amount:1000,status:'successful',details:{provider:'pairgate'}}]);
  if(u.includes('/lp_payment_disputes?'))return Response.json([]);
  if(u.endsWith('/lp_payment_disputes')&&options.method==='POST')return Response.json([{case_reference:'LPD-TEST',case_status:'open'}],{status:201});
  throw Error('Unexpected fetch '+u);
 };
 try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer customer-token'},socket:{remoteAddress:'1.2.3.4'},body:{request_id:'TRXDATA1',reason:'not_received',message:'Data did not arrive',user_id:'spoofed'}},res);assert.equal(res.code,201);assert.equal(res.body.case.case_reference,'LPD-TEST');const insert=JSON.parse(calls.find(([u,o])=>u.endsWith('/lp_payment_disputes')&&o.method==='POST')[1].body);assert.equal(insert.user_id,user.id);assert.equal(insert.request_id,'TRXDATA1');assert.equal(insert.transaction_status,'successful');}finally{global.fetch=old;}
});

test('already-refunded transactions cannot open a refund case',async()=>{
 const old=global.fetch;
 global.fetch=async url=>{const u=String(url);if(u.includes('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:5,retry_after:0});if(u.endsWith('/auth/v1/user'))return Response.json(user);if(u.includes('/wallet_transactions?'))return Response.json([{id:'2',user_id:user.id,request_id:'TRX1',transaction_type:'debit',service:'mtn',amount:100,status:'refunded',details:{}}]);throw Error('Unexpected fetch '+u)};
 try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer customer-token'},socket:{remoteAddress:'2.3.4.5'},body:{request_id:'TRX1',reason:'not_received'}},res);assert.equal(res.code,409);assert.equal(res.body.already_refunded,true);}finally{global.fetch=old;}
});

test('refund UI and owner queue keep wallet credit behind verified reconciliation',async()=>{
 const customer=await readFile(new URL('../payment-support-client.js',import.meta.url),'utf8');
 const admin=await readFile(new URL('../api/admin-disputes.js',import.meta.url),'utf8');
 const sql=await readFile(new URL('../supabase/payment-disputes.sql',import.meta.url),'utf8');
 assert.match(customer,/Report a problem/);
 assert.match(customer,/cannot credit a wallet by itself/);
 assert.match(admin,/reconcilePurchase/);
 assert.doesNotMatch(admin,/refund_wallet/);
 assert.match(sql,/one_active_case/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/auth\.uid\(\).*user_id/s);
 assert.doesNotMatch(sql,/grant select, insert/);
});
