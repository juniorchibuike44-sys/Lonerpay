import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const code=fs.readFileSync(new URL('../giftcards-client.js',import.meta.url),'utf8');
const discovery=fs.readFileSync(new URL('../discovery-client.js',import.meta.url),'utf8');
function setup(reply={mode:'preview',cards:[]}){
 const dom=new JSDOM('<head></head><body><div class="services"></div></body>',{url:'https://lonerpay.com/dashboard.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[];w.AbortSignal=AbortSignal;w.localStorage.setItem('lonerpay_access_token','session');
 w.fetch=async(url,o)=>{calls.push({url,...o});return {ok:true,json:async()=>reply};};w.eval(discovery);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));w.eval(code);
 const click=s=>{const el=w.document.querySelector(s);assert.ok(el,'missing '+s);el.click();};
 return {w,dom,calls,click,open:()=>click('#lpGiftCardsService'),pause:()=>new Promise(r=>setTimeout(r,0))};
}
test('example purchase journey supports searching, values, review, edit, tabs and reopening without payments',async()=>{
 const x=setup();try{x.open();await x.pause();assert.match(x.w.document.querySelector('#lpGiftCards').textContent,/Preview · service not active/);
 const search=x.w.document.querySelector('#gcSearch');search.value='Steam';search.dispatchEvent(new x.w.Event('input'));assert.equal(x.w.document.querySelectorAll('.gc-card').length,1);x.click('.gc-card');assert.equal(x.w.document.querySelector('.gc-review-next').disabled,true);x.click('[data-value="20"]');x.click('.gc-review-next');assert.match(x.w.document.querySelector('.gc-review').textContent,/USD 20/);assert.match(x.w.document.querySelector('.gc-review').textContent,/Quote available after activation/);assert.equal(x.w.document.querySelector('.discovery-primary').disabled,true);x.click('.gc-edit');assert.equal(x.w.document.querySelector('[data-value="20"]').getAttribute('aria-pressed'),'true');
 x.click('[data-tab="sell"]');assert.equal(x.w.document.querySelectorAll('#lpGiftCards input, #lpGiftCards textarea, #lpGiftCards input[type=file]').length,0);x.click('[data-tab="orders"]');assert.match(x.w.document.querySelector('.gc-content').textContent,/No gift-card orders/);
 x.click('.discovery-back');assert.equal(x.w.document.querySelector('#lpGiftCards'),null);x.open();assert.equal(x.w.document.querySelectorAll('#lpGiftCards').length,1);assert.equal(x.w.document.querySelectorAll('.gc-card').length,3);
 assert(x.calls.every(c=>c.url==='/api/giftcards'&&(!c.method||c.method==='GET')));assert.equal(x.w.localStorage.length,1);
 }finally{x.dom.window.close();}
});
test('sandbox provider labels are escaped and test catalogue never enables checkout',async()=>{
 const x=setup({mode:'sandbox',checkoutEnabled:true,cards:[{id:'test',name:'<img src=x onerror=bad()>',region:'US',currency:'USD',value:25}]});
 try{x.open();await x.pause();assert.equal(x.w.document.querySelectorAll('.gc-card').length,1);assert.equal(x.w.document.querySelector('.gc-card img'),null);assert.match(x.w.document.querySelector('.gc-card').textContent,/Test product/);x.click('.gc-card');x.click('[data-value="25"]');x.click('.gc-review-next');assert.equal(x.w.document.querySelector('.discovery-primary').disabled,true);assert.equal(x.w.document.querySelectorAll('img').length,0);}finally{x.dom.window.close();}
});
test('provider failures retain examples and late replies cannot relabel an example selection as real stock',async()=>{
 const x=setup();let finish;try{x.w.fetch=()=>new Promise(r=>finish=r);x.open();x.click('.gc-card');finish({ok:true,json:async()=>({mode:'sandbox',cards:[{id:'other',name:'Other',region:'UK',currency:'GBP',value:10}]})});await x.pause();x.click('[data-value="25"]');x.click('.gc-review-next');assert.match(x.w.document.querySelector('.gc-content').textContent,/EXAMPLE CARD/);
 x.click('.discovery-back');x.w.fetch=async()=>{throw Error('offline');};x.open();await x.pause();assert.equal(x.w.document.querySelectorAll('.gc-card').length,3);assert.match(x.w.document.querySelector('.gc-status').textContent,/Showing examples/);
 }finally{x.dom.window.close();}
});
test('account changes discard late catalogue responses',async()=>{const x=setup();let finish;try{x.w.fetch=()=>new Promise(r=>finish=r);x.open();x.w.localStorage.setItem('lonerpay_access_token','different');finish({ok:true,json:async()=>({mode:'sandbox',cards:[{id:'test',name:'Test',region:'US',currency:'USD',value:25}]})});await x.pause();assert.equal(x.w.document.querySelectorAll('.gc-card').length,3);}finally{x.dom.window.close();}});

test('gift-card interactions remain one dashboard Back step',async()=>{
 const x=setup();try{
  const nav=process.env.GIFTCARD_NAV_TEST?fs.readFileSync(process.env.GIFTCARD_NAV_TEST,'utf8'):fs.readFileSync(new URL('../dashboard.html',import.meta.url),'utf8').match(/<script id="lp-view-navigation">([\s\S]*?)<\/script>/)[1];
  const native=x.w.getComputedStyle.bind(x.w);x.w.getComputedStyle=e=>e.classList?.contains('lp-discovery-overlay')?{position:'fixed',display:'flex',visibility:'visible',top:'0px',bottom:'0px'}:native(e);x.w.scrollTo=()=>{};
  await x.pause();x.w.eval(nav);const flush=()=>new Promise(r=>setTimeout(r,25));x.open();await flush();const entries=x.w.history.length;
  x.click('.gc-card');await flush();x.click('[data-value="25"]');await flush();x.click('.gc-review-next');await flush();x.click('[data-tab="sell"]');await flush();assert.equal(x.w.history.length,entries);
  x.w.history.back();await flush();assert.equal(x.w.document.querySelector('#lpGiftCards'),null);x.open();await flush();assert.equal(x.w.document.querySelectorAll('.gc-card').length,3);
 }finally{x.dom.window.close();}
});
