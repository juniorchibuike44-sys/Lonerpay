/* Clear animated feedback while a purchase is being submitted and confirmed. */
(() => {
  function installStyles() {
    if (document.getElementById('lpPurchaseProgressStyles')) return;
    const style = document.createElement('style');
    style.id = 'lpPurchaseProgressStyles';
    style.textContent = `
      .lp-purchase-progress{min-height:310px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:34px 22px;color:#17212b}
      .lp-purchase-orbit{position:relative;width:92px;height:92px;margin-bottom:28px}
      .lp-purchase-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#a87212 0 24%,#f0d79e 24% 49%,#a87212 49% 74%,#f7ecd1 74% 100%);animation:lp-purchase-spin 1.05s linear infinite}
      .lp-purchase-ring:after{content:"";position:absolute;inset:9px;border-radius:50%;background:#faf8f2}
      .lp-purchase-core{position:absolute;inset:22px;z-index:1;border-radius:50%;display:grid;place-items:center;background:#fff3d5;color:#9a6810;font-size:25px;font-weight:900;box-shadow:0 8px 22px rgba(147,101,20,.16)}
      .lp-purchase-progress h2{margin:0 0 9px;font-size:24px}.lp-purchase-progress p{max-width:300px;margin:0;color:#6d7888;line-height:1.55;font-size:14px}
      .lp-purchase-dots{display:flex;gap:7px;margin-top:22px}.lp-purchase-dots span{width:7px;height:7px;border-radius:50%;background:#b27a17;animation:lp-purchase-pulse 1.2s ease-in-out infinite}.lp-purchase-dots span:nth-child(2){animation-delay:.16s}.lp-purchase-dots span:nth-child(3){animation-delay:.32s}
      .lp-purchase-progress.is-complete .lp-purchase-ring{animation:none;background:#18a36b}.lp-purchase-progress.is-complete .lp-purchase-core{inset:9px;background:#e9fbf3;color:#098456;font-size:38px}.lp-purchase-progress.is-complete .lp-purchase-dots{display:none}
      @keyframes lp-purchase-spin{to{transform:rotate(360deg)}}@keyframes lp-purchase-pulse{0%,70%,100%{opacity:.25;transform:translateY(0)}35%{opacity:1;transform:translateY(-5px)}}
      @media(prefers-reduced-motion:reduce){.lp-purchase-ring,.lp-purchase-dots span{animation-duration:2.4s}}
    `;
    document.head.appendChild(style);
  }
  function render(host, stage, type) {
    if (!host) return;
    installStyles();
    const name=String(type||'purchase').replace(/^./,letter=>letter.toUpperCase());
    const complete=stage===2;
    const title=complete?`${name} successful`:stage===1?'Confirming your purchase…':'Securing your payment…';
    const message=complete?`Your ${type} purchase has been confirmed.`:stage===1?'Please wait while the network confirms delivery. Do not close the app or try again.':'Your request is being sent securely. This usually takes only a few seconds.';
    host.className='lp-purchase-progress'+(complete?' is-complete':'');
    host.setAttribute('role','status');host.setAttribute('aria-live','polite');
    host.innerHTML=`<div class="lp-purchase-orbit"><div class="lp-purchase-ring"></div><div class="lp-purchase-core">${complete?'✓':'L'}</div></div><h2>${title}</h2><p>${message}</p><div class="lp-purchase-dots" aria-hidden="true"><span></span><span></span><span></span></div>`;
  }
  function receiptText({title='Payment successful',amount=0,details=[]}={}){
    const money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(amount)||0);
    return ['LonerPay Receipt',title,'Amount: '+money,...details.filter(x=>Array.isArray(x)&&x[1]!=null).map(([key,value])=>key+': '+value),'Status: Successful','Date: '+new Date().toLocaleString('en-NG',{timeZone:'Africa/Lagos'}),'Thank you for using LonerPay.'].join('\n');
  }
  async function shareReceipt(receipt){
    const text=receiptText(receipt),data={title:'LonerPay Receipt',text};
    if(navigator.share){await navigator.share(data);return 'shared';}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return 'copied';}
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const copied=document.execCommand?.('copy');area.remove();if(copied)return 'copied';throw Error('Sharing is not available on this device.');
  }
  window.LonerPayPurchaseProgress={render,shareReceipt,receiptText};
})();
