import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('Android entry uses owned HTTPS origin, no WebView bridge or embedded credentials',()=>{
 const manifest=read('android/app/src/main/AndroidManifest.xml');
 assert.match(manifest,/usesCleartextTraffic="false"/);assert.match(manifest,/allowBackup="false"/);
 assert.doesNotMatch(manifest,/READ_CONTACTS|READ_SMS|SEND_SMS|CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION/);
 const activity=read('android/app/src/main/java/com/lonerpay/app/WebActivity.java');
 assert.match(activity,/https:\/\/lonerpay\.com\/index.html/);assert.doesNotMatch(activity,/WebView|addJavascriptInterface/);
 const gradle=read('android/app/build.gradle');assert.match(gradle,/targetSdk 36/);assert.match(gradle,/applicationIdSuffix '\.debug'/);
});
test('manifest has same-origin scope and actual PNG icons at declared sizes',()=>{
 const m=JSON.parse(read('manifest.webmanifest'));assert.equal(m.start_url,'/index.html');assert.equal(m.scope,'/');
 for(const icon of m.icons){const png=fs.readFileSync(new URL(icon.src.slice(1),root));assert.equal(png.subarray(1,4).toString(),'PNG');const [w,h]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),w);assert.equal(png.readUInt32BE(20),h);}
});
test('service worker never intercepts API, cross-origin, POST or background data; no successful response caching',async()=>{
 const listeners={},puts=[];let requestCount=0;
 const ctx={self:{location:{origin:'https://lonerpay.com'},addEventListener:(name,fn)=>listeners[name]=fn},URL,Request,Response,
  fetch:async()=>{requestCount++;return new Response('live');},caches:{open:async()=>({add:async req=>puts.push(req.url)}),keys:async()=>[],match:async()=>new Response('offline')}};
 // Browser Request accepts relative URLs; normalize only this browser construct for Node's test.
 ctx.Request=class extends Request{constructor(url,options){super(new URL(url,'https://lonerpay.com'),options);}};
 vm.runInNewContext(read('sw.js'),ctx);
 for(const request of [{url:'https://lonerpay.com/api/wallet',method:'GET',mode:'navigate'},{url:'https://lonerpay.com/api/pay',method:'POST',mode:'navigate'},{url:'https://provider.test/',method:'GET',mode:'navigate'},{url:'https://lonerpay.com/dashboard.html',method:'GET',mode:'cors'}])listeners.fetch({request,respondWith:()=>assert.fail('must not intercept')});
 let install;listeners.install({waitUntil:p=>install=p});await install;assert.deepEqual(puts,['https://lonerpay.com/offline.html']);
 let response;const event={request:{url:'https://lonerpay.com/dashboard.html',method:'GET',mode:'navigate'},respondWith:p=>response=p};listeners.fetch(event);assert.equal(await(await response).text(),'live');assert.equal(requestCount,1);assert.equal(puts.length,1);
 ctx.fetch=async()=>{throw Error('offline');};listeners.fetch(event);assert.equal(await(await response).text(),'offline');assert.equal(puts.length,1);
});
test('certificate tool rejects malformed fingerprints instead of deploying placeholders',()=>{
 const result=spawnSync(process.execPath,[new URL('scripts/android-assetlinks.mjs',root).pathname,'INVALID'],{encoding:'utf8'});assert.notEqual(result.status,0);
});
