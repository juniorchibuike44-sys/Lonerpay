/* Phone funding alerts: permission is requested only after an explicit tap. */
(() => {
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return;
 const token=()=>localStorage.getItem('lonerpay_access_token')||'';
 let busy=false,enabled=false,lastToken=null,registration=null;
 async function api(method='GET',body,current=token()){
  const r=await fetch('/api/push-subscriptions',{method,headers:{Authorization:'Bearer '+current,'Content-Type':'application/json'},
   body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(10000)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save phone alerts.');return d;
 }
 async function worker(){registration=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;return registration;}
 async function bind(owner){
  const reg=registration||await worker();
  (reg.active||navigator.serviceWorker.controller)?.postMessage({type:'LP_PUSH_OWNER',owner:owner||null});
 }
 function controls(){
  const header=document.querySelector('.lpInboxHead');
  if(!header||header.querySelector('#lpPhoneAlerts'))return;
  const row=document.createElement('div');row.style.cssText='margin-top:14px;font-size:12px;line-height:1.5';
  const button=document.createElement('button');button.id='lpPhoneAlerts';button.type='button';
  button.style.cssText='border:1px solid #c7a568;border-radius:10px;background:#fff9ec;color:#77500e;padding:10px 14px';
  const status=document.createElement('span');status.id='lpPhoneStatus';status.setAttribute('role','status');status.style.cssText='display:block;margin-top:6px';
  row.append(button,status);header.append(row);paint();
  button.onclick=()=>enabled?disable():enable();
 }
 function paint(message=''){
  const button=document.getElementById('lpPhoneAlerts'),status=document.getElementById('lpPhoneStatus');
  if(button){button.disabled=busy;button.textContent=busy?'Saving…':enabled?'Turn off phone alerts':'Enable phone alerts';}
  if(status)status.textContent=message|| (enabled?'Funding alerts are enabled on this device.':'Receive an alert when your wallet is funded.');
 }
 async function enable(){
  if(busy||!token())return;
  // Keep the browser permission call directly in the user's click.
  const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
  busy=true;paint();
  try{
   if(await permission!=='granted')throw Error('Allow notifications in your browser settings to receive funding alerts.');
   const current=token(),config=await api();if(token()!==current)return;
   if(!config.enabled)throw Error('Phone alerts are not available yet. Please try again shortly.');
   const reg=await worker();
   let sub=await reg.pushManager.getSubscription();
   if(!sub){
    const key=Uint8Array.from(atob(config.public_key.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
   }
   if(token()!==current){await sub.unsubscribe();return;}
   await api('POST',sub.toJSON(),current);
   if(token()!==current){await sub.unsubscribe();return;}
   await bind(config.user_id);enabled=true;paint();
  }catch(e){paint(e.message);}
  finally{busy=false;const b=document.getElementById('lpPhoneAlerts');if(b){b.disabled=false;b.textContent=enabled?'Turn off phone alerts':'Enable phone alerts';}}
 }
 async function disable(){
  if(busy)return;busy=true;paint();
  try{
   const reg=await worker(),sub=await reg.pushManager.getSubscription();
   await bind(null);
   if(sub){await api('DELETE',{endpoint:sub.endpoint});await sub.unsubscribe();}
   enabled=false;paint('Phone alerts are off on this device.');
  }catch(e){paint(e.message);}
  finally{busy=false;const b=document.getElementById('lpPhoneAlerts');if(b){b.disabled=false;b.textContent=enabled?'Turn off phone alerts':'Enable phone alerts';}}
 }
 async function sync(){
  const current=token();if(current===lastToken)return;lastToken=current;
  enabled=false;await bind(null);
  if(!current||Notification.permission!=='granted')return;
  try{
   const config=await api('GET',undefined,current),reg=await worker(),sub=await reg.pushManager.getSubscription();
   if(token()!==current||!config.enabled||!sub)return;
   // Rebind only a previously approved browser subscription.
   await api('POST',sub.toJSON(),current);
   if(token()===current){await bind(config.user_id);enabled=true;paint();}
  }catch{/* Leave alerts unbound until a valid signed-in session is confirmed. */}
 }
 // Clear the worker binding synchronously with logout/session removal.
 const remove=Storage.prototype.removeItem,clear=Storage.prototype.clear,set=Storage.prototype.setItem;
 Storage.prototype.removeItem=function(key){if(this===localStorage&&key==='lonerpay_access_token')bind(null).catch(()=>{});return remove.call(this,key);};
 Storage.prototype.clear=function(){if(this===localStorage)bind(null).catch(()=>{});return clear.call(this);};
 Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='lonerpay_access_token'&&value!==token())bind(null).catch(()=>{});return set.call(this,key,value);};
 new MutationObserver(controls).observe(document.body,{childList:true,subtree:true});controls();sync().catch(()=>{});
 setInterval(()=>sync().catch(()=>{}),1500);
 window.addEventListener('storage',()=>sync().catch(()=>{}));
 // A push link opens only a transaction returned by the authenticated history API.
 async function openFundingReceipt(){
  const id=new URL(location.href).searchParams.get('funding');
  if(!/^[0-9a-f-]{36}$/i.test(id||'')||!token())return;
  const current=token();
  try{
   const r=await fetch('/api/transactions?funding='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+current},cache:'no-store'}),d=await r.json();
   const tx=r.ok&&d.transactions?.find(t=>t.id===id&&t.transaction_type==='credit'&&t.status==='successful');
   if(token()!==current||!tx)return;
   window.openTransactionHistory?.();
   if(typeof window.showDigitalReceipt==='function')window.showDigitalReceipt({...tx,type:'Wallet Funding',service:'Wallet Funding',reference:tx.request_id,date:tx.created_at});
   const u=new URL(location.href);u.searchParams.delete('funding');history.replaceState(history.state,'',u);
  }catch{/* History remains available from the dashboard. */}
 }
 if(document.readyState==='complete')openFundingReceipt();else window.addEventListener('load',openFundingReceipt,{once:true});
})();
