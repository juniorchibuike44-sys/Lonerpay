import nodemailer from 'nodemailer';
// A notice requests review only. Never look up accounts or move funds here.
export async function sendDeletionNotice({reference,email,userId='',details='',balance=null,pending=null}){
 if(!process.env.ZOHO_SMTP_PASSWORD)throw Error('MAIL_NOT_CONFIGURED');
 const transport=nodemailer.createTransport({host:'smtppro.zoho.com',port:465,secure:true,auth:{user:'support@lonerpay.com',pass:process.env.ZOHO_SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true});
 try{
  const result=await transport.sendMail({from:{name:'LonerPay Privacy Requests',address:'support@lonerpay.com'},to:['support@lonerpay.com','lonerhublimited@gmail.com'],replyTo:{address:email},subject:`[${reference}] LonerPay account and data deletion`,text:[
   'ACCOUNT AND ASSOCIATED-DATA DELETION REQUEST',`Reference: ${reference}`,`Email supplied: ${email}`,`Authenticated customer ID: ${userId||'Not signed in — verify ownership before action'}`,`Wallet balance at request: ${balance===null?'Not checked':balance}`,`Pending transactions: ${pending===null?'Not checked':pending?'Yes':'None'}`,'',details||'No reason supplied (a reason is not required).','',
   'This is a request, not authorisation to change funds or confirmation of deletion. Verify ownership, resolve funds/pending matters, remove public listings and photos, delete non-required associated data, and document lawful retention exceptions. Do not mark completed until actual deletion is verified and the customer is informed. See docs/account-deletion-operations.md in the repository.'
  ].join('\n')});
  if(!result.accepted?.length)throw Error('MAIL_NOT_ACCEPTED');return {accepted:true};
 }finally{transport.close();}
}
