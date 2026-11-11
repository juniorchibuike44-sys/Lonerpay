import {requireUser,hardenResponse,enforceSharedRateLimit} from './_security.js';
import {businessAccess,businessDb,businessReference,confirmBusinessPayment} from './_business-subscription.js';
const ownerEmail='juniorchibuike44@gmail.com';
export default async function handler(req,res){hardenResponse(res);if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});if(req.method==='POST'){let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'Invalid request'});}if(body.action==='initialize')return res.status(503).json({code:'subscriptions_paused',error:'New Business Tools subscriptions and renewals are temporarily unavailable. No payment has been taken.'});}if(!await enforceSharedRateLimit(req,res,{key:'business-subscription',limit:40,windowMs:60000}))return;
 try{const a=await requireUser(req,res);if(!a)return;
 if(req.method==='GET'){
  if(req.query?.view==='admin'){if(String(a.user.email||'').toLowerCase()!==ownerEmail)return res.status(403).json({error:'Admin access only'});const offset=Math.max(0,Math.min(100000,parseInt(req.query.offset,10)||0));const [totals,payments]=await Promise.all([businessDb(a,'rpc/lp_business_subscription_totals','POST',{}),businessDb(a,'lp_business_subscription_payments?select=id,email,reference,amount_kobo,received_kobo,actual_refunded_kobo,status,fees_kobo,channel,paid_at,period_end,refunded_kobo,created_at&order=created_at.desc,id.desc&limit=51&offset='+offset)]);return res.status(200).json({totals,payments:payments.slice(0,50),has_more:payments.length>50});}
  const [status,payments]=await Promise.all([businessAccess(a),businessDb(a,'lp_business_subscription_payments?user_id=eq.'+a.user.id+'&select=reference,received_kobo,fees_kobo,status,checkout_url,paid_at,period_end,created_at&order=created_at.desc&limit=20')]);return res.status(200).json({...status,purchases_enabled:false,payments:payments.map(({checkout_url,...payment})=>payment)});
 }
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'Invalid request'});}
 const key=process.env.PAYSTACK_SECRET_KEY;if(!key?.startsWith('sk_live_'))return res.status(503).json({error:'Live Paystack payments are not configured.'});
 if(d.action==='verify'){
  if(!businessReference(d.reference))return res.status(400).json({error:'Invalid payment reference'});const rows=await businessDb(a,'lp_business_subscription_payments?reference=eq.'+encodeURIComponent(d.reference)+'&user_id=eq.'+a.user.id+'&limit=1');if(!rows.length)return res.status(404).json({error:'Payment not found'});
  if(rows[0].status==='pending'){const r=await fetch('https://api.paystack.co/transaction/verify/'+encodeURIComponent(d.reference),{headers:{Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(15000)});let result;try{result=await r.json();}catch{return res.status(503).json({error:'Paystack verification is temporarily unavailable. Do not pay again. Retry Check payment.',code:'provider_response_unavailable'});}
  if(!r.ok||!result.status)return res.status(503).json({error:'Could not retrieve payment confirmation from Paystack. Do not pay again. Retry Check payment.',code:'provider_lookup_failed'});
  if(result.data?.status!=='success')return res.status(202).json({pending:true,message:'Paystack has not confirmed this payment yet. If you have been debited, do not pay again; check this reference shortly.'});
  await confirmBusinessPayment(a,result.data);}
  return res.status(200).json(await businessAccess(a));
 }
 return res.status(400).json({error:'Invalid subscription request'});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Payment confirmation could not be synchronised. Do not pay again; retry Check payment with the same reference.',code:e.code||'confirmation_sync_unavailable'});}
}



