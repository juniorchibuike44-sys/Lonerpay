/* Visual enhancements only. Existing nodes and their payment handlers are retained. */
(function(){
  'use strict';
  const paths={
    airtime:'M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-7M8 17h4M13 3a8 8 0 0 1 8 8M13 7a4 4 0 0 1 4 4',
    data:'M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01',
    electricity:'m13 2-8 12h6l-1 8 9-13h-7l1-7',
    tv:'M4 7h16v13H4zM8 3l4 4 4-4M9 23h6',
    education:'m2 9 10-5 10 5-10 5L2 9M6 11v6q6 4 12 0v-6M22 9v8',
    transfer:'M3 7h16m-4-4 4 4-4 4M21 17H5m4-4-4 4 4 4',
    account:'m3 9 9-6 9 6H3M5 11v7m5-7v7m5-7v7m5-7v7M3 21h18',
    bet:'M4 4h16v4a8 8 0 0 1-16 0V4M4 6H1v3q0 4 4 4m15-7h3v3q0 4-4 4M12 16v5m-4 0h8',
    cards:'M3 5h18v14H3zM3 10h18M7 15h3',
    ai:'m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2',
    flight:'m21 3-7 18-3-8-8-3 18-7M11 13l5-5',
    refund:'M4 10a8 8 0 1 1 0 6M4 4v6h6',
    home:'m3 10 9-7 9 7v11h-6v-7H9v7H3V10',
    history:'M4 4h16v17H4zM8 9h8M8 13h8M8 17h4',
    profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a8 6 0 0 1 16 0v2',
    plus:'M12 5v14M5 12h14',
    services:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    bell:'M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3V9M10 21h4',
    shield:'m12 2 8 4v6q0 6-8 10-8-4-8-10V6l8-4M8 12l3 3 5-6',
    support:'M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v6h4v-6H4m16 0h2v6h-4v-6h2M20 18v3h-6'
  };
  const icon=key=>`<svg class="lg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[key]||paths.services}"/></svg>`;
  function nameKey(name){return /airtime/i.test(name)?'airtime':/data/i.test(name)?'data':/electric/i.test(name)?'electricity':/tv|cable/i.test(name)?'tv':/education|exam/i.test(name)?'education':/bet/i.test(name)?'bet':/recharge|gift|card/i.test(name)?'cards':/transfer|send/i.test(name)?'transfer':/virtual|account/i.test(name)?'account':/flight/i.test(name)?'flight':/refund/i.test(name)?'refund':/ai|tip/i.test(name)?'ai':'services'}
  function paint(){
    document.body.classList.add('lp-gold-dashboard');
    const brand=document.querySelector('.header h1');
    if(brand&&!brand.dataset.gold){brand.innerHTML='<span class="lg-brand-mark" aria-hidden="true">L</span>LonerPay';brand.dataset.gold='1'}
    document.querySelectorAll('.service').forEach(card=>{
      const box=card.querySelector(':scope > div:first-child'),name=card.querySelector('h3')?.textContent||'';
      if(box&&box.dataset.goldName!==name){box.innerHTML=icon(nameKey(name));box.dataset.goldName=name}
      if(!card.hasAttribute('tabindex')){card.tabIndex=0;card.setAttribute('role','button');card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click()}})}
    });
    const quick=document.querySelectorAll('#lpHomeQuickActions button');
    quick.forEach(button=>{const span=button.querySelector('span');if(span&&!span.dataset.gold){span.innerHTML=icon(/fund/i.test(button.textContent)?'plus':/transaction/i.test(button.textContent)?'history':/transfer|send/i.test(button.textContent)?'transfer':'services');span.dataset.gold='1'}});
    document.querySelectorAll('.lp-bottom-nav .lp-nav-item').forEach(button=>{const span=button.querySelector('span');if(span&&!span.dataset.gold){span.innerHTML=icon(/transaction/i.test(button.textContent)?'history':/profile/i.test(button.textContent)?'profile':/ai/i.test(button.textContent)?'ai':'home');span.dataset.gold='1'}});
    document.querySelectorAll('[data-highlight-action]').forEach(button=>{
      if(button.dataset.goldBound)return;
      button.dataset.goldBound='1';
      button.onclick=()=>{
        const action=button.dataset.highlightAction;
        if(action==='fund')window.openFundWallet?.();
        else if(action==='history')window.openTransactionHistory?.();
        else if(action==='profile')window.openProfile?.();
        else if(action==='data')window.buyData?.();
      };
    });
    const bell=document.querySelector('#lpNotify');if(bell&&!bell.dataset.gold){bell.innerHTML=icon('bell')+'<span class="dot"></span>';bell.dataset.gold='1'}
    document.querySelectorAll('.lp-value-card i').forEach((el,i)=>{if(!el.dataset.gold){el.innerHTML=icon(['electricity','history','support'][i]||'shield');el.dataset.gold='1'}});
    const shield=document.querySelector('.lp-security-icon');if(shield&&!shield.dataset.gold){shield.innerHTML=icon('shield');shield.dataset.gold='1'}
  }
  function init(){paint();const services=document.querySelector('.services');if(services)new MutationObserver(paint).observe(services,{childList:true,subtree:true});setTimeout(paint,800);setTimeout(paint,1800)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

