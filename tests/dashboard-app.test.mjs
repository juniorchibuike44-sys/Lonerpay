import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../dashboard-app.js',import.meta.url),'utf8');
const delay=()=>new Promise(r=>setTimeout(r,45));
async function fixture(fn){
 const dom=new JSDOM(`<body><div class="header"></div><div class="container"><div class="balance"><small>Available Balance</small><h2>₦21.00</h2><div id="lpHomeQuickActions"><button id="fund">Fund Wallet</button><button>Transactions</button><button>Services</button></div></div><div id="lpHomeServicesHead"><h2>Services</h2><button>See all</button></div><div class="services"><div class="service" id="airtime"><div></div><h3>Airtime</h3></div><div class="service" id="data"><div></div><h3>Data</h3></div><div class="service" id="ai"><div></div><h3>AI Tips</h3></div><div class="service lp-primary-restricted"><div></div><h3>Education</h3></div></div><div class="transactions" data-test="history"></div><button id="lpReferralButton">Invite friends</button></div><nav class="lp-bottom-nav"><button class="lp-nav-item">Home</button><button class="lp-nav-item">Transactions</button><button class="lp-nav-item">AI Tips</button><button class="lp-nav-item">Profile</button></nav></body>`,{url:'https://lonerpay.com/dashboard.html',runScripts:'outside-only',pretendToBeVisual:true});
 try{dom.window.eval(source);await delay();await fn(dom.window);}finally{dom.window.close();}
}

test('visual upgrade preserves balance nodes and original funding callbacks',()=>fixture(async w=>{
 const amount=w.document.querySelector('.balance h2');let funded=0;const handler=()=>funded++;w.document.getElementById('fund').onclick=handler;
 w.document.getElementById('fund').click();assert.equal(funded,1);assert.equal(w.document.getElementById('fund').onclick,handler);
 assert.equal(w.document.querySelector('.balance h2'),amount);assert.equal(amount.textContent,'₦21.00');
 assert.ok(w.document.getElementById('ai').classList.contains('lp-home-extra'));assert.ok(!w.document.getElementById('airtime').classList.contains('lp-home-extra'));
}));

test('All Services keeps secondary features, excludes paused payments, and searches without mutating the service nodes',()=>fixture(async w=>{
 w.openLonerPayServices();const field=w.document.querySelector('#lpAppServices input');let labels=[...w.document.querySelectorAll('.lp-app-service strong')].map(n=>n.textContent);
 assert.ok(labels.includes('AI Tips'));assert.ok(labels.includes('Invite friends'));assert.ok(!labels.includes('Education'));
 field.value='data';field.dispatchEvent(new w.Event('input'));labels=[...w.document.querySelectorAll('.lp-app-service strong')].map(n=>n.textContent);assert.deepEqual(labels,['Data']);
 assert.equal(w.document.getElementById('ai').querySelector('h3').textContent,'AI Tips');
}));

test('service selection closes the menu before invoking the original purchase handler',()=>fixture(async w=>{
 let calls=0;w.document.getElementById('data').onclick=()=>{calls++;assert.equal(w.document.getElementById('lpAppServices'),null);};
 w.openLonerPayServices();[...w.document.querySelectorAll('.lp-app-service')].find(b=>b.querySelector('strong')?.textContent==='Data').click();assert.equal(calls,1);
}));

test('background updates keep service buttons stable, while newly added services appear once',()=>fixture(async w=>{
 w.openLonerPayServices();const original=w.document.querySelector('.lp-app-service');const update=w.document.createElement('p');update.textContent='Updated greeting';w.document.querySelector('.container').append(update);await delay();assert.equal(w.document.querySelector('.lp-app-service'),original);
 const extra=w.document.createElement('div');extra.className='service';extra.innerHTML='<div></div><h3>Nearby Places</h3>';w.document.querySelector('.services').append(extra);await delay();assert.equal([...w.document.querySelectorAll('.lp-app-service strong')].filter(b=>b.textContent==='Nearby Places').length,1);
}));

