import {cleanText,enforceSharedRateLimit,hardenResponse,requireUser} from './_security.js';
import {reconcilePurchase} from './_payment-reconciliation.js';

const OWNER='juniorchibuike44@gmail.com';
const headers=auth=>({apikey:auth.secretKey,Authorization:`Bearer ${auth.secretKey}`,'Content-Type':'application/json'});
async function rest(auth,path,options={}){
  const response=await fetch(`${auth.supabaseUrl}/rest/v1/${path}`,{...options,headers:{...headers(auth),...(options.headers||{})},signal:AbortSignal.timeout(8000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||'Dispute queue unavailable');
  return data;
}
async function patchCase(auth,id,record){
  return rest(auth,`lp_payment_disputes?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...record,updated_at:new Date().toISOString()})});
}
export default async function handler(req,res){
  hardenResponse(res);
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!await enforceSharedRateLimit(req,res,{key:'admin-disputes',limit:40}))return;
  const auth=await requireUser(req,res);if(!auth)return;
  if(String(auth.user.email||'').toLowerCase()!==OWNER)return res.status(403).json({error:'Owner access only'});
  try{
    if(req.method==='GET'){
      const q=new URLSearchParams({select:'id,case_reference,user_id,request_id,service,amount,reason,customer_message,transaction_status,case_status,resolution,resolution_note,provider_status,created_at,updated_at,resolved_at',order:'created_at.desc',limit:'100'});
      return res.status(200).json({cases:await rest(auth,`lp_payment_disputes?${q}`)});
    }
    const id=cleanText(req.body?.id,80),action=cleanText(req.body?.action,30),note=cleanText(req.body?.note,1000);
    if(!id||!['recheck','investigate','close'].includes(action))return res.status(400).json({error:'A valid case action is required.'});
    const cases=await rest(auth,`lp_payment_disputes?id=eq.${encodeURIComponent(id)}&select=*&limit=1`),item=cases?.[0];
    if(!item)return res.status(404).json({error:'Support case not found'});
    if(action==='investigate'){
      const updated=await patchCase(auth,id,{case_status:'investigating',resolution_note:note||'Owner review started'});
      return res.status(200).json({case:updated?.[0]});
    }
    const tq=new URLSearchParams({select:'user_id,request_id,status,service,amount,details,created_at',user_id:`eq.${item.user_id}`,request_id:`eq.${item.request_id}`,transaction_type:'eq.debit',limit:'1'});
    const transaction=(await rest(auth,`wallet_transactions?${tq}`))?.[0];
    if(!transaction)return res.status(404).json({error:'Original transaction not found'});
    if(action==='recheck'){
      if(transaction.details?.provider!=='pairgate')return res.status(409).json({error:'This payment cannot be checked automatically. Verify it with the provider and close the case with a note.'});
      const result=await reconcilePurchase(transaction,{note:note||`Case ${item.case_reference}`,actor:auth.user.id});
      const refunded=result.status==='refunded';
      const providerDelivered=result.status==='successful';
      const resolutionNote=refunded
        ? (note||'Provider confirmed failure. Customer wallet refunded.')
        : providerDelivered
          ? (note||'Provider reports successful. Customer non-delivery complaint still requires provider investigation.')
          : (note||'Provider has not returned a final status.');
      const updated=await patchCase(auth,id,{case_status:refunded?'resolved':'investigating',transaction_status:result.status,provider_status:result.status,resolution:refunded?'refunded':null,resolution_note:resolutionNote,resolved_at:refunded?new Date().toISOString():null,resolved_by:refunded?auth.user.id:null});
      return res.status(refunded?200:202).json({case:updated?.[0],reconciliation:result,provider_follow_up:providerDelivered});
    }
    if(note.length<10)return res.status(400).json({error:'Add a clear resolution note of at least 10 characters.'});
    const resolution=transaction.status==='refunded'?'refunded':transaction.status==='successful'&&['successful','success','completed','paid','approved','delivered'].includes(String(transaction.details?.provider_status||'').toLowerCase())?'provider_confirmed_delivery':'other';
    const updated=await patchCase(auth,id,{case_status:'closed',transaction_status:transaction.status,provider_status:transaction.details?.provider_status||null,resolution,resolution_note:note,resolved_at:new Date().toISOString(),resolved_by:auth.user.id});
    return res.status(200).json({case:updated?.[0]});
  }catch(error){console.error('Admin dispute error',{code:error.message});return res.status(502).json({error:error.message||'Dispute queue unavailable'});}
}
