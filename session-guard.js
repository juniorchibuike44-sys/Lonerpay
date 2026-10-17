/* Recheck protected pages when restored by Back or another tab signs out. */
(()=>{
 const token=()=>localStorage.getItem('lonerpay_access_token');
 function hide(){document.documentElement.style.visibility='hidden';}
 function check(){if(!token()||localStorage.getItem('lonerpay_explicit_logout')){hide();location.replace('index.html');return false;}document.documentElement.style.visibility='';return true;}
 check();window.addEventListener('pageshow',check);window.addEventListener('focus',check);
 window.addEventListener('pagehide',hide);
 window.addEventListener('storage',e=>{if(e.key===null||['lonerpay_access_token','lonerpay_explicit_logout'].includes(e.key))check();});
})();
