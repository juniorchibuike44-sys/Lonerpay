import {hardenResponse,enforceRateLimit,requireUser} from './_security.js';
import {checkoutDataPlan} from './_catalogue.js';
import {uuid,resellerDb,recipients} from './_resellers.js';
export default async function handler(req,res){
 hardenResponse(res);if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'bulk-orders',limit:40}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 try{
  if(req.method==='POST'){
   const b=req.body||{};if(!uuid(b.offer_id)||!uuid(b.client_key))return res.status(400).json({error:'Invalid order'});
   recipients(b.recipients);
   // Return an already-created batch even if the offer has since changed.
   const old=await resellerDb(auth,'lp_bulk_batches?user_id=eq.'+auth.user.id+'&client_key=eq.'+b.client_key+'&select=id');
   if(old.length)return res.status(200).json({batch_id:old[0].id});
   const offers=await resellerDb(auth,'lp_reseller_offers?id=eq.'+b.offer_id+'&active=eq.true');const offer=offers[0];
   if(!offer)return res.status(409).json({error:'Offer unavailable'});
   const plan=await checkoutDataPlan(offer.network,offer.plan_code);
   const cost=Number(plan?.price||plan?.amount);
   if(!plan||cost!==Number(offer.provider_cost)||cost+Number(offer.fee_reserve)+Number(offer.minimum_margin)>Number(offer.price))return res.status(409).json({error:'Provider price changed. The owner must refresh this offer.'});
   const id=await resellerDb(auth,'rpc/lp_bulk_create',{method:'POST',body:JSON.stringify({p_user:auth.user.id,p_offer:b.offer_id,p_key:b.client_key,p_recipients:b.recipients})});
   return res.status(201).json({batch_id:id});
  }
  const id=req.query?.id;if(id!==undefined&&!uuid(id))return res.status(400).json({error:'Invalid batch'});
  const batches=await resellerDb(auth,'lp_bulk_batches?user_id=eq.'+auth.user.id+(id?'&id=eq.'+id:'')+'&order=created_at.desc&limit=20');
  const result=[];
  for(const batch of batches){
   const items=await resellerDb(auth,'lp_bulk_items?batch_id=eq.'+batch.id+'&select=*');
   const requests=items.map(i=>i.request_id);
   const tx=requests.length?await resellerDb(auth,'wallet_transactions?user_id=eq.'+auth.user.id+'&request_id=in.('+requests.join(',')+')&select=request_id,status,details'):[];
   result.push({...batch,items:items.map(i=>{const t=tx.find(t=>t.request_id===i.request_id);return{id:i.id,recipient:i.recipient,price:i.price,network:i.network,plan_code:i.plan_code,request_id:i.request_id,state:i.state,status:i.state==='queued'?'queued':i.state==='not_charged'?'not_charged':t?.status==='refunded'?'refunded':t?.status==='successful'&&t?.details?.provider_reference&&['successful','success','completed','paid','approved'].includes(t?.details?.provider_status)?'successful':'pending'};})});
  }
  return res.status(200).json({batches:result});
 }catch(e){return res.status(400).json({error:e.message});}
}
