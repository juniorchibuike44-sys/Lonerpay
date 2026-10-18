import {requireUser,hardenResponse,enforceRateLimit} from './_security.js';
export const validId=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
function field(x,max,required=false){if(typeof x!=='string'||x.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x)||(required&&!x.trim()))throw Error('Check the text fields.');return x.trim();}
function integer(x,min,max){if(!Number.isSafeInteger(x)||x<min||x>max)throw Error('Check quantities and amounts.');return x;}
function boolean(x){if(typeof x!=='boolean')throw Error('Check the selected settings.');return x;}
export function validateProduct(d){if(!validId(d.id))throw Error('Invalid product reference.');return {p_id:d.id,p_version:integer(d.version,0,2147483646),p_name:field(d.name,120,true),p_sku:field(d.sku||'',60),p_description:field(d.description||'',600),p_price:integer(d.price_kobo,1,9999999999),p_low:integer(d.low_stock,0,1000000),p_published:boolean(d.published),p_active:boolean(d.active),p_opening:integer(d.opening_quantity??0,0,1000000)};}
export function validateStore(d){const phone=field(d.whatsapp,20,true).replace(/[+\s()-]/g,'');if(!/^[1-9][0-9]{7,14}$/.test(phone))throw Error('Enter your WhatsApp number with country code, for example 2348012345678.');return {p_version:integer(d.version,0,2147483646),p_name:field(d.name,120,true),p_whatsapp:phone,p_description:field(d.description||'',600),p_published:boolean(d.published)};}
export function validateRange(from,to){const valid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;if(!valid(from)||!valid(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>366)throw Error('Choose a valid date range of up to 367 days.');return {p_from:from,p_to:to};}
export function publicCatalogue(store,products){return {store:{name:store.name,description:store.description,whatsapp:store.whatsapp},products:products.map(p=>({id:p.id,name:p.name,description:p.description,price_kobo:p.price_kobo,available:p.quantity>0,image_url:p.image_path?'/api/business-product-photo?id='+encodeURIComponent(p.id)+'&v='+encodeURIComponent(p.version||1):''}))};}
export default async function handler(req,res){
 hardenResponse(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'business-growth',limit:90,windowMs:60000}))return;
 let a;
 try{
 const publicRead=req.method==='GET'&&req.query?.view==='catalogue';
 if(publicRead){a={supabaseUrl:process.env.SUPABASE_URL,secretKey:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY};if(!a.supabaseUrl||!a.secretKey)return res.status(503).json({error:'Store is unavailable. Please try again.'});}
 else{a=await requireUser(req,res);if(!a)return;}
 async function db(path,method='GET',body){const response=await fetch(a.supabaseUrl+'/rest/v1/'+path,{method,headers:{apikey:a.secretKey,Authorization:'Bearer '+a.secretKey,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok){const missing=['PGRST202','PGRST205','42P01'].includes(data?.code);const e=Error(missing?'New Business Tools needs database setup. Run supabase/business-growth.sql.':data?.code==='P0001'?String(data.message).slice(0,180):'Could not save business records. Please refresh and try again.');e.status=missing?503:data?.code==='P0001'?409:503;throw e;}return data;}
 if(publicRead){const id=req.query?.id;if(!validId(id))return res.status(404).json({error:'Store not found'});const stores=await db('lp_business_stores?user_id=eq.'+id+'&published=eq.true&select=name,description,whatsapp&limit=1');if(!stores.length)return res.status(404).json({error:'This store is not published.'});const products=await db('lp_business_products?user_id=eq.'+id+'&published=eq.true&active=eq.true&select=*&order=name.asc,id.asc&limit=500');return res.status(200).json(publicCatalogue(stores[0],products));}
 if(req.method==='GET'){
  if(req.query?.view==='report'){let range;try{range=validateRange(req.query.from,req.query.to);}catch(e){return res.status(400).json({error:e.message});}return res.status(200).json({report:await db('rpc/lp_business_report','POST',{p_owner:a.user.id,...range})});}
  const [products,stores,moves]=await Promise.all([db('lp_business_products?user_id=eq.'+a.user.id+'&order=created_at.desc,id.asc&limit=500'),db('lp_business_stores?user_id=eq.'+a.user.id+'&limit=1'),db('lp_business_stock_moves?user_id=eq.'+a.user.id+'&order=created_at.desc,id.desc&limit=50')]);await attachPrivatePhotos(products,a);return res.status(200).json({products,store:stores[0]||null,movements:moves,store_id:a.user.id});
 }
 let d;try{d=typeof req.body==='string'?JSON.parse(req.body):req.body||{};}catch{return res.status(400).json({error:'Invalid request'});}
 let p;try{
  if(d.action==='product')p=validateProduct(d);
  else if(d.action==='store')p=validateStore(d);
  else if(d.action==='adjust'){if(!validId(d.id)||!validId(d.movement_id))throw Error('Invalid stock reference.');p={p_id:d.id,p_move:d.movement_id,p_delta:integer(d.delta,-1000000,1000000),p_reason:field(d.reason,200,true)};if(!p.p_delta)throw Error('Enter a stock change greater than zero.');}
  else throw Error('Unknown action');
 }catch(e){return res.status(400).json({error:e.message});}
 const rpc={product:'lp_business_product_save',store:'lp_business_store_save',adjust:'lp_business_stock_adjust'}[d.action];const result=await db('rpc/'+rpc,'POST',{p_owner:a.user.id,...p});return res.status(200).json({[d.action==='store'?'store':'product']:result});
 }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Business Tools is unavailable. Please try again.'});}
}


export async function attachPrivatePhotos(products,a){
 const paths=products.filter(p=>typeof p.image_path==='string'&&p.image_path.startsWith(a.user.id+'/'+p.id+'/')&&/^[a-f0-9/-]+\.jpg$/i.test(p.image_path)).map(p=>p.image_path);
 products.forEach(p=>p.image_url='');if(!paths.length)return;
 try{
 const r=await fetch(a.supabaseUrl+'/storage/v1/object/sign/business-products',{method:'POST',headers:{apikey:a.secretKey,Authorization:'Bearer '+a.secretKey,'Content-Type':'application/json'},body:JSON.stringify({paths,expiresIn:3600}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)return;const signed=await r.json();if(!Array.isArray(signed))return;
 for(const p of products){const item=signed.find(x=>x.path===p.image_path&&!x.error);if(!item?.signedURL)continue;const url=new URL(a.supabaseUrl+'/storage/v1'+item.signedURL);if(url.origin===new URL(a.supabaseUrl).origin&&url.pathname.startsWith('/storage/v1/object/sign/business-products/'))p.image_url=url.href;}
 }catch{}
}
