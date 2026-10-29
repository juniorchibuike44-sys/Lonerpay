import {access,db,uuid,payload,failure} from './_notifications.js';
export default async function handler(req,res){
 if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const a=await access(req,res);if(!a)return;
 const scope='user_id=eq.'+encodeURIComponent(a.user.id);
 try{
  if(req.method==='GET'){
   const r=await db(a,'lp_bill_reminders?'+scope+'&select=id,service,due_at,state,created_at&order=due_at.asc&limit=100');
   return res.status(200).json({reminders:r.data});
  }
  const d=payload(req);
  if(req.method==='DELETE'){
   if(!uuid(d.id))return res.status(400).json({error:'Choose a reminder'});
   const r=await db(a,'lp_bill_reminders?'+scope+'&id=eq.'+encodeURIComponent(d.id)+'&state=eq.scheduled',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({state:'cancelled'})});
   return res.status(200).json({cancelled:!!r.data?.length});
  }
  const when=Date.parse(d.due_at),now=Date.now();
  if(!['data','airtime','electricity','tv'].includes(d.service)||!Number.isFinite(when)||when<now+60000||when>now+366*86400000)return res.status(400).json({error:'Choose a service and a reminder time within the next year.'});
  const r=await db(a,'lp_bill_reminders',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:a.user.id,service:d.service,due_at:new Date(when).toISOString()})});
  return res.status(201).json({reminder:r.data?.[0]});
 }catch(e){return failure(res,e);}
}
