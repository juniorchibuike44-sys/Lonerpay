import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('lonerpay_access_token','x.'+btoa(JSON.stringify({sub:'u'}))+'.x'));
 let batch=false,started=false,purchases=0;
 const items=()=>[{id:'a',recipient:'08011111111',price:275,network:'mtn',plan_code:'p',state:started?'started':'queued',status:started?'pending':'queued'},{id:'b',recipient:'08022222222',price:275,network:'mtn',plan_code:'p',state:'queued',status:'queued'}];
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),b=route.request().postDataJSON();let d;
  if(u.pathname==='/api/resellers')d={owner:false,account:{status:'approved'},accounts:[{user_id:'u',status:'approved'}],offers:[{id:'offer',network:'mtn',plan_name:'Example bundle',price:275}]};
  else if(u.pathname==='/api/bulk-orders') {if(b){batch=true;d={batch_id:'batch'};}else d={batches:batch?[{id:'batch',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString(),items:items()}]:[]};}
  else if(u.pathname==='/api/secure-pay'){purchases++;started=true;d={pending:true,message:'Awaiting confirmation'};assert.equal(b.pin,'1234');}
  else throw Error('Unexpected '+u.pathname);
  await route.fulfill({json:d});
 });
 await page.goto('http://127.0.0.1:8766/resellers.html');
 await page.locator('#ordering').waitFor({state:'visible'});
 await page.locator('[name=recipients]').fill('08011111111\n08022222222');await page.getByRole('button',{name:'Create batch preview'}).click();
 await page.getByRole('button',{name:'Review 2 unsent purchases'}).click();
 assert.match(await page.locator('#confirmTotal').textContent(),/550/);
 await page.locator('[name=pin]').fill('1234');await page.getByRole('button',{name:'Confirm purchases'}).click();
 await page.getByRole('button',{name:'Review 1 unsent purchases'}).waitFor();
 assert.equal(purchases,1);assert.equal(await page.locator('[name=pin]').inputValue(),'');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/lonerpay-resellers-mobile.png',fullPage:true});
 await page.goto('http://127.0.0.1:8766/bulk-pricing.html');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 console.log('Mobile reseller preview, confirmation total, pause-on-pending, PIN clearing and overflow checks passed.');
} finally {await browser.close();}
