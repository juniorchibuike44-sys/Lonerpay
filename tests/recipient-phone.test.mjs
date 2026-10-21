import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const helper=await readFile(new URL('../recipient-phone.js',import.meta.url),'utf8'),data=await readFile(new URL('../data-client.js',import.meta.url),'utf8'),html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
const idx=html.indexOf('  window.buyAirtime = function ()'),start=html.indexOf('>',html.lastIndexOf('<script',idx))+1,airtime=html.slice(start,html.indexOf('</script>',idx));
const jwt=phone=>'header.'+Buffer.from(JSON.stringify({user_metadata:{phone}})).toString('base64url')+'.signature';
const tick=()=>new Promise(r=>setTimeout(r,25));
function setup(profile,registered='+234 803 123 4567'){
 const dom=new JSDOM('<head></head><body></body>',{url:'https://lonerpay.com/dashboard.html',runScripts:'dangerously'}),w=dom.window;w.localStorage.setItem('lonerpay_access_token',jwt(registered));w.AbortController=AbortController;w.AbortSignal=AbortSignal;
 w.fetch=async url=>url==='/api/profile'?profile():Response.json(url.includes('snapshot')?{catalogues:{}}:{variations:[{code:'real',name:'Data 30 days',amount:100}]});w.eval(helper);w.eval(airtime);w.eval(data);return {dom,w};
}
test('Airtime and Data synchronously use registered phone, allow edits and reset to own phone on reopening',async()=>{
 const {dom,w}=setup(async()=>Response.json({phone:'+2348031234567'}));
 for(const [open,selector] of [['buyAirtime','.lp-air-phone'],['buyData','.ld-phone']]){
  w[open]();let input=w.document.querySelector(selector);assert.equal(input.value,'08031234567');assert.equal(input.readOnly,false);input.value='09021234567';input.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();assert.equal(input.value,'09021234567');w[open]();assert.equal(w.document.querySelector(selector).value,'08031234567');
 }
 dom.window.close();
});
test('late profile response never overwrites typing or a deliberately cleared recipient',async()=>{
 let resolve;const {dom,w}=setup(()=>new Promise(r=>resolve=r));w.buyAirtime();w.buyData();const a=w.document.querySelector('.lp-air-phone'),d=w.document.querySelector('.ld-phone');a.value='09021234567';a.dispatchEvent(new w.Event('input'));d.value='';d.dispatchEvent(new w.Event('input'));resolve(Response.json({phone:'08099999999'}));await tick();assert.equal(a.value,'09021234567');assert.equal(d.value,'');w.buyData();assert.equal(w.document.querySelector('.ld-phone').value,'08099999999');dom.window.close();
});
test('cold account without JWT metadata uses authenticated profile; absent phone stays blank and editable',async()=>{
 const {dom,w}=setup(async()=>Response.json({phone:'07031234567'}),'');w.buyAirtime();assert.equal(w.document.querySelector('.lp-air-phone').value,'');await tick();assert.equal(w.document.querySelector('.lp-air-phone').value,'07031234567');dom.window.close();
 const other=setup(async()=>Response.json({phone:''}),'');other.w.buyData();await tick();assert.equal(other.w.document.querySelector('.ld-phone').value,'');other.dom.window.close();
});
test('old account response and cached phone cannot populate a different customer',async()=>{
 let resolveOld;const {dom,w}=setup(()=>new Promise(r=>resolveOld=r));w.buyAirtime();w.localStorage.setItem('lonerpay_access_token',jwt('09021234567'));w.fetch=async url=>Response.json(url==='/api/profile'?{phone:'09021234567'}:{catalogues:{}});w.buyData();assert.equal(w.document.querySelector('.lp-air-phone').value,'');assert.equal(w.document.querySelector('.ld-phone').value,'09021234567');resolveOld(Response.json({phone:'08031234567'}));await tick();assert.equal(w.document.querySelector('.ld-phone').value,'09021234567');dom.window.close();
});
test('review and Back preserve another recipient, selected network and amount without charging',async()=>{
 const {dom,w}=setup(async()=>Response.json({phone:'08031234567'}));w.buyAirtime();await tick();const input=w.document.querySelector('.lp-air-phone');input.value='09021234567';input.dispatchEvent(new w.Event('input'));w.document.querySelector('#lpAirtimeOverlay [data-network="Airtel"]').click();w.document.querySelector('[data-amount="500"]').click();w.document.querySelector('.lp-air-continue').click();assert.match(w.document.querySelector('#lpAirtimeOverlay').textContent,/09021234567/);w.document.querySelector('.lp-air-back').click();assert.equal(w.document.querySelector('.lp-air-phone').value,'09021234567');assert.equal(w.document.querySelector('.lp-air-amount').value,'500');assert.equal(w.document.querySelector('[data-network].active').dataset.network,'Airtel');
 w.buyData();await tick();w.document.querySelector('.ld-phone').value='09021234567';w.document.querySelector('.ld-phone').dispatchEvent(new w.Event('input'));w.document.querySelector('.ld-plan').click();w.document.querySelector('.ld-continue').click();assert.match(w.document.querySelector('#lpLiveData').textContent,/09021234567/);w.document.querySelector('.ld-back').click();assert.equal(w.document.querySelector('.ld-phone').value,'09021234567');dom.window.close();
});
test('normalisation supports Nigerian local and international formats without guessing invalid numbers',()=>{
 const {dom,w}=setup(async()=>Response.json({phone:''}));for(const number of ['08031234567','+2348031234567','002348031234567','8031234567'])assert.equal(w.LonerPayRecipientPhone.normalise(number),'08031234567');for(const number of ['123','+15551234567','not-a-phone'])assert.equal(w.LonerPayRecipientPhone.normalise(number),'');dom.window.close();
});
