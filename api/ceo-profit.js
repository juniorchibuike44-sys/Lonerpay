import {refundEntries,earningsCoverage} from './_earnings-report.js';
import { enforceRateLimit, hardenResponse, requireUser } from "./_security.js";
import { pairgateRequest } from "./_pairgate.js";
import { completeFinanceDetails } from "./_admin-finance-details.js";

const CEO_EMAIL = "juniorchibuike44@gmail.com";
const money = value => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null);
function dayKey(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function providerName(row) { const explicit = String(row?.details?.provider || "").trim().toLowerCase(); if (explicit) return explicit === "vtpass" ? "VTpass" : explicit[0].toUpperCase() + explicit.slice(1); const service = String(row?.service || "").toLowerCase(); if (service.includes("paystack") || service === "bank_transfer") return "Paystack"; if (service.includes("bet")) return "Pairgate"; return "Other"; }
function serviceName(value) { const service = String(value || "Transaction").toLowerCase(); const names = { mtn:"MTN Airtime",airtel:"Airtel Airtime",glo:"Glo Airtime",etisalat:"9mobile Airtime","9mobile":"9mobile Airtime","paystack_wallet_funding":"Wallet Funding","bank_transfer":"Bank Transfer","bet-funding":"Bet Funding" }; return names[service] || service.replace(/[-_]/g," ").replace(/\b\w/g,char=>char.toUpperCase()); }

async function transactionRows(auth) {
  const query = new URLSearchParams({ select:"user_id,request_id,transaction_type,service,amount,status,details,created_at", order:"created_at.desc", limit:"2000" });
  let response = await fetch(`${auth.supabaseUrl}/rest/v1/wallet_transactions?${query}`, { headers:{ apikey:auth.secretKey, Authorization:`Bearer ${auth.secretKey}`, Accept:"application/json" }, cache:"no-store" });
  let rows = await response.json().catch(()=>[]); let scope="company";
  if (!response.ok) { response = await fetch(`${auth.supabaseUrl}/rest/v1/wallet_transactions?${query}`, { headers:{ apikey:auth.secretKey, Authorization:auth.authorization, Accept:"application/json" }, cache:"no-store" }); rows = await response.json().catch(()=>[]); scope="founder_account"; }
  if (!response.ok) throw new Error(rows?.message || rows?.error || "Supabase rejected the report query");
  return { rows:Array.isArray(rows)?rows:[], scope };
}

async function providerBalances() {
  let pairgate=null,paystack=null;
  try { const result=await pairgateRequest("/wallet/balance",{method:"GET"}); pairgate=money(result.data?.data?.balance??result.data?.balance); } catch {}
  try { const key=process.env.PAYSTACK_SECRET_KEY; if(key){ const response=await fetch("https://api.paystack.co/balance",{headers:{Authorization:`Bearer ${key}`},cache:"no-store"}); const data=await response.json().catch(()=>({})); const balances=Array.isArray(data?.data)?data.data:[]; paystack=money(balances.filter(item=>String(item.currency).toUpperCase()==="NGN").reduce((sum,item)=>sum+Number(item.balance||0)/100,0)); } } catch {}
  return {pairgate,paystack};
}

async function companyFinances(auth) {
  try {
    // Prefer a distinctly named RPC so older saved SQL cannot silently pass as the new schema.
    const versioned = await fetch(`${auth.supabaseUrl}/rest/v1/rpc/lp_admin_finances_v3`, {
      method:'POST',headers:{apikey:auth.secretKey,Authorization:`Bearer ${auth.secretKey}`,'Content-Type':'application/json'},
      body:'{}',cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    const current=await versioned.json();
    if(versioned.ok && current?.scope==='company' && Number(current.schema_version)===3 && Array.isArray(current.balance_breakdown) && Array.isArray(current.last_purchases))return {data:current,error:null};
    const response = await fetch(`${auth.supabaseUrl}/rest/v1/rpc/lp_admin_finances`, {
      method: 'POST', headers: {apikey: auth.secretKey, Authorization: `Bearer ${auth.secretKey}`, 'Content-Type':'application/json'},
      body: '{}', cache: 'no-store', signal: AbortSignal.timeout(15000)
    });
    const data = await response.json();
    if (!response.ok || data?.scope !== 'company') throw Error('Finance report unavailable');
    return {data:await completeFinanceDetails(auth,data), error:null};
  } catch {
    return {data:null, error:'Company totals are unavailable. Run supabase/admin-finances.sql and check the server credential permissions. No customer balance or profit has been estimated.'};
  }
}

export default async function handler(req,res){
  hardenResponse(res); if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"}); if(!enforceRateLimit(req,res,{key:"ceo-profit",limit:30,windowMs:60_000}))return;
  const auth=await requireUser(req,res); if(!auth)return; if(String(auth.user.email||"").trim().toLowerCase()!==CEO_EMAIL)return res.status(403).json({error:"CEO access only"});
  const requestedDays=Number(req.query?.days||30);const days=Number.isFinite(requestedDays)?Math.min(90,Math.max(1,Math.floor(requestedDays))):30,since=Date.now()-days*86_400_000;
  try{
    const [{rows,scope},balances,finance]=await Promise.all([transactionRows(auth),providerBalances(),companyFinances(auth)]);
    const activity=rows.filter(row=>Date.parse(row.created_at||"")>=since).map(row=>{const amount=money(row.amount)??0,providerCost=money(row.details?.provider_cost),grossProfit=money(row.details?.gross_profit??(providerCost===null?null:amount-providerCost));return{reference:row.request_id,transaction_type:String(row.transaction_type||"").toLowerCase(),service:serviceName(row.service),provider:providerName(row),amount,status:String(row.status||"unknown").toLowerCase(),provider_cost:providerCost,gross_profit:grossProfit,date:row.created_at};});
    const credits=activity.filter(x=>x.transaction_type==="credit"&&x.status==="successful"),debits=activity.filter(x=>x.transaction_type==="debit"&&x.status==="successful"),refundRows=refundEntries(activity),priced=debits.filter(x=>x.gross_profit!==null);
    const totals={active_users:new Set(rows.filter(row=>Date.parse(row.created_at||"")>=since && row.user_id).map(row=>row.user_id)).size,activity:activity.length,wallet_inflows:money(credits.reduce((s,x)=>s+x.amount,0)),service_sales:money(debits.reduce((s,x)=>s+x.amount,0)),refunds:money(refundRows.reduce((s,x)=>s+x.amount,0)),gross_profit:money(priced.reduce((s,x)=>s+x.gross_profit,0)),pending:activity.filter(x=>x.status==="pending").length,failed:activity.filter(x=>x.status==="failed").length,unpriced_sales:debits.length-priced.length};
    const returned=new Set(refundRows.map(x=>x.reference));
    const groups=new Map(); for(const x of activity){const g=groups.get(x.provider)||{provider:x.provider,transactions:0,volume:0,profit:0,pending:0,refunds:0};g.transactions++;g.volume+=x.amount;if(x.gross_profit!==null&&x.status==="successful")g.profit+=x.gross_profit;if(x.status==="pending")g.pending++;if(returned.has(x.reference))g.refunds+=x.amount;groups.set(x.provider,g);}
    const dailyMap=new Map(); for(const x of activity){const key=dayKey(x.date),d=dailyMap.get(key)||{date:key,transactions:0,inflows:0,sales:0,refunds:0,profit:0};d.transactions++;if(x.status==="successful"&&x.transaction_type==="credit")d.inflows+=x.amount;if(x.status==="successful"&&x.transaction_type==="debit")d.sales+=x.amount;if(returned.has(x.reference))d.refunds+=x.amount;if(x.status==="successful"&&x.gross_profit!==null)d.profit+=x.gross_profit;dailyMap.set(key,d);}
    return res.status(200).json({finances:finance.data,finance_error:finance.error,earnings_coverage:earningsCoverage(finance.data),period_days:days,report_scope:scope,generated_at:new Date().toISOString(),provider_balances:balances,totals,providers:[...groups.values()].map(g=>({...g,volume:money(g.volume),profit:money(g.profit),refunds:money(g.refunds)})).sort((a,b)=>b.volume-a.volume),daily:[...dailyMap.values()].map(d=>({...d,inflows:money(d.inflows),sales:money(d.sales),refunds:money(d.refunds),profit:money(d.profit)})).sort((a,b)=>b.date.localeCompare(a.date)),transactions:activity.slice(0,100)});
  }catch(error){return res.status(502).json({error:"Could not load business activity",message:error.message});}
}


