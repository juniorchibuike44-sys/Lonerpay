const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../voice-control.js'),'utf8');
function setup(speech=true){
 const dom=new JSDOM('<head></head><body><div class="balance"><h2>₦1,200.00</h2><button id="fund">Fund Wallet</button></div></body>',{url:'https://lonerpay.com/dashboard.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,calls=[],sessions=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const fn of ['buyData','buyAirtime','openFundWallet','openTransactionHistory','openProfile','buyElectricity','buyTV','openLonerPayBusinessTools'])w[fn]=()=>calls.push(fn);
 w.fetch=()=>{throw Error('Voice must not make API requests');};
 if(speech)w.webkitSpeechRecognition=class{constructor(){sessions.push(this);}start(){this.started=true;this.onstart?.();}abort(){this.aborted=true;}result(text){this.onresult?.({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:true})]});}};
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const click=s=>w.document.querySelector(s).click();
 const open=()=>click('#lpVoiceLauncher');
 const submit=text=>{w.document.querySelector('#lpVoiceCommand').value=text;w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));};
 return {dom,w,calls,sessions,click,open,submit,status:()=>w.document.querySelector('[data-status]').textContent};
}
test('launcher is in dashboard flow, never starts microphone on open; typed routes use existing screens',()=>{
 const x=setup();try{
 assert.equal(x.w.document.querySelector('.balance').nextElementSibling.id,'lpVoiceLauncher');
 x.open();assert.equal(x.sessions.length,0);
 for(const [command,fn] of [['Open data','buyData'],['Open airtime','buyAirtime'],['Fund my wallet','openFundWallet'],['Show transactions','openTransactionHistory'],['Open profile','openProfile'],['Open electricity','buyElectricity'],['Open TV','buyTV'],['Open Business Tools','openLonerPayBusinessTools']]){if(!x.w.document.querySelector('dialog'))x.open();x.submit(command);assert.equal(x.calls.at(-1),fn);assert.equal(x.w.document.querySelector('dialog'),null);}
 assert.equal(x.w.localStorage.length,0);
 }finally{x.dom.window.close();}
});
test('voice commands route only once; late results after closing cannot run',()=>{
 const x=setup();try{x.open();x.click('[data-listen]');const r=x.sessions[0];assert.equal(r.lang,'en-NG');assert.equal(r.continuous,false);r.result('Open data');r.result('Open airtime');assert.deepEqual(x.calls,['buyData']);assert.equal(r.aborted,true);
 x.open();x.click('[data-listen]');const next=x.sessions[1],late=next.onresult;x.click('.lv-close');late({resultIndex:0,results:[Object.assign([{transcript:'Open airtime'}],{isFinal:true})]});assert.deepEqual(x.calls,['buyData']);
 }finally{x.dom.window.close();}
});
test('purchase, credentials, transfer and ambiguous commands never execute an action',()=>{
 const x=setup();try{x.open();for(const text of ['Buy 200 naira airtime','Transfer money','Confirm payment','My PIN is 1234','Open data and airtime',"Don’t open data",'Something unknown']){x.submit(text);assert.equal(x.calls.length,0);assert.ok(x.w.document.querySelector('dialog').open);}assert.equal(x.w.localStorage.length,0);x.submit('Lona Pay open data');assert.deepEqual(x.calls,['buyData']);}finally{x.dom.window.close();}
});
test('balance honours hidden balance; unsupported browser retains typing and examples',()=>{
 const x=setup(false);try{x.open();x.click('[data-listen]');assert.match(x.status(),/unavailable/);x.submit('Check balance');assert.match(x.status(),/₦1,200.00/);x.w.document.querySelector('.balance h2').textContent='₦••••••';x.submit('Check balance');assert.match(x.status(),/hidden/);assert.doesNotMatch(x.status(),/1,200/);x.click('[data-command="Open data"]');assert.deepEqual(x.calls,['buyData']);}finally{x.dom.window.close();}
});
test('permission error, Stop and browser Back abort listening without restarting',()=>{
 const x=setup();try{x.open();x.click('[data-listen]');x.sessions[0].onerror({error:'not-allowed'});assert.match(x.status(),/blocked/);assert.equal(x.sessions[0].aborted,true);x.click('[data-listen]');x.click('[data-stop]');assert.equal(x.sessions[1].aborted,true);x.click('[data-listen]');x.w.dispatchEvent(new x.w.PopStateEvent('popstate'));assert.equal(x.sessions[2].aborted,true);assert.equal(x.w.document.querySelector('dialog'),null);assert.equal(x.calls.length,0);}finally{x.dom.window.close();}
});
