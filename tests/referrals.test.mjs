import assert from 'node:assert/strict';import handler from '../api/referrals.js';
process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
const response=()=>({setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return this}});
let calls=[];let authOk=true;
globalThis.fetch=async(url,opts={})=>{calls.push({url,opts});if(url.includes('lp_check_rate_limit'))return new Response(JSON.stringify({allowed:true,remaining:10,retry_after:60}));if(url.endsWith('/auth/v1/user'))return authOk?new Response(JSON.stringify({id:'signed-in-user'})):new Response('{}',{status:401});if(url.includes('lp_referral_summary'))return new Response(JSON.stringify({code:'ABCDEF012345',verified_signups:1}));throw Error('Unexpected request')};
const req={method:'GET',headers:{authorization:'Bearer test','x-forwarded-for':'192.0.2.1'},query:{user_id:'other-user'}};let out=response();await handler(req,out);assert.equal(out.code,200);assert.equal(JSON.parse(calls.find(x=>x.url.includes('lp_referral_summary')).opts.body).p_user,'signed-in-user');
calls=[];authOk=false;out=response();await handler(req,out);assert.equal(out.code,401);assert(!calls.some(x=>x.url.includes('lp_referral_summary')));
out=response();await handler({...req,method:'POST'},out);assert.equal(out.code,405);console.log('Referral API checks passed');
