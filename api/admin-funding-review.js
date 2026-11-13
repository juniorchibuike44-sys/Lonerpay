import {hardenResponse,requireUser,enforceSharedRateLimit} from './_security.js';
import {monnifyDb} from './_monnify.js';
export default async function handler(req,res){
 hardenResponse(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!await enforceSharedRateLimit(req,res,{key:'funding-review',limit:20}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 if(String(auth.user.email||'').toLowerCase()!=='juniorchibuike44@gmail.com')return res.status(403).json({error:'Owner access only'});
 try{
  if(req.method==='GET'){
   const [reviews,pending,recent]=await Promise.all([
    monnifyDb('lp_monnify_reviews?state=eq.open&order=created_at.asc&limit=50&select=reference,user_id,reason,created_at'),
    monnifyDb('lp_monnify_inbox?state=eq.pending&order=created_at.asc&limit=50&select=reference,event_type,last_error,created_at'),
    monnifyDb('lp_monnify_inbox?state=eq.credited&order=checked_at.desc&limit=10&select=reference,verified,checked_at')
   ]);
   return res.status(200).json({reviews,pending,recent});
  }
  const reference=String(req.body?.reference||''),note=String(req.body?.note||'').trim();
  if(req.body?.funds_reconciled!==true||!reference||reference.length>200||note.length<20||note.length>1000)return res.status(400).json({error:'Confirm funds are reconciled and provide a review note of 20–1000 characters.'});
  const resolved=await monnifyDb('rpc/lp_monnify_resolve_review','POST',{p_reference:reference,p_actor:auth.user.id,p_note:note});
  return res.status(200).json({resolved:resolved===true,message:'Review recorded. No wallet balance was changed.'});
 }catch{return res.status(503).json({error:'Funding review is temporarily unavailable'});}
}
