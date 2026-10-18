import {requireBusiness,businessAccess} from './_business-subscription.js';
import {requireUser,hardenResponse,enforceRateLimit} from './_security.js';
const bucket='business-products',uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
export const config={api:{bodyParser:{sizeLimit:'3mb'}}};
export function decodePhoto(value){
 if(typeof value!=='string'||value.length>2800000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value))throw Error('Choose a valid product photo.');
 const data=Buffer.from(value.slice(value.indexOf(',')+1),'base64');
 if(data.length<4||data.length>2097152||data[0]!==255||data[1]!==216||data[2]!==255||data[data.length-2]!==255||data[data.length-1]!==217)throw Error('Use a JPEG photo up to 2 MB.');
 return data;
}
const validPath=(path,owner,id)=>typeof path==='string'&&new RegExp('^'+owner+'/'+id+'/[a-f0-9-]{36}\\.jpg$','i').test(path);
export default async function handler(req,res){
 hardenResponse(res);if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'business-product-photo',limit:req.method==='GET'?180:30,windowMs:60000}))return;
 let a;
 try{
 if(req.method==='GET'){a={supabaseUrl:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY};if(!a.supabaseUrl||!a.secretKey)return res.status(503).json({error:'Photo unavailable'});}
 else{a=await requireUser(req,res);if(!a)return;if(!await requireBusiness(a,res))return;}
 const headers={apikey:a.secretKey,Authorization:'Bearer '+a.secretKey};
 async function db(path,method='GET',body){const r=await fetch(a.supabaseUrl+'/rest/v1/'+path,{method,headers:{...headers,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok){const e=Error(['PGRST202','PGRST204','42703'].includes(data?.code)?'Product photos need setup. Run supabase/business-product-photos.sql.':data?.code==='P0001'?String(data.message).slice(0,160):'Could not save product photo. Please retry.');e.status=data?.code==='P0001'?409:503;throw e;}return data;}
 if(req.method==='GET'){
  const id=req.query?.id;if(!uuid(id))return res.status(404).json({error:'Photo not found'});
  const rows=await db('lp_business_products?id=eq.'+id+'&active=eq.true&published=eq.true&select=id,user_id,image_path&limit=1');const p=rows[0];if(!p?.image_path||!validPath(p.image_path,p.user_id,p.id))return res.status(404).json({error:'Photo not found'});
  const stores=await db('lp_business_stores?user_id=eq.'+p.user_id+'&published=eq.true&select=user_id&limit=1');if(!stores.length)return res.status(404).json({error:'Photo not found'});if(!(await businessAccess(a,p.user_id)).active)return res.status(404).json({error:'Photo not found'});
  const r=await fetch(a.supabaseUrl+'/storage/v1/object/authenticated/'+bucket+'/'+p.image_path,{headers,cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)return res.status(404).json({error:'Photo not found'});
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>2097152)return res.status(503).json({error:'Photo unavailable'});
  res.setHeader('Content-Type','image/jpeg');res.setHeader('Content-Disposition','inline; filename="product.jpg"');return res.status(200).send(bytes);
 }
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'Invalid photo request'});}
 if(!uuid(d.id)||!Number.isSafeInteger(d.version)||d.version<1||!['upload','remove'].includes(d.action)||(d.action==='upload'&&!uuid(d.photo_id)))return res.status(400).json({error:'Check the product photo reference.'});
 let bytes;if(d.action==='upload'){try{bytes=decodePhoto(d.photo);}catch(e){return res.status(400).json({error:e.message});}}
 const rows=await db('lp_business_products?id=eq.'+d.id+'&user_id=eq.'+a.user.id+'&select=id,image_path,version&limit=1');const current=rows[0];if(!current)return res.status(404).json({error:'Product not found'});
 const path=d.action==='upload'?a.user.id+'/'+d.id+'/'+d.photo_id+'.jpg':null;
 if(current.version!==d.version&&current.image_path!==path)return res.status(409).json({error:'Product changed. Refresh before changing its photo.'});
 async function removeFile(path){if(!validPath(path,a.user.id,d.id))return;try{await fetch(a.supabaseUrl+'/storage/v1/object/'+bucket,{method:'DELETE',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[path]}),signal:AbortSignal.timeout(6000)});}catch{}}
 if(path){const r=await fetch(a.supabaseUrl+'/storage/v1/object/'+bucket+'/'+path,{method:'POST',headers:{...headers,'Content-Type':'image/jpeg','x-upsert':'true'},body:bytes,signal:AbortSignal.timeout(20000)});if(!r.ok)return res.status(503).json({error:'Photo upload failed. Run the photo setup script if you have not yet done so, then retry.'});}
 let product;try{product=await db('rpc/lp_business_product_photo','POST',{p_owner:a.user.id,p_id:d.id,p_version:d.version,p_path:path});}catch(e){
  // A lost RPC response may still have saved the photo; never delete an attached file.
  if(path){try{const latest=await db('lp_business_products?id=eq.'+d.id+'&user_id=eq.'+a.user.id+'&select=image_path');if(latest[0]&&latest[0].image_path!==path)await removeFile(path);}catch{}}
  throw e;
 }
 if(current.image_path&&current.image_path!==path)await removeFile(current.image_path);
 return res.status(200).json({product});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Photo service is unavailable. Please retry.'});}
}

