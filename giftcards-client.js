(function(){
 'use strict';
 if(window.LonerPayGiftCards)return;
 // Illustrative interface content, never provider stock or a payable quote.
 const examples=[{id:'example-amazon-us',name:'Amazon',region:'United States',currency:'USD',values:[25,50,100]},
  {id:'example-apple-us',name:'Apple',region:'United States',currency:'USD',values:[25,50,100]},
  {id:'example-steam-us',name:'Steam',region:'United States',currency:'USD',values:[20,50,100]}];
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function open(){
  document.getElementById('lpGiftCards')?.remove();
  const root=document.createElement('div');root.id='lpGiftCards';root.className='lp-discovery-overlay';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','lpGiftCardsTitle');
  root.innerHTML=`<section class="lp-discovery-sheet"><header><button type="button" class="discovery-back" aria-label="Back to dashboard">←</button><div><small>LONERPAY</small><h2 id="lpGiftCardsTitle">Gift Cards</h2><p>A little choice. A thoughtful gift.</p></div></header><div class="discovery-body"><div class="gc-banner"><strong>Preview · service not active</strong><p>Explore the experience while provider approval is pending. No payments or card submissions are accepted.</p></div><nav class="gc-tabs" aria-label="Gift card sections"><button type="button" data-tab="buy">Buy cards</button><button type="button" data-tab="sell">Sell cards</button><button type="button" data-tab="orders">Orders</button></nav><div class="gc-content"></div></div></section>`;
  document.body.append(root);
  let tab='buy',cards=examples,mode='preview',query='',step='browse',chosen=null,value=null,sequence=0;
  const content=root.querySelector('.gc-content');
  const close=()=>{sequence++;root.remove();};root.querySelector('.discovery-back').onclick=close;
  function render(){
   root.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.tab===tab));b.onclick=()=>{tab=b.dataset.tab;step='browse';render();};});
   if(tab==='sell'){
    content.innerHTML=`<section class="discovery-result"><span class="discovery-eyebrow">SELLING · AWAITING ACTIVATION</span><h3>Turn eligible cards into naira</h3><p>Supported brands and verified offers will appear after activation.</p><ol class="gc-steps"><li>Choose the card brand, country and value.</li><li>Review the offer and trading conditions.</li><li>Submit card details securely when trading opens.</li><li>Track verification and confirmed settlement.</li></ol></section><div class="discovery-note"><strong>Keep your card details private</strong><p>This preview does not accept card codes or photos. An offer and settlement timeline must be confirmed before any trade.</p></div>`;return;
   }
   if(tab==='orders'){
    content.innerHTML=`<section class="discovery-result"><span class="discovery-eyebrow">ORDER TRACKING</span><h3>No gift-card orders yet</h3><p>Gift-card purchases and sales have not opened. Preview selections do not create orders.</p><p>Once activated, this section will show references, delivery updates and any confirmed refunds.</p><button type="button" class="discovery-primary gc-browse">Explore the preview</button></section>`;
    content.querySelector('.gc-browse').onclick=()=>{tab='buy';step='browse';render();};return;
   }
   if(step==='review'){
    content.innerHTML=`<section class="discovery-result"><span class="discovery-eyebrow">${mode==='sandbox'?'TEST CATALOGUE':'EXAMPLE CARD'} · PURCHASE PREVIEW</span><h3>Review your selection</h3><dl class="gc-review"><dt>Brand</dt><dd>${esc(chosen.name)}</dd><dt>Region</dt><dd>${esc(chosen.region)}</dd><dt>Card value</dt><dd>${esc(chosen.currency)} ${esc(value)}</dd><dt>Total in naira</dt><dd>Quote available after activation</dd><dt>Delivery</dt><dd>Details confirmed before payment</dd></dl><p>Check the card’s country, currency and redemption rules before buying. Some cards work only in their stated region.</p><button type="button" class="discovery-primary" disabled>Purchases not active yet</button><button type="button" class="discovery-secondary gc-edit">Change selection</button></section>`;
    content.querySelector('.gc-edit').onclick=()=>{step='choose';render();};return;
   }
   if(step==='choose'){
    content.innerHTML=`<section class="discovery-result"><span class="discovery-eyebrow">${mode==='sandbox'?'TEST CATALOGUE':'ILLUSTRATIVE EXAMPLE'}</span><h3>${esc(chosen.name)}</h3><p>${esc(chosen.region)} · ${esc(chosen.currency)}</p><fieldset class="gc-values"><legend>Choose a card value</legend>${chosen.values.map(v=>`<button type="button" data-value="${esc(v)}" aria-pressed="${v===value}">${esc(chosen.currency)} ${esc(v)}</button>`).join('')}</fieldset><p class="discovery-muted">${mode==='sandbox'?'Test catalogue only.':'Example values only; availability is not confirmed.'} No naira price or payment is offered in this preview.</p><button type="button" class="discovery-primary gc-review-next" ${value===null?'disabled':''}>Preview selection</button><button type="button" class="discovery-secondary gc-all">All cards</button></section>`;
    content.querySelectorAll('[data-value]').forEach(b=>b.onclick=()=>{value=Number(b.dataset.value);render();});
    content.querySelector('.gc-review-next').onclick=()=>{if(value===null)return;step='review';render();};content.querySelector('.gc-all').onclick=()=>{step='browse';render();};return;
   }
   content.innerHTML=`<div class="discovery-intro"><span class="discovery-eyebrow">${mode==='sandbox'?'PRESTMIT TEST CATALOGUE':'EXPLORE EXAMPLE CARDS'}</span><h3>Find a card for their world</h3><p>${mode==='sandbox'?'Browse test products. Purchases remain disabled.':'These sample brands demonstrate the design. Live brands, values and prices will come from the approved provider.'}</p></div><label class="discovery-label" for="gcSearch">Search cards</label><input id="gcSearch" type="search" maxlength="80" placeholder="Search a brand or region" value="${esc(query)}"><div class="gc-grid"></div><p class="gc-status" role="status" aria-live="polite"></p>`;
   function list(){
    const filtered=cards.filter(p=>(p.name+' '+p.region).toLowerCase().includes(query.toLowerCase()));
    const grid=content.querySelector('.gc-grid');grid.innerHTML=filtered.length?filtered.map(p=>`<button class="gc-card" type="button" data-id="${esc(p.id)}"><span class="gc-letter" aria-hidden="true">${esc(p.name.slice(0,1))}</span><strong>${esc(p.name)}</strong><span>${esc(p.region)} · ${esc(p.currency)}</span><small>${mode==='sandbox'?'Test product':'Example · not for sale'}</small></button>`).join(''):'<p>No matching cards. Try another brand or region.</p>';
    grid.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>{chosen=cards.find(p=>p.id===b.dataset.id);value=null;step='choose';render();});
   }
   content.querySelector('#gcSearch').oninput=e=>{query=e.target.value;list();};list();
  }
  render();root.querySelector('.discovery-back').focus();
  const token=localStorage.getItem('lonerpay_access_token');const request=++sequence;
  if(token)fetch('/api/giftcards',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async r=>{
   if(!r.ok)throw Error('Test catalogue unavailable');const d=await r.json();
   if(!root.isConnected||request!==sequence||localStorage.getItem('lonerpay_access_token')!==token)return;
   if(d.mode!=='sandbox'||!Array.isArray(d.cards)||!d.cards.length)return;
   const valid=d.cards.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.region==='string'&&typeof p.currency==='string'&&Number.isFinite(p.value)&&p.value>0);
   if(!valid.length||step!=='browse')return;cards=valid.map(p=>({...p,values:[p.value]}));mode='sandbox';
   // Keep an in-progress selection stable; update only the untouched catalogue.
   if(tab==='buy'&&step==='browse')render();
  }).catch(()=>{if(root.isConnected&&tab==='buy'&&step==='browse'){const status=content.querySelector('.gc-status');if(status)status.textContent='Showing examples. Test catalogue is not connected yet.';}});
 }
 const style=document.createElement('style');style.textContent=`#lpGiftCards .gc-banner{background:#f3ebd7;border:1px solid #e5d5b3;border-radius:15px;padding:14px}#lpGiftCards .gc-banner p{font-size:12px;margin-bottom:0}.gc-tabs{display:flex;gap:8px;margin:20px 0}.gc-tabs button,.gc-values button{flex:1;border:1px solid #dfd1b4;border-radius:12px;background:white;color:#795519;padding:12px 8px;cursor:pointer}.gc-tabs [aria-pressed=true],.gc-values [aria-pressed=true]{background:#936514;color:white}.gc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px 0}.gc-card{border:1px solid #e6d9be;border-radius:18px;background:#fff;padding:16px;text-align:left;color:#28251e;cursor:pointer;min-width:0}.gc-card strong,.gc-card>span,.gc-card small{display:block;margin-top:8px}.gc-card>span{font-size:12px;line-height:1.5}.gc-card small{font-size:10px;color:#795519}.gc-card .gc-letter{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:#f3ebd7;font-size:22px;font-weight:800}.gc-values{border:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}.gc-values legend{font-size:13px;font-weight:700;margin-bottom:12px}.gc-review{display:grid;grid-template-columns:1fr 1.4fr;gap:12px;font-size:13px;line-height:1.6}.gc-review dt{color:#716654}.gc-review dd{margin:0;text-align:right;font-weight:600}.gc-steps{padding-left:20px;font-size:14px;line-height:1.8;color:#716654}#lpGiftCards #gcSearch{width:100%;border:1px solid #dfd1b4;border-radius:13px;padding:14px;background:white;color:#28251e}#lpGiftCards button:disabled{cursor:not-allowed}#lpGiftCards .gc-status{font-size:12px}@media(max-width:340px){.gc-grid{grid-template-columns:1fr}.gc-tabs{gap:4px}.gc-tabs button{font-size:12px}}`;
 document.head.append(style);
 window.LonerPayGiftCards=Object.freeze({open});
})();
