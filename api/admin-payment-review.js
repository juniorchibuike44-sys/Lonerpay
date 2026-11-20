import {hardenResponse,requireUser,enforceSharedRateLimit} from './_security.js';
import {reconcilePurchase} from './_payment-reconciliation.js';
export default async function handler(req,res){
 hardenResponse(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!await enforceSharedRateLimit(req,res,{key:'payment-review',limit:20}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 if(String(auth.user.email||'').toLowerCase()!=='juniorchibuike44@gmail.com')return res.status(403).json({error:'Owner access only'});
 try{
 const lookup = req.method === 'GET' && req.query?.request_id !== undefined;
 if (lookup) {
  const requestId = typeof req.query.request_id === 'string' ? req.query.request_id.trim() : '';
  if (!requestId || requestId.length > 150) return res.status(400).json({error:'Enter a valid LonerPay reference'});

  const readLedger = async (filters) => {
   const query = new URLSearchParams({...filters, limit:'1'});
   const response = await fetch(auth.supabaseUrl+'/rest/v1/wallet_transactions?'+query,{
    headers:{apikey:auth.secretKey,Authorization:'Bearer '+auth.secretKey},
    signal:AbortSignal.timeout(8000)
   });
   if (!response.ok) throw Error('Cannot load wallet records');
   const [row] = await response.json();
   return row;
  };

  const purchase = await readLedger({
   select:'user_id,request_id,status,service,amount,details,created_at',
   request_id:'eq.'+requestId,transaction_type:'eq.debit'
  });
  if (!purchase) return res.status(404).json({error:'No purchase found for that LonerPay reference'});

  const refund = await readLedger({
   select:'status,amount,created_at',user_id:'eq.'+purchase.user_id,
   request_id:'eq.'+requestId+':refund',transaction_type:'eq.refund'
  });
  const details = purchase.details || {};
  return res.status(200).json({purchase:{
   request_id:purchase.request_id,
   service:purchase.service,
   amount:purchase.amount,
   created_at:purchase.created_at,
   status:purchase.status,
   wallet_debited:typeof details.wallet_debited === 'boolean' ? details.wallet_debited : null,
   provider:details.provider,
   provider_status:details.provider_status,
   provider_reference:details.provider_reference,
   last_checked_at:details.last_checked_at,
   refund:refund || null
  }});
 }
 const request=String(req.body?.request_id||'').trim(),reference=String(req.body?.provider_reference||'').trim(),note=String(req.body?.note||'').trim();
 if(req.method==='POST'&&(!request||request.length>150||reference.length>150||!note||note.length>500))return res.status(400).json({error:'Purchase reference and review note required'});
 const q=new URLSearchParams({select:'user_id,request_id,status,service,amount,details,created_at',transaction_type:'eq.debit',status:'eq.pending','details->>provider':'eq.pairgate',request_id:req.method==='POST'?'eq.'+request:'not.like.bulk-*',order:'created_at.asc',limit:req.method==='POST'?'1':'50'});
 const r=await fetch(auth.supabaseUrl+'/rest/v1/wallet_transactions?'+q,{headers:{apikey:auth.secretKey,Authorization:'Bearer '+auth.secretKey},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error('Cannot load purchases');const rows=await r.json();
 if(req.method==='GET')return res.status(200).json({records:rows});
 if(!rows[0])return res.status(404).json({error:'Pending purchase not found'});
 const result=await reconcilePurchase(rows[0],{reference,note,actor:auth.user.id});
 return res.status(result.resolved?200:202).json(result);
 }catch(error){return res.status(502).json({error:error.message||'Review unavailable'});}
}
