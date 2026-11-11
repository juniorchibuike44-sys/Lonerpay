import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import handler from '../api/business-subscription.js';
const reference='LPBIZ-11111111-1111-1111-1111-111111111111';
for(const stringBody of [false,true])test('new and resumed checkout requests cannot create or resume a payment '+stringBody,async()=>{
 const old=fetch;global.fetch=async()=>{throw Error('Checkout must not contact any service');};const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.body=d;return this;}};
 try{const body={action:'initialize',id:reference.slice(6)};await handler({method:'POST',headers:{},body:stringBody?JSON.stringify(body):body},res);assert.equal(res.code,503);assert.equal(res.body.code,'subscriptions_paused');}finally{global.fetch=old;}
});
test('existing pending payments can be checked without showing a saved checkout link',async()=>{
 const dom=new JSDOM(await readFile(new URL('../business-subscribe.html',import.meta.url),'utf8'),{url:'https://lonerpay.com/business-subscribe.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.lpBusinessSession={request:async(u,o={})=>{if(o.body){calls.push(JSON.parse(o.body));return {ok:true,json:async()=>({pending:true,message:'Still checking; do not pay again.'})};}return {ok:true,json:async()=>({active:false,payments:[{reference,status:'pending',checkout_url:'https://checkout.paystack.com/old'}]})};}};
 try{w.eval(await readFile(new URL('../business-subscribe.js',import.meta.url),'utf8'));await new Promise(r=>setTimeout(r,20));assert.equal(w.document.querySelector('a[href*="checkout.paystack.com"]'),null);assert.equal(w.document.querySelector('#payButton'),null);w.document.querySelector('[data-verify]').click();await new Promise(r=>setTimeout(r,20));assert.deepEqual(calls,[{action:'verify',reference}]);}finally{w.close();}
});
