import assert from 'node:assert/strict';
import handler from '../api/admin-records.js';
process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SECRET_KEY='test';
const req={method:'GET',headers:{authorization:'Bearer fake','x-forwarded-for':'192.0.2.1'},query:{section:'users'}};
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(x){this.body=x;return this}});
let calls=[];globalThis.fetch=async (url)=>{calls.push(url);if(url.endsWith('/rpc/lp_check_rate_limit'))return {ok:true,json:async()=>({allowed:true,remaining:29,retry_after:60})};if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'ordinary',email:'customer@example.test'})};throw Error('Unexpected privileged request');};
let out=res();await handler(req,out);assert.equal(out.code,403);assert.equal(calls.length,2);
calls=[];globalThis.fetch=async (url)=>{calls.push(url);if(url.endsWith('/rpc/lp_check_rate_limit'))return {ok:true,json:async()=>({allowed:true,remaining:29,retry_after:60})};if(url.endsWith('/auth/v1/user'))return {ok:false};throw Error('Unexpected privileged request');};
out=res();await handler(req,out);assert.equal(out.code,401);assert.equal(calls.length,2);console.log('Admin records reject ordinary and unauthenticated users before data access');
