import {pairgateRequest,pairgateStatus,isPairgateSuccessfulStatus,isPairgateFailedStatus,pairgateMessage} from './_pairgate.js';
import {pairgateAccounting,savePairgateCost} from './_provider-accounting.js';
export async function saveSettlement(transaction,status,details={}) {
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 const response=await fetch(base+'/rest/v1/rpc/lp_pairgate_settle',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_user:transaction.user_id,p_request:transaction.request_id,p_status:status,p_details:details}),signal:AbortSignal.timeout(8000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result||typeof result.resolved!=='boolean')throw Error('Settlement could not be saved');
 return result;
}
export async function reconcilePurchase(transaction,{reference,note,actor}={}) {
 const saved=String(transaction.details?.provider_reference||'').trim();
 reference=String(reference||saved).trim();
 if(!reference) {
  await saveSettlement(transaction,'pending',{reconciliation_state:'needs_review',reconciliation_reason:'missing_provider_reference',last_checked_at:new Date().toISOString()});
  return {resolved:false,status:'pending',needs_review:true,message:'Provider confirmation is required. Your purchase is queued for support review. Do not buy again.'};
 }
 if(saved&&reference!==saved)throw Error('Provider reference does not match');
 let result;
 try { result=await pairgateRequest('/transaction/status?reference_code='+encodeURIComponent(reference),{method:'GET',signal:AbortSignal.timeout(8000)}); }
 catch { await saveSettlement(transaction,'pending',{last_checked_at:new Date().toISOString(),reconciliation_state:'needs_review',reconciliation_reason:'provider_unavailable'});return {resolved:false,status:'pending',message:'Provider status is temporarily unavailable. We will check again.'}; }
 const status=pairgateStatus(result.data);
 const returnedReference=String(result.data?.data?.reference_code||'');
 if(returnedReference&&returnedReference!==reference)throw Error('Provider returned a different reference');
 if(!result.response.ok){await saveSettlement(transaction,'pending',{last_checked_at:new Date().toISOString(),reconciliation_state:'needs_review',reconciliation_reason:'provider_unavailable'});return {resolved:false,status:'pending'};}
 const confirmed=isPairgateSuccessfulStatus(status),failed=isPairgateFailedStatus(status);
 if(!saved&&!confirmed&&!failed)throw Error('Provider has not confirmed this reference');
 const facts=pairgateAccounting(result.data,transaction.amount);
 const payload=result.data?.data||{};
 const details={provider_reference:reference,provider_status:status,provider_message:pairgateMessage(result.data,''),last_checked_at:new Date().toISOString(),reconciliation_state:confirmed||failed?'resolved':Date.now()-Date.parse(transaction.created_at)>900000?'needs_review':'checking',...(facts||{}),...(payload.token||payload.pin||result.data?.purchased_code?{purchased_code:String(payload.token||payload.pin||result.data.purchased_code)}:{}),...(actor?{reconciled_by:actor,reconciliation_note:note}: {})};
 const settled=await saveSettlement(transaction,confirmed?'successful':failed?'failed':'pending',details);
 if(settled.status==='successful'&&facts)try{await savePairgateCost({base:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,requestId:transaction.request_id,providerReference:reference,facts});}catch{console.error('Provider cost reconciliation required',{request_id:transaction.request_id});}
 return settled;
}
export async function reconciliationBatch() {
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 const q=new URLSearchParams({select:'user_id,request_id,status,service,amount,details,created_at',transaction_type:'eq.debit',status:'eq.pending','details->>provider':'eq.pairgate',request_id:'not.like.bulk-*',created_at:'lt.'+new Date(Date.now()-60000).toISOString(),order:'updated_at.asc',limit:'2'});
 const r=await fetch(base+'/rest/v1/wallet_transactions?'+q,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Pending purchases unavailable');
 const rows=await r.json();let resolved=0,review=0,errors=0;
 for(const row of rows)try{const result=await reconcilePurchase(row);if(result.resolved)resolved++;if(result.needs_review)review++;}catch{errors++;console.error('Purchase reconciliation will retry',{request_id:row.request_id});}
 return {checked:rows.length,resolved,review,errors};
}
