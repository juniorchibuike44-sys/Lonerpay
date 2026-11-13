import {createHash} from 'node:crypto';
import {monnifyConfig,monnifyDb,monnifyRequest,monnifyAccessAllowed,validateReservedPayment,moneyKobo} from './_monnify.js';

export function fundingNotification(notification) {
 const type=notification?.eventType,event=notification?.eventData;
 if(!['SUCCESSFUL_TRANSACTION','SUCCESSFUL_REFUND','FAILED_REFUND','REJECTED_PAYMENT'].includes(type))return null;
 if(type==='SUCCESSFUL_TRANSACTION'&&event?.product?.type!=='RESERVED_ACCOUNT')return null;
 const ref=event?.transactionReference;
 if(typeof ref!=='string'||!ref||ref.length>200)throw Error('Invalid transaction reference');
 if(event.product?.type==='RESERVED_ACCOUNT'&&(typeof event.product.reference!=='string'||!event.product.reference||event.product.reference.length>100))throw Error('Invalid account reference');
 if(type.includes('REFUND')&&(typeof event.refundReference!=='string'||!event.refundReference||event.refundReference.length>200))throw Error('Invalid refund reference');
 const product=event.product?.type==='RESERVED_ACCOUNT'?{type:'RESERVED_ACCOUNT',reference:event.product.reference}:undefined;
 const payload={transactionReference:ref,...(product?{product}:{}),...(event.amountPaid!=null?{amountPaid:moneyKobo(event.amountPaid)/100}:{}),...(event.refundReference?{refundReference:event.refundReference}:{}),...(typeof event.refundStatus==='string'?{refundStatus:event.refundStatus.slice(0,30)}:{})};
 const id=createHash('sha256').update([type,ref,payload.refundReference||''].join(':')).digest('hex');
 return {id,reference:ref,event_type:type,payload};
}

async function finish(row,state,extra={}) {
 await monnifyDb('lp_monnify_inbox?id=eq.'+encodeURIComponent(row.id),'PATCH',{state,checked_at:new Date().toISOString(),last_error:null,...extra});
 return {state};
}
export async function processFunding(row,c=monnifyConfig(),{audit=false}={}) {
 try {
  if(row.event_type==='SUCCESSFUL_REFUND') {
   await monnifyDb('rpc/lp_monnify_review','POST',{p_reference:row.reference,p_reason:'successful_refund:'+createHash('md5').update(String(row.payload.refundReference||'')).digest('hex').slice(0,16)});
   return finish(row,'review');
  }
  if(row.event_type!=='SUCCESSFUL_TRANSACTION')return finish(row,'ignored');
  const rows=await monnifyDb('lp_monnify_accounts?account_reference=eq.'+encodeURIComponent(row.payload.product?.reference||'')+'&mode=eq.'+c.mode+'&select=user_id,account_reference,status,mode&limit=1');
  const account=rows[0];
  if(!account||!monnifyAccessAllowed(c,account.user_id))throw Error('account_mapping_unavailable');
  const t=await monnifyRequest(c,'/api/v2/merchant/transactions/query?transactionReference='+encodeURIComponent(row.reference));
  if(t.transactionReference!==row.reference)throw Error('provider_reference_mismatch');
  if(t.paymentStatus==='REVERSED'||t.paymentStatus==='REFUNDED') {
   await monnifyDb('rpc/lp_monnify_review','POST',{p_reference:row.reference,p_reason:'provider_'+t.paymentStatus.toLowerCase()});
   return finish(row,'review',{verified:{payment_status:t.paymentStatus}});
  }
  let payment;
  try { payment=validateReservedPayment(t,row.payload,account,c); }
  catch(error) {
   if(audit||row.state==='credited') {
    await monnifyDb('rpc/lp_monnify_review','POST',{p_reference:row.reference,p_reason:'confirmed_payment_changed'});
    return finish(row,'review');
   }
   throw error;
  }
  const refunds=await monnifyDb('lp_monnify_inbox?reference=eq.'+encodeURIComponent(row.reference)+'&event_type=eq.SUCCESSFUL_REFUND&select=id&limit=1');
  if(refunds.length) {
   await monnifyDb('rpc/lp_monnify_review','POST',{p_reference:row.reference,p_reason:'successful_refund'});
   return finish(row,'review');
  }
  if(c.mode!=='live')return finish(row,'ignored');
  // Audit is observation only. Replay of an already credited event never adds value again.
  const credit=!audit?await monnifyDb('rpc/lp_credit_monnify','POST',payment):null;
  let net=null;try{if(t.settlementAmount!==null&&t.settlementAmount!==undefined&&t.settlementAmount!=='')net=Number(t.settlementAmount)===0?0:moneyKobo(t.settlementAmount)/100;}catch{}
  const verified={payment_status:t.paymentStatus,amount:payment.p_amount,provider_net_amount:net,provider_fee:net!=null&&net<=payment.p_amount?Math.round((payment.p_amount-net)*100)/100:null};
  return {...await finish(row,'credited',{verified}),credited:credit?.credited===true};
 } catch(error) {
  const code=['account_mapping_unavailable','provider_reference_mismatch'].includes(error.message)?error.message:String(error.code||'provider_check_pending').slice(0,80);
  await monnifyDb('lp_monnify_inbox?id=eq.'+encodeURIComponent(row.id),'PATCH',{checked_at:new Date().toISOString(),last_error:code});
  return {state:row.state||'pending',pending:true};
 }
}

export async function fundingBatch() {
 let c;try{c=monnifyConfig();}catch{return {configured:false};}
 const rows=await monnifyDb('lp_monnify_inbox?state=eq.pending&order=checked_at.asc&limit=1&select=*');
 if(rows.length)return {checked:1,...await processFunding(rows[0],c)};
 const audit=await monnifyDb('lp_monnify_inbox?state=eq.credited&checked_at=lt.'+encodeURIComponent(new Date(Date.now()-300000).toISOString())+'&order=checked_at.asc&limit=1&select=*');
 if(audit.length)return {audited:1,...await processFunding(audit[0],c,{audit:true})};
 return {checked:0};
}
