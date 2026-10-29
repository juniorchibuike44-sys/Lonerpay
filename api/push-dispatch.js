import {hardenResponse} from './_security.js';
import {cronAuthorized,deliverPush} from './_push.js';
import {db} from './_notifications.js';
export default async function handler(req,res) {
 hardenResponse(res);
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!cronAuthorized(req.headers.authorization))return res.status(401).json({error:'Unauthorized'});
 const supabaseUrl=process.env.SUPABASE_URL,secretKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!supabaseUrl||!secretKey)return res.status(503).json({error:'Push delivery unavailable'});
 try{
  let reminderDispatch='ok';
  try{await db({supabaseUrl,secretKey},'rpc/lp_bill_reminders_dispatch',{method:'POST',body:'{}'});}catch{reminderDispatch='unavailable';console.error('Bill reminder dispatch unavailable');}
  const push=await deliverPush({supabaseUrl,secretKey});return res.status(200).json({...push,reminderDispatch});
 }
 catch{return res.status(503).json({error:'Push delivery will retry'});}
}

