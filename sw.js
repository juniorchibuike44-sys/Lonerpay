/* Cache only a generic offline page. Never cache sessions, APIs, receipts or balances. */
const OFFLINE_CACHE='lonerpay-offline-v1';
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
