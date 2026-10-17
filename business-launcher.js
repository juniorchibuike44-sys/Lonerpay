(()=>{
 function install(){const grid=document.querySelector('.services');if(!grid||document.getElementById('lpBusinessTools'))return;const a=document.createElement('a');a.id='lpBusinessTools';a.className='service';a.href='business.html';a.style.cssText='text-decoration:none;color:inherit';a.innerHTML='<div aria-hidden="true">▤</div><h3>Business Tools</h3><p>Invoices & credit sales</p>';grid.append(a);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();setTimeout(install,1000);
 window.attachLonerPayVoiceReceipt=(overlay,t)=>{
 const sheet=overlay.querySelector('.sheet');if(!sheet||sheet.querySelector('.lpVoiceReceipt'))return;
 const box=document.createElement('section');box.className='lpVoiceReceipt';box.style.cssText='margin-top:14px;padding:14px;border:1px solid #e5dac4;border-radius:14px;background:#faf8f2;color:#28251e';
 box.innerHTML='<strong style="font-size:13px">Voice receipt</strong><p style="font-size:12px;color:#746c5c">Read the saved transaction status aloud in English.</p><div style="display:flex;gap:8px"><button data-play style="background:#936514;color:white;border:0;border-radius:10px;padding:11px">▶ Read receipt</button><button data-stop style="background:white;color:#936514;border:1px solid #e5dac4;border-radius:10px;padding:11px">Stop</button></div><p data-status role="status" style="font-size:12px"></p>';
 const done=sheet.querySelector('#lpRcDone');sheet.insertBefore(box,done);const play=box.querySelector('[data-play]'),status=box.querySelector('[data-status]'),synth=window.speechSynthesis;
 if(!synth||!window.SpeechSynthesisUtterance){play.disabled=true;status.textContent='Voice playback is not supported on this browser.';return;}
 box.querySelector('[data-stop]').onclick=()=>{synth.cancel();status.textContent='Playback stopped.';};
 const observer=new MutationObserver(()=>{if(!overlay.isConnected){synth.cancel();observer.disconnect();}});observer.observe(document.body,{childList:true});
 play.onclick=async()=>{play.disabled=true;status.textContent='Checking the saved receipt…';const token=localStorage.getItem('lonerpay_access_token');try{const ref=t.reference||t.request_id||t.receiptId;if(!ref)throw Error('No saved transaction reference was found.');const r=await fetch('/api/voice-receipt?reference='+encodeURIComponent(ref),{headers:{Authorization:'Bearer '+token},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not check receipt.');if(!overlay.isConnected||token!==localStorage.getItem('lonerpay_access_token'))return;
 const x=d.transaction,labels={successful:'successful',pending:'pending confirmation. Do not pay again',failed:'failed',refunded:'refunded'},label=labels[String(x.status).toLowerCase()]||'not confirmed';
 const voices=synth.getVoices(),voice=voices.find(v=>/^en[-_]NG$/i.test(v.lang))||voices.find(v=>/^en\b/i.test(v.lang));
 if(voices.length&&!voice)throw Error('An English voice is not available on this device.');
 const utter=new SpeechSynthesisUtterance('LonerPay receipt. '+String(x.service||'Transaction').replaceAll('_',' ')+'. Amount, '+Number(x.amount).toFixed(2)+' naira. Transaction status, '+label+'.');utter.lang=voice?.lang||'en-NG';if(voice)utter.voice=voice;utter.rate=.9;utter.onend=()=>status.textContent='Playback complete.';utter.onerror=()=>status.textContent='Playback could not finish. Check your device voice settings.';synth.cancel();synth.speak(utter);status.textContent='Reading receipt…';
 }catch(e){status.textContent=e.message;}finally{play.disabled=false;}};
 };
})();
