import {createHmac} from 'node:crypto';
import {hardenResponse,requireUser,enforceRateLimit,cleanText} from './_security.js';

// Preparation release: read-only sandbox catalogue. No live URL, debit,
// order creation, code collection or payout is reachable from this handler.
export function normalizeCards(payload){
 const rows=payload?.data?.cards;
 if(!Array.isArray(rows))throw Error('Unsupported catalogue');
 return rows.slice(0,1000).filter(p=>p&&p.sku&&p.name&&p.currency&&Number(p.denomination)>0&&p.stock_available===true)
  .map(p=>({id:cleanText(p.sku,120),name:cleanText(p.name,120),currency:cleanText(p.currency,8),value:Number(p.denomination),region:cleanText(p.region||p.country||'See brand terms',80)}));
}
export default async function handler(req,res){
 hardenResponse(res);
 if(req.method!=='GET')return res.status(405).json({error:'Gift-card purchases, sales and payouts are not active.'});
 if(!enforceRateLimit(req,res,{key:'giftcard-catalogue',limit:20,windowMs:60000}))return;
 try{
  if(!await requireUser(req,res))return;
  const key=process.env.PRESTMIT_SANDBOX_API_KEY,secret=process.env.PRESTMIT_SANDBOX_API_SECRET;
  if(process.env.PRESTMIT_SANDBOX_CATALOGUE!=='true'||!key||!secret)return res.status(200).json({mode:'preview',checkoutEnabled:false,cards:[]});
  const hash=createHmac('sha256',secret).update(key+':{}').digest('hex');
  const response=await fetch('https://dev-api.prestmit.io/partners/v1/giftcard-trade/buy/config',{
   headers:{'API-KEY':key,'API-Hash':hash,'Content-Type':'application/json',Accept:'application/json'},
   signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'
  });
  if(!response.ok)throw Error('Catalogue unavailable');
  const payload=await response.json();
  if(payload.status!=='success')throw Error('Catalogue unavailable');
  return res.status(200).json({mode:'sandbox',checkoutEnabled:false,cards:normalizeCards(payload)});
 }catch{return res.status(503).json({error:'Test catalogue is unavailable. Preview remains available.'});}
}
