import {randomBytes} from 'node:crypto';
import {hardenResponse,requireUser,enforceSharedRateLimit} from './_security.js';
import {monnifyConfig,monnifyAccessAllowed,monnifyIsPrimary,monnifyRequest,monnifyDb,moneyKobo} from './_monnify.js';
import {processFunding} from './_monnify-reconciliation.js';

function siteUrl() {
 const configured=process.env.LONERPAY_BASE_URL?.trim();
 if(configured&&/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured))return configured.replace(/\/$/,'');
 const production=process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
 if(production&&/^[a-z0-9.-]+$/i.test(production))return 'https://'+production;
 throw Error('Checkout return URL is not configured');
}
function reference(){return 'LPQ-'+Date.now().toString(36).toUpperCase()+'-'+randomBytes(8).toString('hex').toUpperCase();}

export default async function handler(req,res){
 hardenResponse(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(!await enforceSharedRateLimit(req,res,{key:'monnify-checkout',limit:10,windowMs:600000}))return;
 const auth=await requireUser(req,res);if(!auth)return;
 let c;try{c=monnifyConfig();}catch{return res.status(503).json({error:'Wallet funding is temporarily unavailable'});}
 if(!monnifyIsPrimary(auth.user.id)||!monnifyAccessAllowed(c,auth.user.id))return res.status(403).json({error:'Checkout is not available for this account'});
 try{
  if(req.method==='POST'){
   const kobo=moneyKobo(req.body?.amount);
   if(kobo<10000||kobo>50000000)return res.status(400).json({error:'Enter an amount from ₦100 to ₦500,000'});
   if(!auth.user.email)return res.status(400).json({error:'Add an email address to your account before funding'});
   const paymentReference=reference(),amount=kobo/100;
   await monnifyDb('lp_monnify_checkouts','POST',{payment_reference:paymentReference,user_id:auth.user.id,mode:c.mode,amount,status:'pending'});
   let checkout;
   try{checkout=await monnifyRequest(c,'/api/v1/merchant/transactions/init-transaction','POST',{amount,customerName:String(auth.user.user_metadata?.full_name||auth.user.email).slice(0,100),customerEmail:auth.user.email,paymentReference,paymentDescription:'Fund LonerPay wallet',currencyCode:'NGN',contractCode:c.contract,redirectUrl:siteUrl()+'/dashboard.html?funding=checkout&reference='+encodeURIComponent(paymentReference),paymentMethods:['ACCOUNT_TRANSFER','USSD','PHONE_NUMBER'],metadata:{source:'lonerpay_wallet'}});}
   catch(error){await monnifyDb('lp_monnify_checkouts?payment_reference=eq.'+encodeURIComponent(paymentReference),'PATCH',{status:'failed',updated_at:new Date().toISOString()});throw error;}
   if(typeof checkout.checkoutUrl!=='string'||!/^https:\/\//i.test(checkout.checkoutUrl))throw Error('Invalid checkout response');
   return res.status(200).json({checkout_url:checkout.checkoutUrl,payment_reference:paymentReference,amount});
  }
  const paymentReference=String(req.query.reference||'');
  if(!/^LPQ-[A-Z0-9-]{10,90}$/.test(paymentReference))return res.status(400).json({error:'Invalid checkout reference'});
  const rows=await monnifyDb('lp_monnify_checkouts?payment_reference=eq.'+encodeURIComponent(paymentReference)+'&user_id=eq.'+auth.user.id+'&mode=eq.'+c.mode+'&select=*&limit=1');
  const checkout=rows[0];if(!checkout)return res.status(404).json({error:'Checkout not found'});
  if(checkout.status==='credited')return res.status(200).json({status:'credited',credited:true});
  let t;try{t=await monnifyRequest(c,'/api/v2/merchant/transactions/query?paymentReference='+encodeURIComponent(paymentReference));}catch{return res.status(200).json({status:'pending',credited:false});}
  if(t.paymentStatus!=='PAID')return res.status(200).json({status:String(t.paymentStatus||'pending').toLowerCase(),credited:false});
  const row={id:'checkout-'+paymentReference,reference:t.transactionReference,event_type:'SUCCESSFUL_TRANSACTION',payload:{transactionReference:t.transactionReference,paymentReference,amountPaid:t.amountPaid},state:'pending'};
  await monnifyDb('rpc/lp_monnify_enqueue','POST',{p_id:row.id,p_reference:row.reference,p_type:row.event_type,p_payload:row.payload});
  const result=await processFunding(row,c);
  return res.status(200).json({status:result.state,credited:result.credited===true||result.state==='credited'});
 }catch(error){console.error('Monnify checkout request failed',error.code||error.message);return res.status(503).json({error:'Unable to start or confirm checkout. Please try again shortly.'});}
}
