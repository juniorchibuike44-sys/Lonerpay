import assert from 'node:assert/strict';
import handler from './api/vtpass-requery.js';
Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'secret',PAIRGATE_API_KEY:'test'});
let failSave=false;
global.fetch=async(u,o={})=>{
 let data={},status=200;u=String(u);
 if(u.endsWith('/auth/v1/user'))data={id:'user1'};
 else if(u.includes('/wallet_transactions')&&o.method!=='PATCH')data=[{request_id:'202610170930abcdef',status:'pending',details:{provider:'pairgate',provider_reference:'PG123'}}];
 else if(u.includes('pairgate.com'))data={status:'success',data:{status:'successful'}};
 else if(o.method==='PATCH')status=failSave?500:200;
 else throw Error(u);
 return new Response(JSON.stringify(data),{status});
};
const req={method:'POST',headers:{authorization:'Bearer user'},body:{request_id:'202610170930abcdef'}};
function response(){return {setHeader(){},status(n){this.code=n;return this},json(d){this.data=d;return this}}}
let r=response();await handler(req,r);assert.equal(r.data.status,'successful');assert.equal(r.data.resolved,true);
failSave=true;r=response();await handler(req,r);assert.equal(r.code,500);assert.notEqual(r.data.resolved,true);
console.log('PASS: confirmed Pairgate status is saved; failed database save never reports resolution');
