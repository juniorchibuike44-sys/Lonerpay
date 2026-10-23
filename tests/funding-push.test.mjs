import test from 'node:test';
import assert from 'node:assert/strict';
import {validEndpoint,validSubscription,cronAuthorized,deliverPush} from '../api/_push.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:Buffer.alloc(65).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};
test('only real public push service hosts and well-formed encryption keys are accepted',()=>{
 assert.equal(validSubscription(sub),true);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.com/a','https://user:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:8080/a','https://evilnotify.windows.com/a'])assert.equal(validEndpoint(endpoint),false,endpoint);
 assert.equal(validSubscription({...sub,keys:{auth:'short',p256dh:'short'}}),false);
});
test('delivery endpoint refuses missing and incorrect cron credentials',()=>{
 process.env.CRON_SECRET='test-only';
 assert.equal(cronAuthorized(undefined),false);assert.equal(cronAuthorized('Bearer wrong'),false);assert.equal(cronAuthorized('Bearer test-only'),true);
 delete process.env.CRON_SECRET;
});
const job={id:'job',notification_id:'notice',subscription_id:'sub',user_id:'owner',attempts:1};
async function fixture(send,subscription=true){
 const old=globalThis.fetch,calls=[];
 process.env.PUSH_VAPID_PUBLIC_KEY='test';process.env.PUSH_VAPID_PRIVATE_KEY='test';
 globalThis.fetch=async(url,o={})=>{
  calls.push({url,o});
  let data=null;
  if(url.includes('rpc/lp_push_claim'))data=[job];
  else if(url.includes('lp_push_subscriptions?')&&o.method!=='DELETE')data=subscription?[{endpoint:sub.endpoint,...sub.keys}]:[];
  else if(url.includes('lp_notifications?'))data=[{id:'notice',title:'Wallet funded',body:'₦12.34 has been added to your LonerPay wallet.',funding_transaction_id:'transaction'}];
  return new Response(JSON.stringify(data),{status:200});
 };
 try{const result=await deliverPush({supabaseUrl:'https://test.supabase.co',secretKey:'test'},{send});return {calls,result};}
 finally{globalThis.fetch=old;delete process.env.PUSH_VAPID_PUBLIC_KEY;delete process.env.PUSH_VAPID_PRIVATE_KEY;}
}
test('successful push contains credited amount, owner and a stable deduplication topic',async()=>{
 let sent;const {calls,result}=await fixture(async(s,p,o)=>{sent={s,p:JSON.parse(p),o};});
 assert.equal(result.accepted,1);assert.equal(sent.p.owner,'owner');assert.match(sent.p.body,/12.34/);assert.equal(sent.o.topic,'notice');
 assert(calls.some(c=>c.url.includes('user_id=eq.owner')));
 const patch=calls.find(c=>c.o.method==='PATCH');assert.match(patch.url,/claim_token=eq./);assert.equal(JSON.parse(patch.o.body).state,'accepted');
});
test('transient push failure stays queued for retry',async()=>{
 const {calls}=await fixture(async()=>{throw Error('network');});
 assert.equal(JSON.parse(calls.find(c=>c.o.method==='PATCH').o.body).state,'queued');
});
test('expired device is removed without retrying it',async()=>{
 const {calls}=await fixture(async()=>{throw Object.assign(Error('gone'),{statusCode:410});});
 assert(calls.some(c=>c.o.method==='DELETE'));assert(!calls.some(c=>c.o.method==='PATCH'));
});
test('a subscription reassigned to another owner receives no old-account alert',async()=>{
 let sent=false;const {calls}=await fixture(async()=>{sent=true;},false);
 assert.equal(sent,false);assert.equal(JSON.parse(calls.find(c=>c.o.method==='PATCH').o.body).state,'expired');
});
function worker(){
 const handlers={},shown=[],opened=[];
 const self={location:{origin:'https://lonerpay.com'},addEventListener:(n,f)=>handlers[n]=f,
  registration:{showNotification:async(...a)=>shown.push(a)},clients:{matchAll:async()=>[],openWindow:async u=>opened.push(u)}};
 const context=vm.createContext({self,URL,Request,Response,console});
 vm.runInContext(readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
 vm.runInContext("binding=async()=> 'owner'",context);
 return {handlers,shown,opened};
}
test('worker shows correct-account funding alert and suppresses a previous account',async()=>{
 const w=worker();let done;
 w.handlers.push({data:{json:()=>({owner:'other',id:'notice',body:'wrong'})},waitUntil:p=>done=p});await done;assert.equal(w.shown.length,0);
 w.handlers.push({data:{json:()=>({owner:'owner',id:'notice',body:'₦20.00 received',transaction:'11111111-1111-4111-8111-111111111111'})},waitUntil:p=>done=p});await done;
 assert.equal(w.shown[0][0],'Wallet funded');assert.equal(w.shown[0][1].tag,'funding-notice');assert.match(w.shown[0][1].data.url,/funding=/);
});
test('worker refuses an external notification navigation',async()=>{
 const w=worker();let done;
 w.handlers.notificationclick({notification:{close(){},data:{url:'https://evil.example'}},waitUntil:p=>done=p});await done;assert.equal(w.opened.length,0);
});
