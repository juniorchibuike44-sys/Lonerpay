import {randomUUID} from 'node:crypto';
import {cleanText,enforceSharedRateLimit,hardenResponse,requireUser} from './_security.js';
import {sendDeletionNotice} from './_deletion-mail.js';
export default async function handler(req,res){
 hardenResponse(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!await enforceSharedRateLimit(req,res,{key:'closure',limit:6,windowMs:15*60_000}))return;
 try{
  const auth=await requireUser(req,res);if(!auth)return;
  const headers={apikey:auth.secretKey,Authorization:`Bearer ${auth.secretKey}`},previous=auth.user.app_metadata?.account_closure_request||null;
  let balance=null,hasPending=null;
  // Safety checks inform review. They never block submitting a deletion request.
  try{
   const [wr,pr]=await Promise.all([
    fetch(`${auth.supabaseUrl}/rest/v1/wallets?user_id=eq.${encodeURIComponent(auth.user.id)}&select=balance&limit=1`,{headers,cache:'no-store'}),
    fetch(`${auth.supabaseUrl}/rest/v1/wallet_transactions?user_id=eq.${encodeURIComponent(auth.user.id)}&status=eq.pending&select=request_id&limit=1`,{headers,cache:'no-store'})
   ]);
   if(wr.ok&&pr.ok){const wallets=await wr.json(),pending=await pr.json();if(Array.isArray(wallets)&&Array.isArray(pending)){const n=Number(wallets[0]?.balance??0);if(Number.isFinite(n)){balance=n;hasPending=pending.length>0;}}}
  }catch{/* Unavailable balance checks require manual review. */}
  if(req.method==='GET')return res.status(200).json({balance,has_pending_transactions:hasPending,checks_ready:balance!==null&&hasPending!==null,request:previous});
  if(!['DELETE MY ACCOUNT','CLOSE MY ACCOUNT'].includes(cleanText(req.body?.confirmation,30).toUpperCase()))return res.status(400).json({error:'Type DELETE MY ACCOUNT to confirm the deletion request.'});
  const existing=previous?.status==='pending_review'&&previous?.reference;
  const reference=existing?previous.reference:'DEL-'+randomUUID();
  const request=existing?previous:{reference,reason:cleanText(req.body?.reason,500),status:'pending_review',requested_at:new Date().toISOString(),request_type:'account_and_data_deletion',balance_at_request:balance,pending_at_request:hasPending};
  if(!existing){
   const update=await fetch(`${auth.supabaseUrl}/auth/v1/admin/users/${auth.user.id}`,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({app_metadata:{...(auth.user.app_metadata||{}),account_closure_request:request}})});
   if(!update.ok)return res.status(503).json({error:'Could not save your deletion request. Please email support@lonerpay.com.'});
  }
  let emailed=false;try{await sendDeletionNotice({reference,email:auth.user.email,userId:auth.user.id,details:request.reason,balance,pending:hasPending});emailed=true;}catch{/* Request remains durably saved for owner review. */}
  return res.status(existing?200:201).json({success:true,reference,email_sent:emailed,message:emailed?'Your deletion request is saved and sent to support for review.':'Your deletion request is saved, but the support email could not be confirmed. Contact support@lonerpay.com with this reference.'});
 }catch{return res.status(503).json({error:'Your request could not be confirmed. Please contact support@lonerpay.com before retrying.'});}
}
