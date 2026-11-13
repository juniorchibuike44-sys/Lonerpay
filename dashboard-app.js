/* Presentation only: keep original service nodes, wallet state and payment handlers. */
(()=>{
 'use strict';
 const paths={services:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',down:'M12 4v16m-6-6 6 6 6-6',up:'M12 20V4m-6 6 6-6 6 6',eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',eyeOff:'m3 3 18 18M10 5a12 12 0 0 1 12 7 17 17 0 0 1-3 4M6 6a17 17 0 0 0-4 6s3 7 10 7a13 13 0 0 0 5-1'};
 const icon=key=>`<svg class="lg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key]||paths.services}"/></svg>`;
 let sheet,focusBefore,overflowBefore,listSignature=null,listNodes=[];
 const serviceName=card=>card.id==='lpReferralButton'?'Invite friends':card.id==='lpBillReminderButton'?'Bill reminders':card.querySelector('h3')?.textContent.trim()||'Service';
 const services=()=>[...document.querySelectorAll('.services .service'),...document.querySelectorAll('#lpReferralButton,#lpBillReminderButton')].filter(card=>!card.matches('.lp-primary-restricted,[hidden]')&&card.style.display!=='none');
 function close(){if(!sheet)return;sheet.remove();sheet=null;document.body.style.overflow=overflowBefore;document.removeEventListener('keydown',keys);focusBefore?.focus();}
 function keys(e){if(e.key==='Escape')close();if(e.key==='Tab'&&sheet){const items=[...sheet.querySelectorAll('button:not([hidden]),input')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
 function list(){if(!sheet)return;const q=sheet.querySelector('input').value.trim().toLowerCase(),grid=sheet.querySelector('.lp-app-services-grid'),nodes=services(),signature=q+'|'+nodes.map(serviceName).join('|');if(signature===listSignature&&nodes.every((node,i)=>node===listNodes[i]))return;listSignature=signature;listNodes=nodes;grid.replaceChildren();let count=0;
  nodes.forEach(card=>{const name=serviceName(card);if(q&&!name.toLowerCase().includes(q))return;
   const button=document.createElement('button');button.type='button';button.className='lp-app-service';const glyph=document.createElement('span');const original=card.querySelector(':scope > div:first-child svg');if(original)glyph.append(original.cloneNode(true));else glyph.innerHTML=icon('services');const label=document.createElement('strong');label.textContent=name;button.append(glyph,label);button.onclick=()=>{close();card.click();};grid.append(button);count++;
  });sheet.querySelector('[role=status]').textContent=count?'':'No matching services. Try another name.';
 }
 function open(){close();listSignature=null;listNodes=[];focusBefore=document.activeElement;overflowBefore=document.body.style.overflow;document.body.style.overflow='hidden';sheet=document.createElement('section');sheet.id='lpAppServices';sheet.className='lp-app-services';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-labelledby','lpAppServicesTitle');sheet.innerHTML='<div class="lp-app-services-inner"><header><button type="button" aria-label="Back to dashboard">‹</button><h2 id="lpAppServicesTitle">All services</h2></header><input type="search" placeholder="Search services" aria-label="Search services" autocomplete="off"><div class="lp-app-services-grid"></div><p role="status" aria-live="polite"></p></div>';document.body.append(sheet);sheet.querySelector('header button').onclick=close;sheet.querySelector('input').oninput=list;document.addEventListener('keydown',keys);list();sheet.querySelector('header button').focus();}
 window.openLonerPayServices=open;
 // Delegate shell actions so late-created/replaced controls never lose navigation.
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('button');if(!b)return;
  const quick=b.closest('#lpHomeQuickActions'),nav=b.closest('.lp-bottom-nav');
  const label=b.textContent.trim();let action;
  if(b.id==='lpProfile'||(nav&&/Profile/i.test(label)))action=()=>{window.location.href='profile.html';};
  else if(quick&&/Fund Wallet/i.test(label)&&typeof window.openFundWallet==='function')action=()=>window.openFundWallet();
  else if((quick||nav)&&/Transactions/i.test(label)&&typeof window.openTransactionHistory==='function')action=()=>window.openTransactionHistory();
  else if((quick||nav)&&/^Services$/i.test(label))action=open;
  if(!action)return;e.preventDefault();e.stopImmediatePropagation();action();
 },true);
 function paint(){
  document.body.classList.add('lp-app-screen');
  document.querySelectorAll('.services .service').forEach(card=>{const name=card.querySelector('h3')?.textContent.trim()||'';const kind=name==='Airtime'?'airtime':name==='Data'?'data':name==='Electricity'?'electricity':name==='TV'?'tv':null;if(kind){card.dataset.appKind=kind;card.classList.remove('lp-home-extra');}else card.classList.add('lp-home-extra');});
  const head=document.getElementById('lpHomeServicesHead');if(head){const title=head.querySelector('h2');if(title.textContent!=='Pay bills')title.textContent='Pay bills';const b=head.querySelector('button');if(b.textContent!=='All services →')b.textContent='All services →';b.onclick=open;}
  const quick=[...document.querySelectorAll('#lpHomeQuickActions button')];if(quick[2])quick[2].onclick=open;
  const nav=document.querySelector('.lp-bottom-nav .lp-nav-item:nth-child(3)');if(nav&&!nav.dataset.app){nav.dataset.app='true';nav.innerHTML='<span data-gold="1">'+icon('services')+'</span>Services';nav.onclick=open;}
  const eye=document.querySelector('.balance .lp-eye,.balance #lpBalancePrivacyBtn');if(eye&&eye.dataset.appEye!==eye.getAttribute('aria-label')){eye.dataset.appEye=eye.getAttribute('aria-label');eye.innerHTML=icon(/Show/i.test(eye.dataset.appEye)?'eyeOff':'eye');}
  const account=document.querySelector('.lp-va-head b');if(account&&account.textContent!=='Your funding account')account.textContent='Your funding account';
 }
 function init(){paint();let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paint();if(sheet)list();});}).observe(document.querySelector('.container'),{childList:true,subtree:true});setTimeout(paint,850);setTimeout(paint,1900);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
