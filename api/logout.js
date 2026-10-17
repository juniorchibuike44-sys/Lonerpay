import {hardenResponse,requireUser,enforceRateLimit} from './_security.js';
export default async function handler(req,res){
 hardenResponse(res);if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'logout',limit:30,windowMs:60000}))return;
 try{const a=await requireUser(req,res);if(!a)return;
 const r=await fetch(a.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:a.secretKey,Authorization:a.authorization},signal:AbortSignal.timeout(8000)});
 return res.status(r.ok?200:503).json({revoked:r.ok});
 }catch{return res.status(503).json({error:'Session revocation could not be confirmed.'});}
}
