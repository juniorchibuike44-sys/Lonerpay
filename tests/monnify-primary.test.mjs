import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import virtual from '../api/virtual-account.js';
import initialize from '../api/fund-wallet/initialize.js';
import access from '../api/monnify-access.js';
import {monnifyIsPrimary} from '../api/_monnify.js';
import kyc from '../api/kyc/status.js';
const uid='11111111-1111-1111-1111-111111111111';
const env={MONNIFY_ENABLED:'true',MONNIFY_PRIMARY:'true',MONNIFY_ROLLOUT:'pilot',MONNIFY_PILOT_USER_ID:uid,MONNIFY_MODE:'live',MONNIFY_API_KEY:'key',MONNIFY_SECRET_KEY:'secret',MONNIFY_CONTRACT_CODE:'contract',SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'db-test',PAYSTACK_SECRET_KEY:'sk_live_test'};
const bank={account_number:'1234567890',bank_name:'Moniepoint Microfinance Bank',account_name:'Test User'};
const res=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}});
async function fixture(fn){const old={...process.env},fetch=globalThis.fetch;Object.assign(process.env,env);try{await fn();}finally{globalThis.fetch=fetch;for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}}
function mock(id=uid){const calls=[];globalThis.fetch=async(url,options={})=>{
 calls.push({url,options});
 if(url.endsWith('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:7,retry_after:0});
 if(url.endsWith('/auth/v1/user'))return Response.json({id,email:'test@example.com'});
 if(url.includes('/lp_monnify_accounts?'))return Response.json([{status:'ACTIVE',accounts:[bank]}]);
 if(url.includes('/virtual_accounts?'))return Response.json([{account_number:'9999999999',bank_name:'Legacy Bank',account_name:'Test User',assignment_status:'assigned'}]);
 throw Error('Unexpected external request');
};return calls;}
const req=method=>({method,headers:{authorization:'Bearer user'},body:{amount:100}});

test('primary selection is server owned and restricted to the pilot account',()=>fixture(async()=>{
 assert.equal(monnifyIsPrimary(uid),true);assert.equal(monnifyIsPrimary('other'),false);
 mock();let r=res();await access(req('GET'),r);assert.equal(r.data.primary,true);assert.equal(r.data.available,true);
 delete process.env.MONNIFY_SECRET_KEY;r=res();await access(req('GET'),r);assert.equal(r.data.primary,true);assert.equal(r.data.available,false);
}));
test('migrated virtual account displays Monnify and never queries the legacy account',()=>fixture(async()=>{
 const calls=mock(),r=res();await virtual(req('GET'),r);
 assert.equal(r.code,200);assert.equal(r.data.provider,'monnify');assert.equal(r.data.virtual_account.account_number,bank.account_number);assert.equal(r.data.virtual_account.assignment_status,'assigned');
 assert.ok(!calls.some(c=>c.url.includes('/virtual_accounts?')||c.url.includes('api.paystack.co')));
}));
test('stale account forms and Paystack checkouts cannot create new Paystack funding for migrated users',()=>fixture(async()=>{
 const calls=mock();let r=res();await virtual(req('POST'),r);assert.equal(r.code,409);assert.equal(r.data.code,'funding_provider_changed');
 r=res();await initialize(req('POST'),r);assert.equal(r.code,409);assert.equal(r.data.code,'funding_provider_changed');assert.ok(!calls.some(c=>c.url.includes('api.paystack.co')));
}));
test('unmigrated customers retain their existing account details',()=>fixture(async()=>{
 const calls=mock('other'),r=res();await virtual(req('GET'),r);assert.equal(r.code,200);assert.equal(r.data.virtual_account.account_number,'9999999999');assert.ok(!calls.some(c=>c.url.includes('/lp_monnify_accounts?')));
}));

test('customer-wide rollout selects Monnify for other users and replaces legacy Profile KYC records',()=>fixture(async()=>{
 process.env.MONNIFY_ROLLOUT='all';const calls=mock('other');assert.equal(monnifyIsPrimary('other'),true);
 let r=res();await access(req('GET'),r);assert.equal(r.data.primary,true);assert.equal(r.data.available,true);
 r=res();await virtual(req('GET'),r);assert.equal(r.data.provider,'monnify');assert.equal(r.data.virtual_account.account_number,bank.account_number);
 r=res();await kyc(req('GET'),r);assert.equal(r.data.provider,'monnify');assert.equal(r.data.status,'verified');assert.equal(r.data.account_number,bank.account_number);
 assert.ok(calls.filter(c=>c.url.includes('/lp_monnify_accounts?')).every(c=>c.url.includes('user_id=eq.other')));
 assert.ok(!calls.some(c=>c.url.includes('/virtual_accounts?')||c.url.includes('api.paystack.co')));
}));

test('Profile scripts parse after retirement of the old verification form',async()=>{
 const html=await readFile(new URL('../profile.html',import.meta.url),'utf8');const dom=new JSDOM(html);
 try{const {default:vm}=await import('node:vm');for(const script of dom.window.document.scripts)if(!script.src&&(!script.type||script.type==='text/javascript'))new vm.Script(script.textContent);assert.ok(!html.includes('id="kycBvn"'));assert.ok(html.includes('dashboard.html#fund-wallet'));}finally{dom.window.close();}
});

const source=await readFile(new URL('../monnify-funding.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,10));
async function until(fn){for(let n=0;n<30&&!fn();n++)await tick();assert.ok(fn());}
test('all funding entry points select Monnify while the old provider is never opened',async()=>{
 const dom=new JSDOM('<div class="balance"><p class="lp-virtual-account-hint"></p></div><div class="services"><div class="service"><h3>Education</h3></div></div>',{url:'https://lonerpay.com',runScripts:'outside-only'});
 try{
 const w=dom.window;w.localStorage.setItem('lonerpay_access_token','session');let legacy=0;
 for(const name of ['openFundWallet','addDemoFunds','openVirtualAccount'])w[name]=()=>legacy++;
 w.fetch=async(url)=>Response.json(url==='/api/monnify-access'?{available:true,primary:true,pilot:true}:{success:true,account:{accounts:[bank]}});
 w.eval(source);await until(()=>w.document.querySelector('.lp-primary-restricted'));
 assert.equal(w.document.getElementById('lpMonnifyPilot'),null);
 for(const name of ['openFundWallet','addDemoFunds','openVirtualAccount']){
  await w[name]();await until(()=>w.document.getElementById('lpMnfRefresh'));
  assert.equal(w.document.getElementById('lpMnfTitle').textContent,'Fund Wallet');
  assert.ok(w.document.getElementById('lpMonnifyOverlay').textContent.includes('Moniepoint Microfinance Bank'));
  w.document.getElementById('lpMnfClose').click();
 }
 assert.equal(legacy,0);
 }finally{dom.window.close();}
});
test('provider discovery failure never silently opens a legacy checkout',async()=>{
 const dom=new JSDOM('<div class="balance"></div>',{url:'https://lonerpay.com',runScripts:'outside-only'});
 try{
 const w=dom.window;w.localStorage.setItem('lonerpay_access_token','session');let legacy=0,alerts=0;
 w.openFundWallet=()=>legacy++;w.alert=()=>alerts++;w.fetch=async()=>{throw Error('offline');};
 w.eval(source);await tick();await w.openFundWallet();assert.equal(legacy,0);assert.equal(alerts,1);
 }finally{dom.window.close();}
});
