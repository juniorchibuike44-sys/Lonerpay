import {requireBusiness,businessAccess} from './_business-subscription.js';
import {requireUser,hardenResponse,enforceRateLimit} from './_security.js';
export default async function handler(req,res){
 hardenResponse(res);if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'voice-receipt',limit:40,windowMs:60000}))return;
 const a=await requireUser(req,res);if(!a)return;if(!await requireBusiness(a,res))return;
 const reference=String(req.query?.reference||'');if(!reference||reference.length>150||/[\u0000-\u001f]/.test(reference))return res.status(400).json({error:'A transaction reference is required.'});
 try{const q=new URLSearchParams({user_id:'eq.'+a.user.id,request_id:'eq.'+reference,select:'request_id,service,amount,status,created_at',limit:'1'});const r=await fetch(a.supabaseUrl+'/rest/v1/wallet_transactions?'+q,{headers:{apikey:a.secretKey,Authorization:a.authorization},cache:'no-store'});if(!r.ok){console.warn('Voice receipt lookup failed',{status:r.status});throw Error();}const rows=await r.json();if(!rows.length)return res.status(404).json({error:'This receipt could not be verified. Open a saved transaction from your history.'});const t=rows[0];return res.status(200).json({transaction:t});}catch{return res.status(503).json({error:'Could not verify this receipt right now.'});}
}

