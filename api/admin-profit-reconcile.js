import {requireUser,hardenResponse,enforceSharedRateLimit} from './_security.js';
import {pairgateRequest,isPairgateSuccessfulStatus,pairgateStatus} from './_pairgate.js';
import {pairgateAccounting,savePairgateCost} from './_provider-accounting.js';
export default async function handler(req,res){
 hardenResponse(res);if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!await enforceSharedRateLimit(req,res,{key:'profit-reconcile',limit:15,windowMs:60000}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 if(String(auth.user.email||'').trim().toLowerCase()!=='juniorchibuike44@gmail.com')return res.status(403).json({error:'Owner access only'});
 const cursor=req.method==='POST'?req.body?.after:null;
 if(cursor!=null&&(typeof cursor!=='string'||cursor.length>150))return res.status(400).json({error:'Invalid cursor'});
 async function review(after){const r=await fetch(auth.supabaseUrl+'/rest/v1/rpc/lp_profit_candidates',{method:'POST',headers:{apikey:auth.secretKey,Authorization:'Bearer '+auth.secretKey,'Content-Type':'application/json'},body:JSON.stringify({p_after:after||null}),cache:'no-store',signal:AbortSignal.timeout(8000)});const d=await r.json();if(!r.ok)throw Error('Run supabase/profit-accounting.sql to enable cost reconciliation.');return d;}
 try{
  const before=await review(cursor);if(req.method==='GET')return res.status(200).json(before);
  const results=[];
  // Only GET provider status. No purchase, refund or wallet adjustment is made here.
  await Promise.all((before.candidates||[]).map(async row=>{
   try{
    const r=await pairgateRequest('/transaction/status?reference_code='+encodeURIComponent(row.provider_reference),{method:'GET',signal:AbortSignal.timeout(5000)});
    const d=r.data?.data;
    if(!r.response.ok||!isPairgateSuccessfulStatus(pairgateStatus(r.data)))throw Error('Provider has not confirmed success');
    if(d?.reference_code!==row.provider_reference)throw Error('Provider reference mismatch');
    if(row.recipient&&d.recipient&&String(row.recipient).replace(/\D/g,'').replace(/^234/,'0')!==String(d.recipient).replace(/\D/g,'').replace(/^234/,'0'))throw Error('Recipient mismatch');
    const facts=pairgateAccounting(r.data,row.amount);if(!facts)throw Error('Provider cost is unavailable');
    const saved=await savePairgateCost({base:auth.supabaseUrl,key:auth.secretKey,requestId:row.request_id,providerReference:row.provider_reference,facts});
    results.push({reference:row.request_id,saved:saved.saved===true,cost:saved.saved?facts.provider_cost:null,reason:saved.saved?'Cost recorded':saved.reason});
   }catch(e){results.push({reference:row.request_id,saved:false,reason:e.message==='Provider cost could not be saved'?'Cost save failed':String(e.message).slice(0,120)});}
  }));
  results.sort((a,b)=>a.reference.localeCompare(b.reference));
  const after=before.candidates?.at(-1)?.request_id||null;
  return res.status(200).json({results,next_after:after,finished:!after,review:await review(after)});
 }catch(e){return res.status(503).json({error:e.message});}
}
