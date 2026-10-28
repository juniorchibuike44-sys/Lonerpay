import {randomUUID} from 'node:crypto';
import {cleanText,enforceSharedRateLimit,hardenResponse} from './_security.js';
import {sendDeletionNotice} from './_deletion-mail.js';
export default async function handler(req,res){
 hardenResponse(res);
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(!await enforceSharedRateLimit(req,res,{key:'public-deletion',limit:3,windowMs:15*60_000}))return;
 const email=cleanText(req.body?.email,254).toLowerCase();
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||req.body?.confirmation!=='DELETE MY ACCOUNT')return res.status(400).json({error:'Enter your registered email and confirm the account deletion request.'});
 const reference='DEL-'+randomUUID();
 try{
  await sendDeletionNotice({reference,email,details:cleanText(req.body?.details,500)});
  // Same response regardless of whether the supplied email has an account.
  return res.status(201).json({success:true,reference,message:'Your request was sent to support for ownership verification. Your account has not been deleted yet.'});
 }catch{return res.status(503).json({error:'We could not confirm that your request was sent. Please email support@lonerpay.com or lonerhublimited@gmail.com with the subject “Account and data deletion”.'});}
}
