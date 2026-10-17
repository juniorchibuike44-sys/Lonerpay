import nodemailer from 'nodemailer';
import {randomUUID} from 'node:crypto';
import {access,db,uuid,payload,failure} from './_notifications.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const a=await access(req,res,true);if(!a)return;
 try{
 if(req.method==='GET')return res.status(200).json({campaigns:(await db(a,'rpc/lp_notification_campaigns',{method:'POST',body:'{}'})).data,email_configured:!!process.env.ZOHO_SMTP_PASSWORD});
 const d=payload(req);
 if(['preview','create'].includes(d.action)){
 const title=String(d.title||'').trim(),body=String(d.body||'').trim();
 const emails=Array.isArray(d.emails)?[...new Set(d.emails.map(x=>String(x).trim().toLowerCase()).filter(Boolean))]:[];
 if(!title||title.length>120||!body||body.length>2000||/[\u0000-\u001f\u007f]/.test(title)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)||!['all','selected'].includes(d.audience)||emails.length>100||emails.some(e=>!/^\S+@\S+\.\S+$/.test(e))||!uuid(d.request_key))return res.status(400).json({error:'Check the title, message and customer email addresses.'});
 if(d.send_email&&!process.env.ZOHO_SMTP_PASSWORD)return res.status(503).json({error:'Email is not configured.'});
 const r=await db(a,'rpc/lp_notification_prepare',{method:'POST',body:JSON.stringify({p_owner:a.user.id,p_request_key:d.request_key,p_title:title,p_body:body,p_audience:d.audience,p_emails:d.audience==='all'?[]:emails,p_email:d.send_email===true,p_commit:d.action==='create'})});return res.status(200).json(r.data);
 }
 if(d.action==='deliver'&&uuid(d.campaign_id)){
 if(!process.env.ZOHO_SMTP_PASSWORD)return res.status(503).json({error:'Email is not configured.'});
 const claim=randomUUID(),jobs=(await db(a,'rpc/lp_notification_claim',{method:'POST',body:JSON.stringify({p_campaign:d.campaign_id,p_claim:claim})})).data;
 if(!jobs.length)return res.status(200).json({processed:0});
 const job=jobs[0],campaign=(await db(a,'lp_announcements?id=eq.'+d.campaign_id+'&select=title,body')).data[0];
 const transport=nodemailer.createTransport({host:'smtppro.zoho.com',port:465,secure:true,auth:{user:'support@lonerpay.com',pass:process.env.ZOHO_SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
 let state='unknown';try{const sent=await transport.sendMail({from:{name:'LonerPay',address:'support@lonerpay.com'},to:job.email,subject:campaign.title,text:campaign.body+'\n\nLonerPay — LONERHUB LIMITED\nFor help: support@lonerpay.com',messageId:'<lp-'+job.id+'@lonerpay.com>'});state=sent.accepted?.length?'accepted':'failed';}catch(e){state=Number(e.responseCode)>=500?'failed':'unknown';}finally{transport.close();}
 await db(a,'lp_notification_email_jobs?id=eq.'+job.id+'&claim_token=eq.'+claim+'&state=eq.processing',{method:'PATCH',body:JSON.stringify({state,updated_at:new Date().toISOString()})});return res.status(200).json({processed:1,state});
 }
 return res.status(400).json({error:'Unknown action'});
 }catch(e){failure(res,e);}
}
