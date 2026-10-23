import test from 'node:test';
import assert from 'node:assert/strict';
import subscriptions from '../api/push-subscriptions.js';
import transactions from '../api/transactions.js';
const owner='11111111-1111-4111-8111-111111111111';
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(d){this.data=d;return this;}};}
test('device registration authenticates and uses the verified owner, ignoring a supplied user ID',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='test';process.env.PUSH_VAPID_PUBLIC_KEY='test';process.env.PUSH_VAPID_PRIVATE_KEY='test';
 const old=fetch,calls=[];globalThis.fetch=async(u,o={})=>{
  calls.push({u,o});return Response.json(u.includes('/auth/v1/user')?{id:owner}:[]);
 };
 try{
  const req={method:'POST',headers:{authorization:'Bearer session',origin:'https://lonerpay.com'},body:{user_id:'someone-else',endpoint:'https://fcm.googleapis.com/fcm/send/device',keys:{p256dh:Buffer.alloc(65).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}}};
  const res=response();await subscriptions(req,res);assert.equal(res.statusCode,200);
  const written=JSON.parse(calls.find(c=>c.o.method==='POST').o.body);assert.equal(written.user_id,owner);
  const unauth=response();await subscriptions({method:'POST',headers:{},body:req.body},unauth);assert.equal(unauth.statusCode,401);
 }finally{globalThis.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_SECRET_KEY','PUSH_VAPID_PUBLIC_KEY','PUSH_VAPID_PRIVATE_KEY'])delete process.env[k];}
});
test('push receipt lookup always combines transaction ID with authenticated ownership',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='test';
 const old=fetch,urls=[];globalThis.fetch=async(u)=>{urls.push(u);return Response.json(u.includes('/auth/v1/user')?{id:owner}:[]);};
 try{
  const res=response();await transactions({method:'GET',headers:{authorization:'Bearer session'},query:{funding:owner}},res);
  assert.equal(res.statusCode,200);const query=new URL(urls.at(-1)).searchParams;
  assert.equal(query.get('user_id'),'eq.'+owner);assert.equal(query.get('id'),'eq.'+owner);assert.equal(query.get('status'),'eq.successful');
  assert.match(query.get('select'),/transaction_type/);
 }finally{globalThis.fetch=old;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;}
});
