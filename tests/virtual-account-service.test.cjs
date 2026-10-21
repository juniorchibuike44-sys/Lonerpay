const {JSDOM}=require('jsdom');const fs=require('fs');const assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../dashboard.html','utf8');const script=html.match(/<script id="lonerpay-virtual-account-restore-2026">([\s\S]*?)\(function installVirtualAccountCard/)[1];
async function run(data,ok=true){const dom=new JSDOM('<body></body>',{url:'https://lonerpay.com',runScripts:'outside-only'});const w=dom.window;w.localStorage.setItem('lonerpay_access_token','test');let calls=[];w.fetch=async(u,o)=>{calls.push(o);return {ok,json:async()=>data}};w.eval(script);await w.openVirtualAccount();return {w,calls};}
(async()=>{
 let r=await run({success:true,virtual_account:{account_number:'1234567890',bank_name:'Test Bank',account_name:'Test Customer',assignment_status:'assigned'}});assert.match(r.w.document.body.textContent,/Your Virtual Account/);assert.equal(r.w.document.querySelector('#vaCreate'),null);assert.equal(r.calls.length,1);
 r=await run({success:true,virtual_account:null,assignment_status:'not_requested'});assert.ok(r.w.document.querySelector('#vaCreate'));
 r=await run({success:true,virtual_account:{assignment_status:'pending'}});assert.equal(r.w.document.querySelector('#vaCreate'),null);assert.match(r.w.document.body.textContent,/in progress/);
 r=await run({success:false},false);assert.equal(r.w.document.querySelector('#vaCreate'),null);assert.ok(r.w.document.querySelector('#vaRetry'));
 r=await run({success:true,virtual_account:{assignment_status:'identification_failed'}});assert.ok(r.w.document.querySelector('#vaCreate'));
 const dom=new JSDOM('<body></body>',{url:'https://lonerpay.com',runScripts:'outside-only'}),w=dom.window;w.localStorage.setItem('lonerpay_access_token','a');let resolve;w.fetch=()=>new Promise(r=>resolve=r);w.eval(script);const pending=w.openVirtualAccount();w.localStorage.setItem('lonerpay_access_token','b');resolve({ok:true,json:async()=>({success:true,virtual_account:{account_number:'1234567890'}})});await pending;assert.equal(w.document.querySelector('#virtualAccountOverlay'),null);
 console.log('6 virtual account UI scenarios passed');
})();
