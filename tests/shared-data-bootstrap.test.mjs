import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import vm from 'node:vm';
import {savedDataCatalogues} from '../api/_saved-data.js';
import handler from '../api/data-catalogue.js';
const source=await readFile(new URL('../data-client.js',import.meta.url),'utf8');
const networks={MTN:'mtn-data',Airtel:'airtel-data',Glo:'glo-data','9mobile':'etisalat-data'};
const savedAt=Date.now()-90*86400000;
const catalogues=Object.fromEntries(Object.entries(networks).map(([network,id])=>[id,{savedAt,variations:[{code:id+'-real',name:network+' bundle',amount:100,planType:'GIFTING'}]}]));
test('brand-new customer renders every shared network synchronously with no local bundle history or completed API requests',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://lonerpay.com/dashboard.html',runScripts:'dangerously'});const w=dom.window;
 assert.equal(w.localStorage.length,0);w.localStorage.setItem('lonerpay_access_token','brand-new-account');
 w.LonerPaySavedData={catalogues};w.AbortController=AbortController;w.AbortSignal=AbortSignal;
 let calls=0;w.fetch=async()=>{calls++;throw new Error('Provider unavailable');};w.eval(source);w.buyData();
 for(const network of Object.keys(networks)){
  if(network!=='MTN')w.document.querySelector(`[data-network="${network}"]`).click();
  assert.equal(w.document.querySelectorAll('.ld-plan').length,1);
  assert.equal(w.document.querySelector('.ld-skeleton'),null);
  assert.match(w.document.querySelector('.ld-plan').textContent,new RegExp(network));
 }
 assert.equal(calls,0,'display is independent of network responses');
 await new Promise(r=>setTimeout(r,30));assert.equal(w.document.querySelectorAll('.ld-plan').length,1);
 assert.equal(w.document.querySelector('.ld-state'),null);dom.window.close();
});
test('a shared bootstrap never replaces an existing fuller local catalogue',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://lonerpay.com',runScripts:'dangerously'});const w=dom.window;
 w.localStorage.setItem('lonerpay_access_token','session');
 w.localStorage.setItem('lonerpay_data_plans_pairgate_v3_mtn',JSON.stringify({savedAt:Date.now(),partial:false,plans:[1,2].map(i=>({code:String(i),name:'Saved '+i,amount:100,network:'MTN',serviceID:'mtn-data'}))}));
 w.LonerPaySavedData={catalogues};w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.fetch=async()=>{throw Error('offline');};w.eval(source);w.buyData();assert.equal(w.document.querySelectorAll('.ld-plan').length,2);dom.window.close();
});
test('public bootstrap projects only plans, tolerates malformed rows and keeps old shared catalogues',async()=>{
 const rows=[null,{path:'/data-plans?provider_id=mtn&plan_type=GIFTING',saved_at:new Date(savedAt).toISOString(),payload:{status:'success',secret:'never expose',data:[{plan_id:'valid',name:'</script><script>bad()</script>',price:100,duration:30,customer_email:'private'},{id:'bad',price:-1}]}},{path:'/customer',saved_at:new Date().toISOString(),payload:{status:'success',data:[{id:'private',price:100}]}}];
 // Bad row should not prevent the other saved networks from loading.
 const clean=savedDataCatalogues(rows);assert.equal(clean['mtn-data'].variations.length,1);assert.ok(!JSON.stringify(clean).includes('customer_email'));
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://db.example';process.env.SUPABASE_SECRET_KEY='server-only';
 let requests=0;globalThis.fetch=async url=>{requests++;assert.equal(new URL(url).hostname,'db.example');return Response.json(rows);};
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},send(b){this.body=b;return this;},end(){return this;}};
 try{
  await handler({method:'GET',headers:{}},res);assert.equal(res.code,200);assert.equal(requests,1);assert.match(res.headers['Cache-Control'],/public/);assert.ok(!res.body.includes('</script>'));assert.ok(!res.body.includes('server-only'));assert.ok(!res.body.includes('customer_email'));const ctx={window:{}};vm.runInNewContext(res.body,ctx);assert.equal(ctx.window.LonerPaySavedData.catalogues['mtn-data'].variations[0].code,'valid');
  globalThis.fetch=async()=>Response.json([], {status:503});await handler({method:'GET'},res);assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
test('dashboard loads shared catalogue before data UI code',async()=>{const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');assert.ok(html.indexOf('src="/api/data-catalogue"')<html.indexOf('src="data-client.js'));});
