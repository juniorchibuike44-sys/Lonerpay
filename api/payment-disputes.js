import crypto from 'node:crypto';
import {cleanText,enforceSharedRateLimit,hardenResponse,requireUser} from './_security.js';

const REASONS=new Set(['not_received','pending_too_long','charged_twice','wrong_amount','other']);
const headers=auth=>({apikey:auth.secretKey,Authorization:`Bearer ${auth.secretKey}`,'Content-Type':'application/json'});

async function rest(auth,path,options={}){
  const response=await fetch(`${auth.supabaseUrl}/rest/v1/${path}`,{
    ...options,headers:{...headers(auth),...(options.headers||{})},signal:AbortSignal.timeout(8000)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){const error=new Error(data?.message||data?.hint||'Payment report could not be saved');error.status=response.status;throw error;}
  return data;
}

function caseReference(){
  return `LPD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export default async function handler(req,res){
  hardenResponse(res);
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  if(!await enforceSharedRateLimit(req,res,{key:'payment-disputes',limit:req.method==='POST'?6:30,windowMs:10*60_000}))return;
  const auth=await requireUser(req,res);if(!auth)return;
  try{
    if(req.method==='GET'){
      const q=new URLSearchParams({select:'case_reference,request_id,service,amount,reason,customer_message,transaction_status,case_status,resolution,resolution_note,provider_status,created_at,updated_at,resolved_at',user_id:`eq.${auth.user.id}`,order:'created_at.desc',limit:'50'});
      const cases=await rest(auth,`lp_payment_disputes?${q}`);
      return res.status(200).json({cases});
    }
    const requestId=cleanText(req.body?.request_id,150);
    const reason=cleanText(req.body?.reason,40).toLowerCase();
    const message=cleanText(req.body?.message,500);
    if(!requestId||!REASONS.has(reason))return res.status(400).json({error:'Choose the affected transaction and a valid problem.'});
    if(reason==='other'&&message.length<10)return res.status(400).json({error:'Please describe the problem in at least 10 characters.'});
    const tq=new URLSearchParams({select:'id,user_id,request_id,transaction_type,service,amount,status,details,created_at',user_id:`eq.${auth.user.id}`,request_id:`eq.${requestId}`,transaction_type:'eq.debit',limit:'1'});
    const transactions=await rest(auth,`wallet_transactions?${tq}`);
    const transaction=transactions?.[0];
    if(!transaction)return res.status(404).json({error:'That transaction was not found in your account.'});
    if(transaction.status==='refunded')return res.status(409).json({error:'This transaction has already been refunded to your wallet.',already_refunded:true});
    const existingQ=new URLSearchParams({select:'case_reference,case_status,created_at',user_id:`eq.${auth.user.id}`,request_id:`eq.${requestId}`,case_status:'in.(open,investigating)',limit:'1'});
    const existing=await rest(auth,`lp_payment_disputes?${existingQ}`);
    if(existing?.[0])return res.status(200).json({success:true,existing:true,case:existing[0],message:'This transaction is already being reviewed.'});
    const record={case_reference:caseReference(),user_id:auth.user.id,transaction_id:transaction.id,request_id:requestId,service:String(transaction.service||'payment'),amount:Number(transaction.amount),reason,customer_message:message,transaction_status:String(transaction.status||'pending'),provider_status:String(transaction.details?.provider_status||'')||null};
    const created=await rest(auth,'lp_payment_disputes',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(record)});
    return res.status(201).json({success:true,case:created?.[0],message:'Your payment problem has been sent to LonerPay support.'});
  }catch(error){
    if(error.status===409)return res.status(409).json({error:'This transaction is already being reviewed.'});
    console.error('Payment dispute error',{method:req.method,code:error.status||'ERROR'});
    return res.status(502).json({error:'Payment support is temporarily unavailable. Please try again.'});
  }
}
