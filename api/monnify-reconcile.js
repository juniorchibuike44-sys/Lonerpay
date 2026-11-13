import {cronAuthorized} from './_push.js';
import {hardenResponse} from './_security.js';
import {fundingBatch} from './_monnify-reconciliation.js';
export default async function handler(req,res){
 hardenResponse(res);
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!cronAuthorized(req.headers.authorization))return res.status(401).json({error:'Unauthorized'});
 try{return res.status(200).json(await fundingBatch());}catch{return res.status(503).json({error:'Funding reconciliation will retry'});}
}
