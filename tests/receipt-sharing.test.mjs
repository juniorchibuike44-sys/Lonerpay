import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../dashboard.html',import.meta.url),'utf8');
async function fixture(fn){
 const source=new JSDOM(html).window.document.getElementById('lonerpay-fintech-history-refund-bet-upgrade').textContent;
 const dom=new JSDOM('<body></body>',{url:'https://lonerpay.com/dashboard.html',runScripts:'outside-only'}),w=dom.window;
 const ctx=new Proxy({measureText:t=>({width:String(t).length*10}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob(['receipt'],{type:'image/png'}));};
 w.alert=()=>{};w.URL.createObjectURL=()=> 'blob:receipt';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
 w.eval(source);
 try{await fn(w);}finally{w.close();}
}
const tx={request_id:'TEST-RECEIPT',service:'MTN Airtime',amount:100,status:'successful',created_at:'2026-11-15T06:00:00Z',details:{phone:'08012345678',Phone:'08012345678',billersCode:'08012345678',plan_name:'Airtime',Reference:'TEST-RECEIPT',provider:'pairgate',provider_cost:97,cost_source:'private-source',wallet_debited:true,reconciliation_state:'resolved',last_checked_at:'internal-time'}};
test('receipt shares only the image and omits internal and duplicate fields',()=>fixture(async w=>{
 let payload;w.navigator.canShare=()=>true;w.navigator.share=async p=>{payload=p;};w.showDigitalReceipt(tx);
 const labels=[...w.document.querySelectorAll('#lpProReceipt .line span')].map(n=>n.textContent);
 assert.deepEqual(labels,['Receipt ID','Phone','Plan','Date & time']);assert.equal(w.document.querySelector('#lpProReceipt').textContent.includes('private-source'),false);
 await w.document.querySelector('#lpRcShare').onclick({currentTarget:w.document.querySelector('#lpRcShare')});assert.deepEqual(Object.keys(payload),['files']);assert.equal(payload.files[0].type,'image/png');
}));
test('unsupported file sharing downloads image instead of sending a long text',()=>fixture(async w=>{
 let calls=0,downloads=0;w.navigator.share=async()=>calls++;w.navigator.canShare=()=>false;w.HTMLAnchorElement.prototype.click=()=>downloads++;w.showDigitalReceipt(tx);await w.document.querySelector('#lpRcShare').onclick({currentTarget:w.document.querySelector('#lpRcShare')});assert.equal(calls,0);assert.equal(downloads,1);
}));
