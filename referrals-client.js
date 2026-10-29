(()=>{
 const token=()=>localStorage.getItem('lonerpay_access_token')||'';
 function open(){
  if(document.getElementById('lpReferralOverlay'))return;
  const o=document.createElement('section');o.id='lpReferralOverlay';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Invite friends');
  o.innerHTML=`<style>#lpReferralOverlay{position:fixed;inset:0;z-index:31000;background:#1c170eb3;display:flex;align-items:flex-end;justify-content:center;font:15px Arial,sans-serif}#lpReferralOverlay *{box-sizing:border-box}#lpReferralOverlay .sheet{width:min(100%,530px);max-height:90dvh;overflow:auto;background:#faf8f2;padding:24px;border-radius:24px 24px 0 0;color:#28251e}#lpReferralOverlay button{font:inherit;cursor:pointer;border:0;border-radius:12px;padding:13px}#lpReferralOverlay .close{float:right;background:#eee7d8}#lpReferralOverlay .card{background:white;border:1px solid #e6d6b8;border-radius:16px;padding:18px;margin:14px 0}#lpReferralOverlay .code{font-size:24px;font-weight:800;letter-spacing:2px;overflow-wrap:anywhere}#lpReferralOverlay .primary{background:#936514;color:white;font-weight:700;width:100%;margin-top:8px}#lpReferralOverlay .secondary{background:#eee7d8;width:100%;margin-top:8px}#lpReferralOverlay p{line-height:1.55;color:#746c5c;font-size:13px}</style><div class="sheet"><button class="close" aria-label="Close" type="button">×</button><h2>Invite friends</h2><p>Share your link or code. Verified sign-ups using your code appear here. There are no referral rewards at this time.</p><div class="card"><div>Your referral code</div><div class="code">Loading…</div></div><div class="card">Verified sign-ups: <strong class="count">—</strong></div><button class="primary" type="button" disabled>Share invite</button><button class="secondary" type="button" disabled>Copy code</button><p class="status" role="status"></p></div>`;
  document.body.append(o);o.querySelector('.close').onclick=()=>o.remove();
  const status=o.querySelector('.status'),share=o.querySelector('.primary'),copy=o.querySelector('.secondary'),t=token();
  (async()=>{try{
   if(!t)throw Error('Please sign in again.');
   const r=await fetch('/api/referrals',{headers:{Authorization:'Bearer '+t},cache:'no-store'});const data=await r.json().catch(()=>({}));
   if(!r.ok||!/^([A-F0-9]{12})$/.test(data.code||''))throw Error(data.error||'Could not load your referral code.');
   if(t!==token()||!o.isConnected)return;
   o.querySelector('.code').textContent=data.code;o.querySelector('.count').textContent=String(data.verified_signups||0);
   const url='https://lonerpay.com/?ref='+encodeURIComponent(data.code);share.disabled=false;copy.disabled=false;
   share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:'LonerPay',text:'Join me on LonerPay. Use my referral code '+data.code, url});else {await navigator.clipboard.writeText(url);status.textContent='Invite link copied.';}}catch(e){if(e.name!=='AbortError')status.textContent='Could not share. Copy your code below.';}};
   copy.onclick=async()=>{try{await navigator.clipboard.writeText(data.code);status.textContent='Code copied.';}catch{status.textContent='Select and copy the code shown above.';}};
  }catch(e){status.textContent=e.message;o.querySelector('.code').textContent='Unavailable';}})();
 }
 function add(){if(document.getElementById('lpReferralButton'))return;const services=document.querySelector('.services');if(!services)return;const b=document.createElement('button');b.id='lpReferralButton';b.type='button';b.textContent='↗  Invite friends';b.style.cssText='display:block;width:100%;margin:14px 0;padding:14px;border:1px solid #e3d4b1;border-radius:14px;background:#fffaf0;color:#755313;font-weight:700;font-size:14px;cursor:pointer';b.onclick=open;services.insertAdjacentElement('afterend',b);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();setTimeout(add,1000);
})();
