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
 }else if(section==="kyc"||section==="merchants"){
 const q=new URLSearchParams({select:"user_id,account_reference,status,accounts,created_at",mode:"eq.live",order:"created_at.desc",limit:"50",offset:String((page-1)*50)});
 const data=await get(auth.supabaseUrl+"/rest/v1/lp_monnify_accounts?"+q);
 const accounts=Array.isArray(data)?data:[];has_more=accounts.length===50;mode="live";
 records=accounts.flatMap(row=>(Array.isArray(row.accounts)?row.accounts:[]).slice(0,1).map(account=>section==="kyc"?{
  customer_email:"User "+String(row.user_id).slice(0,8),account_name:account.account_name||"",assignment_status:row.status,bank_name:account.bank_name||""
 }:{reference:row.account_reference,name:account.account_name||"",bank:account.bank_name||"",status:String(row.status||"").toLowerCase(),currency:"NGN"}));
 }else if(section==="settlements"){
 const from=new Date(Date.now()-days*86400000).toISOString();
 const q=new URLSearchParams({select:"reference,state,verified,created_at",event_type:"eq.SUCCESSFUL_TRANSACTION",state:"eq.credited",created_at:"gte."+from,order:"created_at.desc",limit:"50",offset:String((page-1)*50)});
 const data=await get(auth.supabaseUrl+"/rest/v1/lp_monnify_inbox?"+q);
 const rows=Array.isArray(data)?data:[];has_more=rows.length===50;mode="live";
 records=rows.map(row=>({reference:row.reference,amount:Number(row.verified?.amount||0),effective_amount:row.verified?.provider_net_amount==null?null:Number(row.verified.provider_net_amount),status:row.state,currency:"NGN",date:row.created_at}));
 }else if(section==="payouts"){
 records=[];has_more=false;mode="disabled";
 }
 return res.status(200).json({section,records,page,total,has_more,mode,source:section==="merchants"?"Monnify dedicated accounts":section==="kyc"?"Monnify account verification":section==="users"?"Supabase customers":section==="settlements"?"Monnify verified funding":"Outbound payouts disabled"});
 }catch{return res.status(502).json({error:"Unable to load this section. Check the server credential permissions and provider availability."});}
}

