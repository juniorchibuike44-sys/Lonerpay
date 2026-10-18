export const businessReference=r=>typeof r==='string'&&/^LPBIZ-[a-f0-9-]{36}$/i.test(r);
export async function businessDb(a,path,method='GET',body){const r=await fetch(a.supabaseUrl+'/rest/v1/'+path,{method,headers:{apikey:a.secretKey,Authorization:'Bearer '+a.secretKey,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});const raw=await r.text();let d=[];try{if(raw)d=JSON.parse(raw);}catch{if(r.ok)throw Error('Business records returned an invalid response.');d={};}if(!r.ok){const e=Error(['PGRST202','PGRST204','PGRST205','42P01','42703'].includes(d?.code)?((path.includes('_v2')||path.includes('received_kobo'))?'Run supabase/business-subscription-fees.sql to finish payment confirmation. Do not pay again.':'Business subscription setup is required. Run supabase/business-subscriptions.sql.'):d?.code==='P0001'?String(d.message).slice(0,160):'Could not load Business subscription records.');e.status=503;throw e;}return d;}
export async function businessAccess(a,owner=a.user.id){const rows=await businessDb(a,'lp_business_subscriptions?user_id=eq.'+encodeURIComponent(owner)+'&select=expires_at&limit=1');const expires=rows[0]?.expires_at||null;return {active:!!expires&&Date.parse(expires)>Date.now(),expires_at:expires,price_kobo:100000,currency:'NGN'};}
export async function requireBusiness(a,res){try{const s=await businessAccess(a);if(s.active)return true;res.status(402).json({error:'Business Tools costs ₦1,000 per month. Subscribe or renew to continue.',subscription_required:true,...s});}catch(e){res.status(503).json({error:e.message});}return false;}
function paymentError(code){const e=Error('Your payment needs verification ('+code+'). Do not pay again. Keep this reference for support.');e.status=409;e.code=code;return e;}
export function validateBusinessPayment(t,record){
 let m=t?.metadata||{};
 for(let n=0;n<2&&typeof m==='string';n++){try{m=JSON.parse(m);}catch{m={};}}
 if(!m||typeof m!=='object'||Array.isArray(m))m={};
 if(!record||!businessReference(t?.reference)||t.reference!==record.reference)throw paymentError('reference_mismatch');
 if(t.status!=='success')throw paymentError('not_confirmed');
 if(t.domain!=='live')throw paymentError('not_live');
 const received=Number(t.amount),fee=Number.isSafeInteger(t.fees)&&t.fees>=0?t.fees:null;
 if(!Number.isSafeInteger(received)||received<100000)throw paymentError('amount_mismatch');
 const hasRequested=t.requested_amount!==undefined&&t.requested_amount!==null&&t.requested_amount!=='';
 if(hasRequested&&Number(t.requested_amount)!==100000)throw paymentError('requested_amount_mismatch');
 // Accept only an exact plan price or a provider-accounted checkout fee.
 if(received>100000&&(fee===null||received-100000>fee||(!hasRequested&&received-fee!==100000)))throw paymentError('unexplained_amount_mismatch');
 if(t.currency!=='NGN')throw paymentError('currency_mismatch');
 if(m.user_id!=null&&String(m.user_id)!==record.user_id)throw paymentError('account_mismatch');
 if(m.purpose!=null&&m.purpose!=='business_tools')throw paymentError('purpose_mismatch');
 // The server-owned checkout record binds this reference to the customer.
 // If optional metadata is absent, also match Paystack's checkout email.
 if(m.user_id==null||m.purpose==null){
  const expected=String(record.email||'').trim().toLowerCase(),actual=String(t.customer?.email||'').trim().toLowerCase();
  if(!expected||!actual||expected!==actual)throw paymentError('checkout_email_mismatch');
 }
 if(!((typeof t.id==='number'&&Number.isSafeInteger(t.id)&&t.id>0)||(typeof t.id==='string'&&/^[1-9][0-9]{0,19}$/.test(t.id))))throw paymentError('provider_id_invalid');
 const paid=t.paid_at||t.paidAt;
 if(!Number.isFinite(Date.parse(paid)))throw paymentError('payment_time_missing');
 return {p_reference:record.reference,p_provider:String(t.id),p_amount:100000,p_currency:'NGN',p_received:received,p_requested:100000,p_fees:fee,p_channel:String(t.channel||'').slice(0,40),p_paid:paid};
}
export async function confirmBusinessPayment(a,t){if(!businessReference(t?.reference))throw Error('Invalid Business payment reference.');const rows=await businessDb(a,'lp_business_subscription_payments?reference=eq.'+encodeURIComponent(t.reference)+'&limit=1');const p=validateBusinessPayment(t,rows[0]);return businessDb(a,'rpc/lp_business_subscription_confirm_v2','POST',p);}


