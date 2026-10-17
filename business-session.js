/* Refresh expired sessions without replacing invoice fields or payment request IDs. */
(()=>{
 const accessKey='lonerpay_access_token',refreshKey='lonerpay_refresh_token';
 const get=key=>localStorage.getItem(key)||'';
 function subject(token){try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,'='))).sub||'';}catch{return '';}}
 const initialSubject=subject(get(accessKey));let renewing=null;
 function sameAccount(token){if(!initialSubject||subject(token)!==initialSubject){const e=Error('Your account changed. Close Business Tools and reopen it from your dashboard.');e.status=401;throw e;}return token;}
 function expired(){const e=Error('Your login needs to be renewed. Sign in to LonerPay in another tab, then retry here. Keep this page open to preserve your entries.');e.status=401;return e;}
 async function renew(failedToken){
  const latest=get(accessKey);if(latest&&latest!==failedToken)return sameAccount(latest);
  if(renewing)return renewing;
  renewing=(async()=>{
   const refresh=get(refreshKey);if(!refresh)throw expired();
   const c=await fetch('/api/config',{cache:'no-store'});if(!c.ok)throw Error('Could not renew your login. Check your connection and retry; your entries are still here.');const cfg=await c.json();
   const r=await fetch(cfg.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.supabasePublishableKey},body:JSON.stringify({refresh_token:refresh}),cache:'no-store'});
   const s=await r.json();
   // Another tab may have signed out, switched accounts, or rotated the session.
   const now=get(accessKey);if(now!==failedToken||get(refreshKey)!==refresh){if(now&&now!==failedToken)return sameAccount(now);throw expired();}
   if(!r.ok||!s.access_token)throw expired();sameAccount(s.access_token);
   localStorage.setItem(accessKey,s.access_token);if(s.refresh_token)localStorage.setItem(refreshKey,s.refresh_token);return s.access_token;
  })();try{return await renewing;}finally{renewing=null;}
 }
 window.lpBusinessSession={async request(url,options={}){
  let token=get(accessKey);sameAccount(token);
  const send=t=>fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+t},cache:'no-store'});
  let r=await send(token);
  if(r.status===401){token=await renew(token);r=await send(token);}
  sameAccount(get(accessKey));
  if(r.status===401)throw expired();return r;
 }};
})();