test('home and Services Hub expose clear customer-focused categories',()=>fixture(async w=>{
 const categories=w.document.getElementById('lpDashboardCategories');assert.ok(categories);
 assert.deepEqual([...categories.querySelectorAll('.lp-explore-grid strong')].map(n=>n.textContent),['Money','Pay bills','Business','Discover']);
 categories.querySelector('[data-category="Business"]').click();
 assert.equal(w.document.querySelector('.lp-app-category-chips .active').textContent,'Business');
 assert.deepEqual([...w.document.querySelectorAll('.lp-app-category-head h3')].map(n=>n.textContent),[]);
 w.document.querySelector('.lp-app-category-chips button').click();
 assert.ok([...w.document.querySelectorAll('.lp-app-category-head h3')].map(n=>n.textContent).includes('Everyday'));
 assert.equal(w.document.querySelector('.lp-bottom-nav .lp-nav-item:nth-child(3)').textContent.trim(),'Services');
}));

test('upper dashboard exposes a live balance refresh without changing service actions',()=>fixture(async w=>{
 const live=w.document.getElementById('lpBalanceLive');assert.ok(live);let refreshed=0;w.refreshSecureState=async()=>{refreshed++;};
 live.querySelector('button').click();await delay();assert.equal(refreshed,1);assert.match(live.textContent,/Updated just now/);
 assert.equal(w.document.querySelectorAll('.services .service').length,4);assert.equal(w.document.getElementById('data').querySelector('h3').textContent,'Data');
}));

test('Escape closes Services and restores focus and scroll state',()=>fixture(async w=>{
 const opener=w.document.querySelector('#lpHomeServicesHead button');opener.focus();w.document.body.style.overflow='auto';opener.click();assert.equal(w.document.body.style.overflow,'hidden');
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(w.document.getElementById('lpAppServices'),null);assert.equal(w.document.body.style.overflow,'auto');assert.equal(w.document.activeElement,opener);
}));

test('dashboard inline scripts still parse and presentation assets occur only in the main document',async()=>{
 const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');const dom=new JSDOM(html);
 try{for(const script of dom.window.document.scripts)if(!script.src&&(!script.type||script.type==='text/javascript'))new vm.Script(script.textContent);assert.equal(dom.window.document.querySelectorAll('script[src^="dashboard-app.js"]').length,1);assert.equal(dom.window.document.querySelectorAll('link[href^="dashboard-app.css"]').length,1);}finally{dom.window.close();}
});

test('rebuilt shell controls dispatch once to current funding and history handlers',()=>fixture(async w=>{
 let funded=0,history=0;w.openFundWallet=()=>funded++;w.openTransactionHistory=()=>history++;
 const row=w.document.getElementById('lpHomeQuickActions');row.innerHTML='<button><svg><path/></svg>Fund Wallet</button><button>Transactions</button><button>Services</button>';
 row.firstChild.onclick=()=>{throw Error('stale handler should not run');};
 row.querySelector('path').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(funded,1);
 row.children[1].click();assert.equal(history,1);
 const nav=w.document.querySelector('.lp-bottom-nav');nav.children[1].replaceWith(nav.children[1].cloneNode(true));nav.children[1].click();assert.equal(history,2);
 row.children[2].click();assert.ok(w.document.getElementById('lpAppServices'));
}));

 test('Android Back closes All Services and restores scroll, including after Forward',()=>fixture(async w=>{
 const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
 const doc=new JSDOM(html);const nav=doc.window.document.getElementById('lp-view-navigation').textContent;doc.window.close();
 const original=w.getComputedStyle.bind(w);w.getComputedStyle=e=>e.id==='lpAppServices'?{position:'fixed',display:'block',visibility:'visible',top:'0px',bottom:'0px'}:original(e);
 w.scrollTo=()=>{};w.eval(nav);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await delay();
 const opener=w.document.querySelector('#lpHomeServicesHead button');opener.focus();w.document.body.style.overflow='auto';opener.click();await delay();
 assert.ok(w.history.state.lpViewNavigation>0);assert.ok(w.document.getElementById('lpAppServices'));
 w.history.back();await delay();assert.equal(w.document.getElementById('lpAppServices'),null);assert.equal(w.document.body.style.overflow,'auto');assert.equal(w.document.activeElement,opener);
 w.history.forward();await delay();assert.ok(w.document.getElementById('lpAppServices'));assert.equal(w.document.body.style.overflow,'hidden');
 w.document.querySelector('#lpAppServices header button').click();await delay();assert.equal(w.document.getElementById('lpAppServices'),null);assert.equal(w.document.body.style.overflow,'auto');
 }));
