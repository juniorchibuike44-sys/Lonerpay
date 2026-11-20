(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function request(body,reference){const send=window.lpBusinessSession?.request?.bind(window.lpBusinessSession)||fetch;const r=await send('/api/admin-payment-review'+(reference?'?'+new URLSearchParams({request_id:reference}):''),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+localStorage.getItem('lonerpay_access_token'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Review unavailable');return d;}
 function mountLookup(section) {
  const lookup = document.createElement('section');
  lookup.innerHTML = '<h3>Find a purchase</h3><form><label>LonerPay reference <input name="reference" maxlength="150" required></label> <button class="outline">Find purchase</button></form><div aria-live="polite"></div>';
  section.prepend(lookup);
  const form = lookup.querySelector('form');
  const button = form.querySelector('button');
  const output = lookup.querySelector('div');
  const date = value => value ? new Date(value).toLocaleString('en-NG',{timeZone:'Africa/Lagos'}) : 'Unknown';
  const money = value => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(value);
  form.onsubmit = async event => {
   event.preventDefault();
   const reference = form.elements.reference.value.trim();
   if (!reference) {
    output.textContent = 'Enter a LonerPay reference.';
    return;
   }
   button.disabled = true;
   output.textContent = 'Looking up purchase…';
   try {
    const {purchase:p} = await request(null,reference);
    const recordedRefund = p.refund?.status === 'successful';
    const charged = recordedRefund || p.wallet_debited === true || p.status === 'successful';
    const fields = [
     ['Purchase', [p.service,money(p.amount),p.request_id].join(' · ')],
     ['Created (Nigeria time)', date(p.created_at)],
     ['Wallet charge', charged ? money(p.amount)+' recorded' : p.wallet_debited === false ? 'Debit not recorded' : 'Unverified'],
     ['LonerPay status', p.status || 'Unknown'],
     ['Provider status', (p.provider ? p.provider+' · ' : '')+(p.provider_status || 'Unknown')],
     ['Provider reference', p.provider_reference || 'Unavailable'],
     ['Last provider check (Nigeria time)', date(p.last_checked_at)],
     ['Refund', recordedRefund ? money(p.refund.amount)+' credited · '+date(p.refund.created_at)
       : p.refund ? p.refund.status || 'Unknown' : p.status === 'refunded' ? 'Marked refunded · ledger entry unavailable' : 'No refund recorded']
    ];
    output.innerHTML = '<dl>'+fields.map(([label,value])=>'<dt><strong>'+esc(label)+'</strong></dt><dd>'+esc(value)+'</dd>').join('')+'</dl>';
   } catch (error) {
    output.textContent = error.message;
   } finally {
    button.disabled = false;
   }
  };
 }
 function mount(){const content=document.getElementById('content');if(!content?.querySelector('.finance-metrics')||document.getElementById('paymentReview'))return;
 const section=document.createElement('section');section.id='paymentReview';section.className='panel section';section.innerHTML='<h2>Pending payment review</h2><p>Background checks run automatically. For missing references, locate the matching purchase in Pairgate using the LonerPay reference, recipient, amount and time. Enter its provider reference only after checking the match. Settlement always checks Pairgate before updating or refunding.</p><button class="outline">Load pending purchases</button><div aria-live="polite"></div>';content.append(section);
 const output=section.querySelector('div'),load=section.querySelector('button');mountLookup(section);load.onclick=async()=>{load.disabled=true;output.textContent='Loading…';try{const d=await request();output.innerHTML=d.records.length?d.records.map(p=>'<form style="margin:16px 0;padding:12px;border:1px solid #ddd"><p><strong>'+esc(p.service)+' · ₦'+Number(p.amount).toLocaleString('en-NG')+'</strong><br>'+esc(p.request_id)+'<br>Recipient: '+esc(p.details?.billersCode||p.details?.phone)+' · '+esc(p.created_at)+'<br>'+esc(p.details?.reconciliation_reason||p.details?.reconciliation_state||'Awaiting confirmation')+'</p><input type="hidden" name="request_id" value="'+esc(p.request_id)+'"><label>Pairgate reference <input name="provider_reference" maxlength="150" value="'+esc(p.details?.provider_reference||'')+'" required></label><br><label>Review note <input name="note" maxlength="500" required placeholder="How you verified the match"></label><br><button class="outline">Check and reconcile</button><p role="status"></p></form>').join(''):'No pending Pairgate purchases.';
 for(const form of output.querySelectorAll('form'))form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),status=form.querySelector('[role=status]');button.disabled=true;try{const d=await request(Object.fromEntries(new FormData(form)));status.textContent=d.resolved?'Resolved: '+d.status:'Still pending. Background checks will continue.';if(!d.resolved)button.disabled=false;}catch(error){status.textContent=error.message;button.disabled=false;}};
 }catch(error){output.textContent=error.message;}finally{load.disabled=false;}};
 }
 new MutationObserver(mount).observe(document.getElementById('content'),{childList:true});mount();
})();
