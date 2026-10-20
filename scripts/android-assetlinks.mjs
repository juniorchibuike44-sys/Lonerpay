import fs from 'node:fs';
const [fingerprint,packageName='com.lonerpay.app',output='assetlinks.json']=process.argv.slice(2);
if(!/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(fingerprint||'') || !/^com\.lonerpay\.app(?:\.debug)?$/.test(packageName)) {
    throw Error('Provide a SHA-256 certificate fingerprint and com.lonerpay.app or com.lonerpay.app.debug');
}
const result=[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:packageName,sha256_cert_fingerprints:[fingerprint.toUpperCase()]}}];
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o644});
console.log('Created '+output+'. Publish only after verifying the certificate belongs to the intended build.');
