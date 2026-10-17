import {requireUser,hardenResponse,enforceRateLimit} from './_security.js';
const validId=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
function text(x,max,required=false){if(typeof x!=='string'||x.length>max||(required&&!x.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(x))throw Error('Check the invoice fields.');return x.trim();}
export function validateInvoice(d){
 const items=d.items;if(!Array.isArray(items)||!items.length||items.length>30)throw Error('Add between 1 and 30 items.');
 let total=0;const cleaned=items.map(i=>{if(!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>9999||!Number.isSafeInteger(i.unit_kobo)||i.unit_kobo<1||i.unit_kobo>9999999999)throw Error('Check item quantities and prices.');total+=i.quantity*i.unit_kobo;return {description:text(i.description,200,true),quantity:i.quantity,unit_kobo:i.unit_kobo};});
 if(!Number.isSafeInteger(total)||total>100000000000)throw Error('Invoice total is too large.');
 const due=d.due_date||null;if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw Error('Choose a valid due date.');
 if(!validId(d.id))throw Error('Invalid invoice reference.');return {p_invoice:d.id,p_business:text(d.business_name,120,true),p_customer:text(d.customer_name,120,true),p_contact:text(d.customer_contact||'',160),p_items:cleaned,p_due:due,p_note:text(d.note||'',1000),p_draft:d.draft===true};
}
export default async function handler(req,res){
 hardenResponse(res);if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!enforceRateLimit(req,res,{key:'business-tools',limit:100,windowMs:60000}))return;
 const a=await requireUser(req,res);if(!a)return;
 async function db(path,method='GET',body){const r=await fetch(a.supabaseUrl+'/rest/v1/'+path,{method,headers:{apikey:a.secretKey,Authorization:'Bearer '+a.secretKey,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok){const e=Error(['PGRST202','PGRST205','42P01'].includes(data?.code)?'Business Tools needs database setup. Run supabase/business-tools.sql.':data?.code==='P0001'?'Check the invoice reference, amount and status.':'Could not save business records. Please try again.');e.status=data?.code==='P0001'?400:503;throw e;}return data;}
 try{
 if(req.method==='GET'){
 const id=req.query?.id;
 if(id){if(!validId(id))return res.status(400).json({error:'Invalid invoice'});const invoices=await db('lp_business_invoices?id=eq.'+id+'&user_id=eq.'+a.user.id);if(!invoices.length)return res.status(404).json({error:'Invoice not found'});const payments=await db('lp_business_payments?invoice_id=eq.'+id+'&order=created_at.desc');return res.status(200).json({invoice:invoices[0],payments});}
 const offset=Math.max(0,Math.min(100000,Number.parseInt(req.query?.offset||'0',10)||0));
 const [invoices,summary]=await Promise.all([db('lp_business_invoices?user_id=eq.'+a.user.id+'&order=created_at.desc,id.desc&limit=51&offset='+offset),db('rpc/lp_business_summary','POST',{p_owner:a.user.id})]);return res.status(200).json({invoices:invoices.slice(0,50),has_more:invoices.length>50,summary});
 }
 const d=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(d.action==='create'){let p;try{p=validateInvoice(d);}catch(e){return res.status(400).json({error:e.message});}const invoice=await db('rpc/lp_business_create','POST',{...p,p_owner:a.user.id});return res.status(200).json({invoice});}
 if(!validId(d.id))return res.status(400).json({error:'Invalid invoice'});
 if(d.action==='issue'){const rows=await db('lp_business_invoices?id=eq.'+d.id+'&user_id=eq.'+a.user.id+'&status=eq.draft','PATCH',{status:'issued',issued_at:new Date().toISOString()});return res.status(200).json({invoice:rows[0]||null});}
 if(d.action==='payment'){if(!validId(d.payment_id)||!Number.isSafeInteger(d.amount_kobo)||d.amount_kobo<=0||d.amount_kobo>100000000000)return res.status(400).json({error:'Enter a valid repayment amount'});let note;try{note=text(d.note||'',500);}catch(e){return res.status(400).json({error:e.message});}const invoice=await db('rpc/lp_business_payment','POST',{p_owner:a.user.id,p_invoice:d.id,p_payment:d.payment_id,p_amount:d.amount_kobo,p_note:note});return res.status(200).json({invoice});}
 return res.status(400).json({error:'Unknown action'});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Business Tools could not load. Please try again.'});}
}
