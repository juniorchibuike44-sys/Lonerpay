import test from 'node:test';
import assert from 'node:assert/strict';
import {monnifyConfig,monnifyAuthenticate} from '../api/_monnify.js';
import handler from '../api/monnify-account.js';

const env={MONNIFY_ENABLED:'true',MONNIFY_ROLLOUT:'all',MONNIFY_MODE:'live',MONNIFY_API_KEY:' key\n',MONNIFY_SECRET_KEY:' secret\n',MONNIFY_CONTRACT_CODE:' contract\n',SUPABASE_URL:'https://db.example',SUPABASE_SECRET_KEY:'db-test'};
async function fixture(fn){const before={...process.env},fetch=globalThis.fetch,log=console.error;Object.assign(process.env,env);try{await fn();}finally{globalThis.fetch=fetch;console.error=log;for(const k of Object.keys(process.env))if(!(k in before))delete process.env[k];Object.assign(process.env,before);}}
function response(){return {code:200,setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};}

test('authentication follows documented JSON request headers and ignores pasted outer whitespace',()=>fixture(async()=>{
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.monnify.com/api/v1/auth/login');assert.equal(options.method,'POST');
  assert.equal(options.headers['Content-Type'],'application/json');assert.equal(options.headers.Accept,'application/json');
  assert.equal(Buffer.from(options.headers.Authorization.slice(6),'base64').toString(),'key:secret');
  return Response.json({requestSuccessful:true,responseBody:{accessToken:'test-token'}});
 };
 const c=monnifyConfig();assert.equal(c.contract,'contract');assert.equal(await monnifyAuthenticate(c),'test-token');
}));

for(const [name,reply,code] of [
 ['rejected credentials',()=>Response.json({requestSuccessful:false,responseMessage:'DO-NOT-LOG-provider-message'},{status:401}),'monnify_auth_rejected'],
 ['outage',()=>Response.json({requestSuccessful:false},{status:503}),'monnify_auth_unreachable'],
 ['non-JSON response',()=>new Response('DO-NOT-LOG-html',{status:502}),'monnify_auth_invalid_response'],
 ['network failure',()=>{throw Error('DO-NOT-LOG-network-data');},'monnify_auth_unreachable']
])test('account check distinguishes '+name+' without exposing raw responses',()=>fixture(async()=>{
 const logs=[];console.error=(...args)=>logs.push(args);let authCalls=0;
 globalThis.fetch=async(url)=>{
  if(url.endsWith('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:7,retry_after:0});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-1111-1111-111111111111',email:'test@example.com'});
  if(url.includes('/lp_monnify_accounts?'))return Response.json([]);
  if(url.endsWith('/api/v1/auth/login')){authCalls++;return reply();}
  throw Error('Unexpected call');
 };
 const res=response();await handler({method:'GET',headers:{authorization:'Bearer user'}},res);
 assert.equal(res.code,503);assert.equal(res.data.code,code);assert.equal(authCalls,1);
 assert.ok(!JSON.stringify([res.data,logs]).includes('DO-NOT-LOG'));
 assert.equal(logs[0][1].stage,'authentication');
}));

test('database failures are distinguished from provider authentication and no account is claimed pending',()=>fixture(async()=>{
 console.error=()=>{};let provider=0;
 globalThis.fetch=async(url)=>{
  if(url.endsWith('/rpc/lp_check_rate_limit'))return Response.json({allowed:true,remaining:7,retry_after:0});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-1111-1111-111111111111'});
  if(url.includes('/lp_monnify_accounts?'))return Response.json({message:'DO-NOT-LOG-db'},{status:403});
  provider++;throw Error('Must not reach provider');
 };
 const res=response();await handler({method:'GET',headers:{authorization:'Bearer user'}},res);
 assert.equal(res.data.code,'funding_records_unavailable');assert.equal(provider,0);assert.ok(!JSON.stringify(res.data).includes('DO-NOT-LOG'));assert.ok(!res.data.error.includes('setup is pending'));
}));
