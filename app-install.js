(function(){
 'use strict';
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
 },{once:true});
})();
