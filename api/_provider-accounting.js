const number=v=>v===null||v===undefined||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Math.round(Number(v)*100)/100:null;
export function pairgateAccounting(payload,saleAmount){
 const d=payload?.data&&typeof payload.data==='object'?payload.data:payload||{};
 if(d.test_mode===true||payload?.test_mode===true)return null;
 const before=number(d.balance_before),after=number(d.balance_after);
 let cost=null,source='';
 if(before!==null&&after!==null&&before>after&&before>=0&&after>=0){cost=Math.round((before-after)*100)/100;source='pairgate_transaction_balances';}
 else if(number(d.amount)!==null&&number(d.amount)>=0){cost=number(d.amount);source='pairgate_amount_charged';}
 else if(number(d.total_amount)!==null&&number(d.total_amount)>0){cost=number(d.total_amount);source='pairgate_total_amount';}
 else if(Array.isArray(d.pins)&&d.pins.length&&d.pins.every(p=>number(p.price)!==null&&number(p.price)>=0)){cost=Math.round(d.pins.reduce((s,p)=>s+number(p.price),0)*100)/100;source='pairgate_pin_prices';}
 if(cost===null)return null;
 const sale=number(saleAmount);
 return {provider_cost:cost,cost_source:source,cost_recorded_at:new Date().toISOString(),...(sale!==null?{gross_profit:Math.round((sale-cost)*100)/100}:{}),...(typeof d.plan==='string'||typeof d.item==='string'?{plan_name:String(d.plan||d.item).slice(0,200)}:{})};
}
export async function savePairgateCost({base,key,requestId,providerReference,facts}){
 if(!facts||!providerReference)return {saved:false,reason:'no_verified_cost'};
 const r=await fetch(base+'/rest/v1/rpc/lp_profit_save_cost',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_request:requestId,p_reference:providerReference,p_cost:facts.provider_cost,p_source:facts.cost_source,p_plan:facts.plan_name||null}),cache:'no-store',signal:AbortSignal.timeout(8000)});
 const result=await r.json().catch(()=>null);if(!r.ok)throw Error('Provider cost could not be saved');return result;
}
