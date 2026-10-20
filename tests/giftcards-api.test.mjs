import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import handler,{normalizeCards} from '../api/giftcards.js';
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(d){this.data=d;return this;}});
let id=0;
const req=(method='GET',token='session')=>({method,headers:{authorization:'Bearer '+token,'x-forwarded-for':'gc-'+ ++id}});
test('disabled service authenticates without calling Prestmit and cannot accept payments',async()=>{
 process.env.SUPABASE_URL='https://db.test';process.env.SUPABASE_SECRET_KEY='db-key';delete process.env.PRESTMIT_SANDBOX_CATALOGUE;
 const original=global.fetch;let calls=0;
 global.fetch=async url=>{calls++;assert.equal(String(url),'https://db.test/auth/v1/user');return {ok:true,json:async()=>({id:'user'})};};
 try{const r=res();await handler(req(),r);assert.equal(r.data.mode,'preview');assert.equal(r.data.checkoutEnabled,false);assert.deepEqual(r.data.cards,[]);assert.equal(calls,1);assert.equal(r.headers['Cache-Control'],'no-store');for(const method of ['POST','PUT','DELETE']){const r=res();await handler(req(method),r);assert.equal(r.code,405);}assert.equal(calls,1);
 const r2=res();await handler({method:'GET',headers:{}},r2);assert.equal(r2.code,401);}finally{global.fetch=original;}
});
test('sandbox catalogue uses signed fixed-host read-only request and returns no credentials or card codes',async()=>{
 process.env.PRESTMIT_SANDBOX_CATALOGUE='true';process.env.PRESTMIT_SANDBOX_API_KEY='test-key';process.env.PRESTMIT_SANDBOX_API_SECRET='test-secret';
 const original=global.fetch;
 global.fetch=async(url,o)=>{if(String(url).endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};assert.equal(url,'https://dev-api.prestmit.io/partners/v1/giftcard-trade/buy/config');assert.equal(o.headers['API-Hash'],createHmac('sha256','test-secret').update('test-key:{}').digest('hex'));assert.equal(o.redirect,'error');return {ok:true,json:async()=>({status:'success',data:{cards:[{sku:'abc',name:'Brand',currency:'USD',denomination:25,stock_available:true,pin:'private-pin',price_ngn:12345},{sku:'sold',name:'Sold out',currency:'USD',denomination:50,stock_available:false}]}})};};
 try{const r=res();await handler(req(),r);assert.equal(r.data.mode,'sandbox');assert.equal(r.data.cards.length,1);assert.equal(r.data.checkoutEnabled,false);assert.doesNotMatch(JSON.stringify(r.data),/test-key|test-secret|private-pin|price_ngn/);
 global.fetch=async()=>{throw Error('provider leaked test-secret');};const bad=res();await handler(req(),bad);assert.equal(bad.code,503);assert.doesNotMatch(JSON.stringify(bad.data),/test-secret/);
 }finally{global.fetch=original;}
});
test('unknown provider schema fails closed rather than fabricating a catalogue',()=>{assert.throws(()=>normalizeCards({data:{unknown:[]}}));});
