import {requireUser,hardenResponse,enforceSharedRateLimit} from './_security.js';
import {businessAccess,businessDb,businessReference,confirmMonnifyBusinessPayment} from './_business-subscription.js';
import {monnifyConfig,monnifyAccessAllowed,monnifyIsPrimary,monnifyRequest} from './_monnify.js';
const ownerEmail='juniorchibuike44@gmail.com',uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
function checkoutUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='monnify.com'||u.hostname.endsWith('.monnify.com'))?u.href:'';}catch{return '';}}
function returnUrl(){const configured=process.env.LONERPAY_BASE_URL?.trim();if(configured&&/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured))return configured.replace(/\/$/,'')+'/business-subscribe.html';return 'https://lonerpay.com/business-subscribe.html';}
export default async function handler(req,res){
 hardenResponse(res);if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});if(!await enforceSharedRateLimit(req,res,{key:'business-subscription',limit:40,windowMs:60000}))return;
 try{const a=await requireUser(req,res);if(!a)return;
  if(req.method==='GET'){
   if(req.query?.view==='admin'){if(String(a.user.email||'').toLowerCase()!==ownerEmail)return res.status(403).json({error:'Admin access only'});const offset=Math.max(0,Math.min(100000,parseInt(req.query.offset,10)||0));const [totals,payments]=await Promise.all([businessDb(a,'rpc/lp_business_subscription_totals','POST',{}),businessDb(a,'lp_business_subscription_payments?select=id,email,reference,amount_kobo,received_kobo,actual_refunded_kobo,status,fees_kobo,channel,paid_at,period_end,refunded_kobo,created_at&order=created_at.desc,id.desc&limit=51&offset='+offset)]);return res.status(200).json({totals,payments:payments.slice(0,50),has_more:payments.length>50});}
   const [status,payments]=await Promise.all([businessAccess(a),businessDb(a,'lp_business_subscription_payments?user_id=eq.'+a.user.id+'&select=reference,received_kobo,fees_kobo,status,checkout_url,paid_at,period_end,created_at&order=created_at.desc&limit=20')]);return res.status(200).json({...status,purchases_enabled:true,provider:'monnify',payments});
  }
  let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'Invalid request'});}
  let c;try{c=monnifyConfig();}catch{return res.status(503).json({error:'Monnify subscription payments are temporarily unavailable.'});}
  if(!monnifyIsPrimary(a.user.id)||!monnifyAccessAllowed(c,a.user.id))return res.status(403).json({error:'Monnify is not yet enabled for this account.'});
  if(d.action==='verify'){
   if(!businessReference(d.reference))return res.status(400).json({error:'Invalid payment reference'});const rows=await businessDb(a,'lp_business_subscription_payments?reference=eq.'+encodeURIComponent(d.reference)+'&user_id=eq.'+a.user.id+'&limit=1');if(!rows.length)return res.status(404).json({error:'Payment not found'});
   if(rows[0].status==='pending'){
    if(rows[0].checkout_url&&!checkoutUrl(rows[0].checkout_url))return res.status(409).json({error:'This is an older payment attempt. Start a new Monnify checkout; you will not be charged twice unless you approve the new payment.',code:'legacy_payment_attempt'});
    let t;try{t=await monnifyRequest(c,'/api/v2/merchant/transactions/query?paymentReference='+encodeURIComponent(d.reference));}catch{return res.status(503).json({error:'Monnify verification is temporarily unavailable. Do not pay again; retry Check payment.',code:'provider_lookup_failed'});}
    if(t.paymentStatus!=='PAID')return res.status(202).json({pending:true,message:'Monnify has not confirmed this payment yet. If you were debited, do not pay again; check this reference shortly.'});
    await confirmMonnifyBusinessPayment(a,t,c.mode);
   }
   return res.status(200).json(await businessAccess(a));
  }
  if(d.action!=='initialize'||!uuid(d.id))return res.status(400).json({error:'Invalid subscription request'});if(!a.user.email)return res.status(400).json({error:'An account email is required.'});
  const reference='LPBIZ-'+d.id.toLowerCase();let rows=await businessDb(a,'lp_business_subscription_payments?id=eq.'+d.id+'&limit=1');if(rows.length&&rows[0].user_id!==a.user.id)return res.status(409).json({error:'Payment reference already used'});
  if(!rows.length){try{rows=await businessDb(a,'lp_business_subscription_payments','POST',{id:d.id,user_id:a.user.id,email:a.user.email,reference});}catch(e){rows=await businessDb(a,'lp_business_subscription_payments?id=eq.'+d.id+'&user_id=eq.'+a.user.id+'&limit=1');if(!rows.length)throw e;}}
  const payment=rows[0]||await businessDb(a,'lp_business_subscription_payments?id=eq.'+d.id+'&user_id=eq.'+a.user.id+'&limit=1').then(x=>x[0]);if(!payment)return res.status(503).json({error:'Could not prepare this payment. Refresh payment status before retrying.'});if(payment.status!=='pending')return res.status(409).json({error:'This payment was already processed. Refresh your subscription.'});const saved=checkoutUrl(payment.checkout_url);if(saved)return res.status(200).json({reference,checkout_url:saved});
  let checkout;try{checkout=await monnifyRequest(c,'/api/v1/merchant/transactions/init-transaction','POST',{amount:1000,customerName:String(a.user.user_metadata?.full_name||a.user.email).slice(0,100),customerEmail:a.user.email,paymentReference:reference,paymentDescription:'LonerPay Business Tools monthly plan',currencyCode:'NGN',contractCode:c.contract,redirectUrl:returnUrl(),paymentMethods:['CARD','ACCOUNT_TRANSFER','USSD'],metadata:{purpose:'business_tools',user_id:a.user.id}});}catch{return res.status(502).json({error:'Monnify could not open checkout. Check this payment reference before starting another payment.',code:'checkout_initialization_failed'});}
  const url=checkoutUrl(checkout.checkoutUrl);if(!url||checkout.paymentReference!==reference)return res.status(502).json({error:'Monnify returned an invalid checkout. No access was activated.',code:'invalid_checkout_response'});try{await businessDb(a,'lp_business_subscription_payments?id=eq.'+d.id+'&user_id=eq.'+a.user.id,'PATCH',{checkout_url:url});}catch{console.warn('Business checkout link could not be cached');}return res.status(200).json({reference,checkout_url:url});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Payment confirmation could not be synchronised. Do not pay again; retry Check payment with the same reference.',code:e.code||'confirmation_sync_unavailable'});}
}
