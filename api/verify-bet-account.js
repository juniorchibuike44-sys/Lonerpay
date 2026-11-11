import {hardenResponse} from './_security.js';
export default function handler(req,res){
 hardenResponse(res);
 if(req.method!=="POST")return res.status(405).json({success:false,message:'Method not allowed'});
 return res.status(503).json({success:false,code:'betting_unavailable',message:'Betting services are currently unavailable. No payment has been taken.'});
}
