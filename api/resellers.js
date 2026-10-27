import {hardenResponse, enforceRateLimit, requireUser, cleanText} from './_security.js';
import {checkoutDataPlan} from './_catalogue.js';
import {bulkQuote} from './_bulk-pricing.js';
import {OWNER_EMAIL, uuid, resellerDb} from './_resellers.js';
export default async function handler(req,res) {
 hardenResponse(res); if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'resellers',limit:30}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 const owner=String(auth.user.email||'').toLowerCase()===OWNER_EMAIL;
 try {
  if(req.method==='GET') {
   const accounts=await resellerDb(auth,'lp_resellers?'+(owner?'order=created_at.desc&limit=100':'user_id=eq.'+encodeURIComponent(auth.user.id)));
   const offers=await resellerDb(auth,'lp_reseller_offers?'+(owner?'order=updated_at.desc&limit=100':'active=eq.true&select=id,network,plan_code,plan_name,price'));
   return res.status(200).json({owner,account:accounts.find(a=>a.user_id===auth.user.id)||null,accounts,offers});
  }
  const b=req.body||{};
  if(b.action==='apply') {
   const business_name=cleanText(b.business_name,120),contact=cleanText(b.contact,160);
   if(business_name.length<2||contact.length<5)return res.status(400).json({error:'Enter your business name and contact details'});
   const existing=await resellerDb(auth,'lp_resellers?user_id=eq.'+encodeURIComponent(auth.user.id));
   if(existing.length)return res.status(200).json({account:existing[0]});
   const rows=await resellerDb(auth,'lp_resellers',{method:'POST',body:JSON.stringify({user_id:auth.user.id,business_name,contact})});
   return res.status(201).json({account:rows[0]});
  }
  if(!owner)return res.status(403).json({error:'Owner access only'});
  if(b.action==='review'&&uuid(b.user_id)&&['approved','suspended','pending'].includes(b.status)) {
   const rows=await resellerDb(auth,'lp_resellers?user_id=eq.'+b.user_id,{method:'PATCH',body:JSON.stringify({status:b.status})});
   return res.status(200).json({account:rows[0]});
  }
  if(b.action==='offer') {
   if(!['mtn','airtel','glo','9mobile'].includes(b.network)||typeof b.planCode!=='string'||!b.planCode.trim()||b.planCode.length>150||typeof b.active!=='boolean')return res.status(400).json({error:'Invalid offer'});
   bulkQuote({...b,cost:1,quantity:2});
   const plan=await checkoutDataPlan(b.network,b.planCode);
   if(!plan)return res.status(409).json({error:'Plan unavailable'});
   const q=bulkQuote({...b,cost:Number(plan.price||plan.amount),quantity:2});
   if(!q.covers_costs_and_minimum_margin)return res.status(400).json({error:'The price must cover provider cost, fee reserve and minimum margin without cashback'});
   const rows=await resellerDb(auth,'lp_reseller_offers?on_conflict=network,plan_code',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({network:b.network,plan_code:b.planCode,plan_name:String(plan.name||plan.plan_name||plan.plan||b.planCode).slice(0,200),provider_cost:q.unit_cost,price:q.unit_price,fee_reserve:q.unit_fee_reserve,minimum_margin:q.unit_minimum_margin,estimated_cashback_percent:q.estimated_cashback_percent,active:b.active,updated_at:new Date().toISOString()})});
   return res.status(200).json({offer:rows[0]});
  }
  return res.status(400).json({error:'Invalid action'});
 }catch(e){return res.status(400).json({error:e.message});}
}
