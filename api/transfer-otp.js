import {hardenResponse} from './_security.js';
export default async function handler(req,res){
 hardenResponse(res);
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 return res.status(503).json({code:'transfers_unavailable',error:'Bank transfers and withdrawals are not available. Your prepaid balance is for supported airtime, data and utility purchases.'});
}
