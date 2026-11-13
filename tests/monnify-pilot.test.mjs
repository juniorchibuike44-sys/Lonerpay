import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {monnifyConfig,monnifyAccessAllowed} from '../api/_monnify.js';
import access from '../api/monnify-access.js';
import account from '../api/monnify-account.js';
import webhook from '../api/monnify-webhook.js';
const uid='11111111-1111-1111-1111-111111111111';
const source=await readFile(new URL('../monnify-funding.js',import.meta.url),'utf8');
const env={MONNIFY_ENABLED:'true',MONNIFY_MODE:'live',MONNIFY_ROLLOUT:'pilot',MONNIFY_PILOT_USER_ID:uid,MONNIFY_API_KEY:'key',MONNIFY_SECRET_KEY:'secret',MONNIFY_CONTRACT_CODE:'contract',SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'db-secret'};
const res=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}});
async function fixture(fn){const before={...process.env},fetch=globalThis.fetch;Object.assign(process.env,env);try{await fn();}finally{globalThis.fetch=fetch;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}}
const tick=()=>new Promise(r=>setTimeout(r,10));
async function until(fn){for(let n=0;n<30&&!fn();n++)await tick();assert.ok(fn(),'UI did not reach expected state');}

test('pilot fails closed unless a server-configured user is authenticated',()=>fixture(async()=>{
 const config=monnifyConfig();assert.equal(monnifyAccessAllowed(config,uid),true);assert.equal(monnifyAccessAllowed(config,'other'),false);
 delete process.env.MONNIFY_PILOT_USER_ID;assert.throws(()=>monnifyConfig());process.env.MONNIFY_PILOT_USER_ID=uid;
 let provider=0;globalThis.fetch=async(url)=>{
  if(url.endsWith('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:7,retry_after:0});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'other',email:'owner@example.com',user_metadata:{id:uid,role:'owner'}});
  provider++;throw Error('No provider or ledger call should occur');
 };
 const req={method:'GET',headers:{authorization:'Bearer user'},query:{user_id:uid}};
 let r=res();await access(req,r);assert.equal(r.code,200);assert.equal(r.data.available,false);
 r=res();await account(req,r);assert.equal(r.code,403);assert.equal(provider,0);
}));

test('a signed payment for a non-pilot user cannot reach verification or credit',()=>fixture(async()=>{
 let provider=0;globalThis.fetch=async(url)=>{
  if(url.includes('/lp_monnify_accounts?'))return Response.json([{user_id:'other',mode:'live',status:'ACTIVE',account_reference:'other-account'}]);
  provider++;throw Error('Must not credit');
 };
 const raw=Buffer.from(JSON.stringify({eventType:'SUCCESSFUL_TRANSACTION',eventData:{transactionReference:'MNFY|1',product:{type:'RESERVED_ACCOUNT',reference:'other-account'}}}));
 const req=Readable.from([raw]);req.method='POST';req.headers={'monnify-signature':createHmac('sha512','secret').update(raw).digest('hex')};
 const r=res();await webhook(req,r);assert.equal(r.code,409);assert.equal(provider,0);
}));

test('dashboard scripts parse and the new assets belong to the main document',async()=>{
 const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
 const dom=new JSDOM(html);try{
  for(const script of dom.window.document.scripts){if(!script.src&&(!script.type||script.type==='text/javascript'))new vm.Script(script.textContent);}
  assert.equal(dom.window.document.querySelectorAll('script[src^="monnify-funding.js"]').length,1);
  assert.equal(dom.window.document.querySelectorAll('link[href^="monnify-funding.css"]').length,1);
 }finally{dom.window.close();}
});

test('ordinary customers retain their funding button and see no pilot',async()=>{
 const dom=new JSDOM('<div class="balance"><button id="existing">Fund Wallet</button></div>',{url:'https://lonerpay.com',runScripts:'outside-only'});
 try{
  const w=dom.window;w.localStorage.setItem('lonerpay_access_token','session');w.fetch=async()=>Response.json({available:false,pilot:true});
  w.eval(source);await tick();await tick();assert.equal(w.document.getElementById('lpMonnifyPilot'),null);assert.equal(w.document.getElementById('existing').textContent,'Fund Wallet');
 }finally{dom.window.close();}
});

test('pilot form creates an account without persisting identity and displays verified balance',async()=>{
 const dom=new JSDOM('<div class="balance"><button id="existing">Fund Wallet</button></div>',{url:'https://lonerpay.com',runScripts:'outside-only'});
 try{
  const w=dom.window,calls=[];w.localStorage.setItem('lonerpay_access_token','session');
  w.fetch=async(url,options={})=>{
   calls.push({url,options});
   if(url==='/api/monnify-access')return Response.json({available:true,pilot:true});
   if(url==='/api/wallet')return Response.json({balance:5100});
   if(options.method==='POST')return Response.json({success:true,account:{accounts:[{bank_name:'Test Bank',account_number:'1234567890',account_name:'<img src=x onerror=alert(1)>'}]}});
   return Response.json({success:true,connection_verified:true,account:null});
  };
  w.eval(source);await until(()=>w.document.getElementById('lpMonnifyPilot'));
  w.document.getElementById('lpMonnifyPilot').click();await until(()=>w.document.getElementById('lpMnfForm'));
  const form=w.document.getElementById('lpMnfForm');form.elements.full_name.value='Test User';form.elements.identity_number.value='12345678901';form.elements.consent.checked=true;
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>w.document.getElementById('lpMnfRefresh'));
  const created=calls.find(x=>x.options.method==='POST');assert.equal(JSON.parse(created.options.body).bvn,'12345678901');
  assert.equal(w.localStorage.length,1);assert.equal(w.localStorage.getItem('lonerpay_access_token'),'session');assert.equal(w.document.querySelector('#lpMonnifyOverlay img'),null);
  assert.match(w.document.getElementById('lpMonnifyOverlay').textContent,/<img/);
  w.document.getElementById('lpMnfRefresh').click();await until(()=>w.document.getElementById('lpMnfStatus').textContent.includes('5,100.00'));
  assert.equal(w.document.getElementById('existing').textContent,'Fund Wallet');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(w.document.getElementById('lpMonnifyOverlay'),null);
 }finally{dom.window.close();}
});

test('a closed account request cannot overwrite a newly opened dialog',async()=>{
 const dom=new JSDOM('<div class="balance"></div>',{url:'https://lonerpay.com',runScripts:'outside-only'});
 try{
  const w=dom.window;w.localStorage.setItem('lonerpay_access_token','session');let first,checks=0;
  w.fetch=async(url)=>{
   if(url==='/api/monnify-access')return Response.json({available:true,pilot:true});
   checks++;if(checks===1)return new Promise(resolve=>{first=resolve;});
   return Response.json({success:true,account:null});
  };
  w.eval(source);await until(()=>w.document.getElementById('lpMonnifyPilot'));
  w.document.getElementById('lpMonnifyPilot').click();await until(()=>first);
  w.document.getElementById('lpMnfClose').click();w.document.getElementById('lpMonnifyPilot').click();await until(()=>w.document.getElementById('lpMnfForm'));
  first(Response.json({error:'old failure'},{status:503}));await tick();assert.ok(w.document.getElementById('lpMnfForm'));assert.ok(!w.document.getElementById('lpMonnifyOverlay').textContent.includes('old failure'));
 }finally{dom.window.close();}
});
