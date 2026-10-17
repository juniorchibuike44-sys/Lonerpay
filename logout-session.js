/* Explicit logout always returns to the public Get started / Log in screen. */
(()=>{
 window.finishLonerPayLogout=function(){
  const token=localStorage.getItem('lonerpay_access_token');
  localStorage.setItem('lonerpay_explicit_logout',String(Date.now()));
  for(const key of ['lonerpay_access_token','lonerpay_refresh_token','lonerpay_returning_user_v1'])localStorage.removeItem(key);
  // Supabase SDKs may keep an additional persisted refresh session on this origin.
  for(const key of Object.keys(localStorage)){if(/^sb-.*-auth-token(?:\..*)?$/.test(key))localStorage.removeItem(key);}
  window.speechSynthesis?.cancel();
  if(token)fetch('/api/logout',{method:'POST',headers:{Authorization:'Bearer '+token},keepalive:true,cache:'no-store'}).catch(()=>{});
  document.documentElement.style.visibility='hidden';
  location.replace('index.html');
 };
})();
