import { requireUser,hardenResponse,enforceRateLimit } from './_security.js';
export async function access(req,res,owner=false){
 hardenResponse(res);if(!enforceRateLimit(req,res,{key:owner?'admin-notifications':'notifications',limit:120,windowMs:60000}))return null;
 const a=await requireUser(req,res);if(!a)return null;
 if(owner&&String(a.user.email||'').trim().toLowerCase()!=='juniorchibuike44@gmail.com'){res.status(403).json({error:'Owner access only'});return null;}return a;
}
export async function db(a,path,options={}){
 const r=await fetch(a.supabaseUrl+'/rest/v1/'+path,{...options,headers:{apikey:a.secretKey,Authorization:'Bearer '+a.secretKey,'Content-Type':'application/json',...options.headers},cache:'no-store'});
 const raw=await r.text();let d;try{d=JSON.parse(raw);}catch{d=null;}
 if(!r.ok){const e=Error(['42P01','PGRST202','PGRST205'].includes(d?.code)?'Notifications need database setup. Run supabase/notifications.sql.':'Could not update notifications.');e.status=503;throw e;}return {data:d,response:r};
}
export function uuid(x){return typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);}
export function payload(req){const d=typeof req.body==='string'?JSON.parse(req.body):req.body||{};return d;}
export function failure(res,e){res.status(e.status||500).json({error:e.status?e.message:'Notifications could not be processed. Please try again.'});}
