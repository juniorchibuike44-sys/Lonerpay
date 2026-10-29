/* Cache only a generic offline page. Never cache sessions, APIs, receipts or balances. */
const OFFLINE_CACHE='lonerpay-offline-v1';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// Only an account identifier is persisted; never store a token or balance here.
function binding(value,write=false){
 return new Promise((resolve,reject)=>{
  const open=indexedDB.open('lonerpay-push-binding',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('settings');
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const database=open.result,tx=database.transaction('settings',write?'readwrite':'readonly'),store=tx.objectStore('settings');
   const request=write?store.put(value,'owner'):store.get('owner');
   tx.oncomplete=()=>{database.close();resolve(write?value:request.result);};
   tx.onerror=()=>{database.close();reject(tx.error);};
  };
 });
}
self.addEventListener('message',event=>{
 if(event.data?.type==='LP_PUSH_OWNER'&&event.source?.url&&new URL(event.source.url).origin===self.location.origin){
  const owner=/^[0-9a-f-]{36}$/i.test(event.data.owner||'')?event.data.owner:null;
  event.waitUntil(binding(owner,true));
 }
});
self.addEventListener('push',event=>{
 event.waitUntil((async()=>{
  let data;try{data=event.data.json();}catch{return;}
  if(!data||data.owner!==await binding()||!data.owner)return;
  const transaction=/^[0-9a-f-]{36}$/i.test(data.transaction||'')?data.transaction:null;
  const title=data.title==='Bill reminder'?'Bill reminder':'Wallet funded';
  await self.registration.showNotification(title,{
   body:String(data.body||'Your LonerPay wallet has been funded.').slice(0,240),
   tag:'notice-'+String(data.id),renotify:false,
   data:{url:'/dashboard.html'+(transaction?'?funding='+encodeURIComponent(transaction):'')}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL(event.notification.data?.url||'/dashboard.html',self.location.origin);
  if(target.origin!==self.location.origin||target.pathname!=='/dashboard.html')return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);
  if(existing){await existing.navigate(target.href);await existing.focus();}
  else await self.clients.openWindow(target.href);
 })());
});
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(OFFLINE_CACHE).then(cache=>cache.add(new Request('/offline.html',{cache:'reload'}))));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lonerpay-offline-')&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||req.mode!=='navigate'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 event.respondWith(fetch(req).catch(async()=>{
  const saved=await caches.match('/offline.html',{cacheName:OFFLINE_CACHE});
  return saved||new Response('LonerPay is offline. Reconnect before retrying payments.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }));
});


