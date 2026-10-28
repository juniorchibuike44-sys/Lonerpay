import {enforceSharedRateLimit,hardenResponse,requireUser} from "./_security.js";
const OWNER="juniorchibuike44@gmail.com";
export default async function handler(req,res){
 hardenResponse(res);
 if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
 if(!await enforceSharedRateLimit(req,res,{key:"admin-records",limit:30,windowMs:60000}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 if(String(auth.user.email||"").toLowerCase().trim()!==OWNER)return res.status(403).json({error:"Owner access only"});
 const section=String(req.query?.section||"users"),page=Number(req.query?.page||1),days=Number(req.query?.days||30);
 if(!["users","kyc","merchants","settlements","payouts"].includes(section)||!Number.isInteger(page)||page<1||page>10000||![7,30,90].includes(days))return res.status(400).json({error:"Invalid report request"});
 const headers={apikey:auth.secretKey,Authorization:"Bearer "+auth.secretKey};
 async function get(url,extraHeaders=headers){const r=await fetch(url,{headers:extraHeaders,cache:"no-store",signal:AbortSignal.timeout(15000)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error("The configured provider credential cannot read this section.");return data;}
 try{
 let records=[],total=null,has_more=false,mode="live";
 if(section==="users"){
 const data=await get(auth.supabaseUrl+"/auth/v1/admin/users?page="+page+"&per_page=50");
 const users=Array.isArray(data.users)?data.users:[];
 records=users.map(u=>({id:u.id,name:u.user_metadata?.full_name||u.user_metadata?.name||"",email:u.email||"",phone:u.user_metadata?.phone||u.phone||"",created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,email_verified:!!u.email_confirmed_at,support:u.app_metadata?.last_support_request?{reference:u.app_metadata.last_support_request.reference,category:u.app_metadata.last_support_request.category,status:u.app_metadata.last_support_request.status,message:u.app_metadata.last_support_request.message}:null,closure:u.app_metadata?.account_closure_request?{reference:u.app_metadata.account_closure_request.reference,status:u.app_metadata.account_closure_request.status}:null}));
 total=Number.isFinite(Number(data.total))?Number(data.total):null;has_more=users.length===50;
 }else if(section==="kyc"){
 const q=new URLSearchParams({select:"user_id,customer_email,assignment_status,bank_name,account_name",order:"user_id.asc",limit:"50",offset:String((page-1)*50)});
 const data=await get(auth.supabaseUrl+"/rest/v1/virtual_accounts?"+q);
 records=Array.isArray(data)?data:[];has_more=records.length===50;
 }else{
 const key=process.env.PAYSTACK_SECRET_KEY;if(!key)return res.status(503).json({error:"Paystack server credential is not configured."});
 mode=key.startsWith("sk_test_")?"test":"live";
 const path={merchants:"subaccount",settlements:"settlement",payouts:"transfer"}[section];
 const q=new URLSearchParams({page:String(page),perPage:"50"});
 if(section!=="merchants"){q.set("from",new Date(Date.now()-days*86400000).toISOString());q.set("to",new Date().toISOString());}
 const data=await get("https://api.paystack.co/"+path+"?"+q,{Authorization:"Bearer "+key});
 if(data.status!==true)throw Error("Paystack did not confirm this report.");
 const raw=Array.isArray(data.data)?data.data:[];total=Number.isFinite(Number(data.meta?.total))?Number(data.meta.total):null;has_more=data.meta?.pageCount?page<Number(data.meta.pageCount):raw.length===50;
 records=raw.map(x=>section==="merchants"?{reference:x.subaccount_code,name:x.business_name,bank:x.settlement_bank,status:x.active?"active":"inactive",currency:x.currency}:section==="settlements"?{reference:String(x.id),amount:Number(x.total_amount||0)/100,effective_amount:x.effective_amount==null?null:Number(x.effective_amount)/100,status:x.status,currency:x.currency,date:x.settlement_date||x.createdAt||x.created_at}: {reference:x.reference||x.transfer_code,amount:Number(x.amount||0)/100,status:x.status,currency:x.currency,date:x.createdAt||x.created_at,recipient:x.recipient?.name||""});
 }
 return res.status(200).json({section,records,page,total,has_more,mode,source:section==="merchants"?"Paystack subaccounts":section==="kyc"?"Virtual account verification":section==="users"?"Supabase customers":"Paystack"});
 }catch{return res.status(502).json({error:"Unable to load this section. Check the server credential permissions and provider availability."});}
}

