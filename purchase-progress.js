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
    return ['LonerPay Receipt',title,'Amount: '+money,...details.filter(x=>Array.isArray(x)&&x[1]!=null&&String(x[0]).toLowerCase()!=='status').map(([key,value])=>key+': '+value),'Status: Successful','Date: '+new Date().toLocaleString('en-NG',{timeZone:'Africa/Lagos'}),'Thank you for using LonerPay.'].join('\n');
  }
  function receiptCanvas({title='Payment successful',amount=0,details=[]}={}){
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');if(!c)return null;
    const rows=details.filter(x=>Array.isArray(x)&&x[1]!=null&&String(x[0]).toLowerCase()!=='status').slice(0,5),money=new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(amount)||0),date=new Date().toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'});
    const box=(x,y,w,h,r,fill)=>{c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();c.fillStyle=fill;c.fill();};
    c.fillStyle='#f3f6f8';c.fillRect(0,0,1080,1350);box(58,55,964,1240,48,'#ffffff');
    c.fillStyle='#163747';c.fillRect(58,55,964,230);box(98,98,82,82,24,'#e7c674');c.fillStyle='#614514';c.font='italic 700 58px Georgia';c.textAlign='center';c.fillText('L',139,159);c.textAlign='left';c.fillStyle='#ffffff';c.font='700 46px Arial';c.fillText('LonerPay',206,142);c.fillStyle='#c8d5dc';c.font='28px Arial';c.fillText('One app. Everyday payments.',206,184);
    c.beginPath();c.arc(540,370,70,0,Math.PI*2);c.fillStyle='#e7f8ef';c.fill();c.strokeStyle='#159667';c.lineWidth=15;c.lineCap='round';c.beginPath();c.moveTo(505,370);c.lineTo(530,395);c.lineTo(580,340);c.stroke();
    c.textAlign='center';c.fillStyle='#173142';c.font='700 42px Arial';c.fillText(String(title).replace(/\bSuccessful\b/i,'successful'),540,485);c.font='700 72px Arial';c.fillText(money,540,585);c.font='700 28px Arial';c.fillStyle='#16865f';c.fillText('SUCCESSFUL',540,637);
    box(105,690,870,Math.max(300,rows.length*96+105),28,'#f7f9fa');c.textAlign='left';let y=755;c.font='30px Arial';for(const [key,value] of rows){c.fillStyle='#71808b';c.fillText(String(key),145,y);c.fillStyle='#203847';c.font='700 30px Arial';c.textAlign='right';const text=String(value),shown=text.length>30?text.slice(0,27)+'…':text;c.fillText(shown,935,y);c.textAlign='left';c.font='30px Arial';c.strokeStyle='#e3e9ec';c.lineWidth=2;c.beginPath();c.moveTo(145,y+35);c.lineTo(935,y+35);c.stroke();y+=96;}
    c.fillStyle='#71808b';c.fillText('Date & time',145,y);c.fillStyle='#203847';c.font='700 27px Arial';c.textAlign='right';c.fillText(date,935,y);
    c.textAlign='center';c.fillStyle='#7c8992';c.font='26px Arial';c.fillText('Thank you for using LonerPay',540,1210);c.fillStyle='#a67a28';c.font='700 23px Arial';c.fillText('SECURE EVERYDAY PAYMENTS',540,1253);return canvas;
  }
  const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not create receipt image.')),'image/png'));
  function download(blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='LonerPay-Receipt-'+Date.now()+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function shareReceipt(receipt){
    const text=receiptText(receipt),canvas=receiptCanvas(receipt);
    if(canvas){const blob=await canvasBlob(canvas),file=new File([blob],'LonerPay-Receipt.png',{type:'image/png'}),data={title:'LonerPay Receipt',text:'LonerPay payment receipt',files:[file]};if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share(data);return 'shared';}download(blob);return 'downloaded';}
    if(navigator.share){await navigator.share({title:'LonerPay Receipt',text});return 'shared';}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return 'copied';}
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const copied=document.execCommand?.('copy');area.remove();if(copied)return 'copied';throw Error('Sharing is not available on this device.');
  }
  window.LonerPayPurchaseProgress={render,shareReceipt,receiptText,receiptCanvas};
})();
