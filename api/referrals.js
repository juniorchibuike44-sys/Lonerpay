import {access,db,failure} from './_notifications.js';
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const auth=await access(req,res);if(!auth)return;
 try{
  const result=await db(auth,'rpc/lp_referral_summary',{method:'POST',body:JSON.stringify({p_user:auth.user.id})});
  return res.status(200).json(result.data);
 }catch(e){return failure(res,e);}
}
