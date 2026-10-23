import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../push-client.js',import.meta.url),'utf8');
const wait=()=>new Promise(r=>setTimeout(r,35));
function setup(permission='default'){
 const dom=new JSDOM('<body><div class="lpInboxHead"></div></body>',{url:'https://lonerpay.com/dashboard.html',runScripts:'dangerously'}),w=dom.window;
 const calls=[],messages=[];let requests=0,unsubscribed=0,sub=null;
 w.localStorage.setItem('lonerpay_access_token','token');
 w.PushManager=function(){};
 w.Notification={permission,requestPermission:async()=>{requests++;w.Notification.permission='granted';return 'granted';}};
 const device={endpoint:'https://fcm.googleapis.com/fcm/send/test',toJSON:()=>({endpoint:device.endpoint,keys:{p256dh:'test',auth:'test'}}),unsubscribe:async()=>{unsubscribed++;sub=null;}};
 const reg={active:{postMessage:d=>messages.push(d)},pushManager:{getSubscription:async()=>sub,subscribe:async()=>sub=device}};
 Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>reg,ready:Promise.resolve(reg)}});
 w.AbortSignal=AbortSignal;
 w.fetch=async(url,o={})=>{calls.push({url,o});return Response.json({enabled:true,user_id:'11111111-1111-4111-8111-111111111111',public_key:Buffer.alloc(65).toString('base64url'),ok:true});};
 w.eval(source);
 return {w,dom,calls,messages,get requests(){return requests;},get unsubscribed(){return unsubscribed;}};
}
test('phone alerts do not prompt for permission until the customer taps Enable',async()=>{
 const a=setup();await wait();assert.equal(a.requests,0);
 a.w.document.getElementById('lpPhoneAlerts').click();await wait();
 assert.equal(a.requests,1);assert(a.calls.some(c=>c.o.method==='POST'));
 assert.equal(a.messages.at(-1).owner,'11111111-1111-4111-8111-111111111111');
 assert.match(a.w.document.getElementById('lpPhoneAlerts').textContent,/Turn off/);a.dom.window.close();
});
test('turning off alerts unsubscribes the device and clears its account binding',async()=>{
 const a=setup();await wait();a.w.document.getElementById('lpPhoneAlerts').click();await wait();
 a.w.document.getElementById('lpPhoneAlerts').click();await wait();
 assert.equal(a.unsubscribed,1);assert(a.calls.some(c=>c.o.method==='DELETE'));assert.equal(a.messages.at(-1).owner,null);
 assert.match(a.w.document.getElementById('lpPhoneAlerts').textContent,/Enable/);a.dom.window.close();
});
test('logout clears the worker account binding before the next session',async()=>{
 const a=setup();await wait();a.w.document.getElementById('lpPhoneAlerts').click();await wait();
 a.w.localStorage.clear();await wait();assert.equal(a.messages.at(-1).owner,null);a.dom.window.close();
});
