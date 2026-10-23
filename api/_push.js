import webpush from 'web-push';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {db} from './_notifications.js';

// Push endpoints are client input: allow only known public push services.
export function validEndpoint(value) {
 try {
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&value.length<=2048&&
   (['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)||u.hostname.endsWith('.notify.windows.com'));
 } catch {return false;}
}
export function validSubscription(s) {
 if(!s||!validEndpoint(s.endpoint))return false;
 const decode=(x,n)=>typeof x==='string'&&/^[A-Za-z0-9_-]+$/.test(x)&&Buffer.from(x,'base64url').length===n;
 return decode(s.keys?.p256dh,65)&&decode(s.keys?.auth,16);
}
export function configured(){return !!(process.env.PUSH_VAPID_PUBLIC_KEY&&process.env.PUSH_VAPID_PRIVATE_KEY);}
export function cronAuthorized(header) {
 const expected=process.env.CRON_SECRET;
 if(!expected||typeof header!=='string')return false;
 const a=Buffer.from(header),b=Buffer.from('Bearer '+expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function deliverPush(a,{send=webpush.sendNotification.bind(webpush)}={}) {
 if(!configured())return {configured:false,accepted:0};
 const claim=randomUUID(),jobs=(await db(a,'rpc/lp_push_claim',{method:'POST',body:JSON.stringify({p_claim:claim})})).data||[];
 let accepted=0;
 await Promise.all(jobs.map(async job=>{
  const scope='id=eq.'+job.id+'&claim_token=eq.'+claim;
  const [sub,notice]=await Promise.all([
   db(a,'lp_push_subscriptions?id=eq.'+job.subscription_id+'&user_id=eq.'+job.user_id+'&select=endpoint,p256dh,auth&limit=1'),
   db(a,'lp_notifications?id=eq.'+job.notification_id+'&user_id=eq.'+job.user_id+'&select=id,title,body,funding_transaction_id&limit=1')
  ]);
  let state='expired',available_at=new Date(Date.now()+60000*2**job.attempts).toISOString();
  const s=sub.data?.[0],n=notice.data?.[0];
  if(s&&n&&validEndpoint(s.endpoint)) {
   try{
    await send({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({
     id:n.id,owner:job.user_id,title:n.title,body:n.body,transaction:n.funding_transaction_id
    }),{TTL:3600,urgency:'high',topic:n.id.replaceAll('-',''),timeout:8000,
     vapidDetails:{subject:'https://lonerpay.com',publicKey:process.env.PUSH_VAPID_PUBLIC_KEY,privateKey:process.env.PUSH_VAPID_PRIVATE_KEY}});
    state='accepted';accepted++;
   }catch(e){
    if([404,410].includes(e.statusCode)) {
     await db(a,'lp_push_subscriptions?id=eq.'+job.subscription_id+'&user_id=eq.'+job.user_id,{method:'DELETE'});
     return;
    }
    state=job.attempts>=5?'failed':'queued';
   }
  }
  await db(a,'lp_push_jobs?'+scope,{method:'PATCH',body:JSON.stringify({state,available_at,lease_until:null})});
 }));
 return {configured:true,accepted,processed:jobs.length};
}
