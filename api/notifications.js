import {access,db,uuid,payload,failure} from './_notifications.js';
export default async function handler(req,res){
 if(!['GET','PATCH'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const a=await access(req,res);if(!a)return;
 try{const scope='user_id=eq.'+encodeURIComponent(a.user.id);
 if(req.method==='GET'){
 const [items,count]=await Promise.all([db(a,'lp_notifications?'+scope+'&select=id,title,body,created_at,read_at,funding_transaction_id&order=created_at.desc&limit=50'),db(a,'lp_notifications?'+scope+'&read_at=is.null&select=id&limit=1',{headers:{Prefer:'count=exact'}})]);
 return res.status(200).json({notifications:items.data,unread_count:Number(count.response.headers.get('content-range')?.split('/')[1]||0)});
 }
 const d=payload(req);if(d.all!==true&&!uuid(d.id))return res.status(400).json({error:'Choose a notification'});
 await db(a,'lp_notifications?'+scope+'&read_at=is.null'+(d.all===true?'':'&id=eq.'+d.id),{method:'PATCH',body:JSON.stringify({read_at:new Date().toISOString()})});return res.status(200).json({ok:true});
 }catch(e){failure(res,e);}
}

