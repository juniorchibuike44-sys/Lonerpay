import {access,db,payload,failure} from './_notifications.js';
import {configured,validSubscription,validEndpoint} from './_push.js';
export default async function handler(req,res) {
 if(!['GET','POST','DELETE'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const a=await access(req,res);if(!a)return;
 try {
  if(req.method==='GET')return res.status(200).json({enabled:configured(),public_key:process.env.PUSH_VAPID_PUBLIC_KEY||'',user_id:a.user.id});
  if(req.headers.origin&&req.headers.origin!=='https://lonerpay.com'&&req.headers.origin!=='https://www.lonerpay.com')
   return res.status(403).json({error:'Open LonerPay to manage phone alerts.'});
  const d=payload(req);
  if(req.method==='DELETE'){
   if(!validEndpoint(d.endpoint))return res.status(400).json({error:'Invalid device'});
   await db(a,'lp_push_subscriptions?user_id=eq.'+a.user.id+'&endpoint=eq.'+encodeURIComponent(d.endpoint),{method:'DELETE'});
   return res.status(200).json({ok:true});
  }
  if(!configured())return res.status(503).json({error:'Phone alerts are not available yet.'});
  if(!validSubscription(d))return res.status(400).json({error:'Invalid device subscription'});
  const devices=(await db(a,'lp_push_subscriptions?user_id=eq.'+a.user.id+'&select=endpoint&limit=10')).data||[];
  if(devices.length>=10&&!devices.some(s=>s.endpoint===d.endpoint))return res.status(400).json({error:'Phone alerts are enabled on too many devices. Turn off an older device first.'});
  // Same browser can change accounts. A single endpoint belongs only to its current account.
  await db(a,'lp_push_subscriptions?on_conflict=endpoint',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({
   user_id:a.user.id,endpoint:d.endpoint,p256dh:d.keys.p256dh,auth:d.keys.auth,updated_at:new Date().toISOString()
  })});
  return res.status(200).json({ok:true,user_id:a.user.id});
 }catch(e){failure(res,e);}
}
