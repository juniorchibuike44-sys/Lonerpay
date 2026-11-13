import test from 'node:test';
import assert from 'node:assert/strict';
import transfer from '../api/transfer.js';
import otp from '../api/transfer-otp.js';
for(const [name,handler] of [['transfer',transfer],['transfer-otp',otp]])test(name+' cannot initiate or complete an outbound bank payment',async()=>{
 const old=fetch;let called=false;globalThis.fetch=async()=>{called=true;throw Error('No provider request allowed');};
 try{const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await handler({method:'POST',headers:{},body:{amount:100,otp:'123456'}},res);assert.equal(res.code,503);assert.equal(res.data.code,'transfers_unavailable');assert.equal(called,false);}finally{globalThis.fetch=old;}
});
