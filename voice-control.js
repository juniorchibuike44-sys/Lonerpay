(function(){
  'use strict';
  if(window.LonerPayVoice)return;
  const routes={data:['buyData','data'],airtime:['buyAirtime','airtime'],fund:['openFundWallet','wallet funding'],history:['openTransactionHistory','transactions'],profile:['openProfile','profile'],electricity:['buyElectricity','electricity'],tv:['buyTV','TV subscriptions'],business:['openLonerPayBusinessTools','Business Tools'],education:['openEducation','education'],cards:['openRechargeCards','recharge cards'],refunds:['openRefund','refunds'],ai:['openAITips','AI Tips']};
  function intent(text){
    const s=String(text||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\b(loner|lona|loana|luna|loaner)\s*pay\b/g,' ').replace(/\s+/g,' ').trim();
    if(!s||s.length>180)return null;
    // Navigation only: never interpret money movement or credential instructions.
    if(/\b(no|not|don t|cancel|stop)\b/.test(s))return null;
    if(/\b(transfer|send|pay|purchase|buy|recharge|delete|logout|log out|pin|password|otp|confirm|withdraw)\b/.test(s.replace(/\brecharge cards?\b/g,'cards')))return 'restricted';
    const found=[];
    for(const [key,re] of Object.entries({data:/\bdata\b/,airtime:/\bairtime\b/,fund:/\b(fund|top up|add money)\b/,history:/\b(transactions?|history|receipts?)\b/,profile:/\b(profile|settings)\b/,electricity:/\b(electricity|meter|electric)\b/,tv:/\b(tv|television|cable|dstv|gotv|startimes)\b/,business:/\bbusiness\b/,education:/\b(education|waec|jamb)\b/,cards:/\b(recharge cards?|e pins?)\b/,refunds:/\brefunds?\b/,ai:/\bai tips\b/,balance:/\bbalance\b/}))if(re.test(s))found.push(key);
    if(found.length!==1)return null;
    return found[0];
  }
  let panel=null,recognition=null,deadline=null,active=false,previousFocus=null;
  function stop(){
    active=false;clearTimeout(deadline);
    const old=recognition;recognition=null;
    if(old){old.onresult=old.onerror=old.onend=old.onstart=null;try{old.abort();}catch(_){}}
    if(panel){panel.querySelector('[data-listen]').disabled=false;panel.querySelector('[data-stop]').hidden=true;}
  }
  function close(){stop();if(panel){panel.close();panel.remove();panel=null;}previousFocus?.focus?.();}
  function message(text){if(panel)panel.querySelector('[data-status]').textContent=text;}
  async function run(text){
    stop();
    const target=intent(text);
    if(target==='restricted'){message('Voice currently opens screens only. Choose a service, then enter purchase details and confirm with your payment PIN. Never say your PIN or OTP.');return;}
    if(!target){message('Please name one screen, for example: “Open data”, “Fund my wallet” or “Show transactions”.');return;}
    if(target==='balance'){
      const balance=document.querySelector('.balance h2');
      const value=balance?.textContent?.trim()||'';
      message(value.includes('•')?'Your balance is hidden. Use the eye button on your dashboard to reveal it.':/^₦[\d,.]+$/.test(value)?'Dashboard balance: '+value:'Your balance is still loading. Please check your dashboard shortly.');
      return;
    }
    const [fn,label]=routes[target];
    if(typeof window[fn]!=='function'){message('This screen is not ready yet. Please try its dashboard button.');return;}
    close();
    try{await window[fn]();}catch(_){open();message('That screen could not open. Please try again from the dashboard.');}
  }
  function listen(){
    stop();
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){message('Voice is unavailable in this browser. Type a command below, or try Chrome on your phone.');return;}
    try{
      const r=new Recognition();recognition=r;active=true;
      r.lang='en-NG';r.continuous=false;r.interimResults=false;r.maxAlternatives=1;
      panel.querySelector('[data-listen]').disabled=true;panel.querySelector('[data-stop]').hidden=false;
      message('Starting microphone… Allow microphone access if prompted.');
      r.onstart=()=>{if(active&&recognition===r)message('Listening… Say one command.');};
      r.onresult=e=>{
        if(!active||recognition!==r||!panel?.open||document.hidden)return;
        const result=e.results?.[e.resultIndex||0];
        if(!result?.isFinal)return;
        const text=String(result[0]?.transcript||'');
        // Keep recognised speech only in this temporary panel, never in storage.
        panel.querySelector('input').value=text.slice(0,180);run(text);
      };
      r.onerror=e=>{
        if(recognition!==r)return;
        const errors={'not-allowed':'Microphone access was blocked. Allow it in your browser site settings, or type below.','service-not-allowed':'Voice recognition is unavailable here. Type your command below.','audio-capture':'No microphone was found. Check your microphone or type below.','network':'Voice could not connect. Check your internet connection or type below.','no-speech':'No speech was heard. Tap Speak and try again.','language-not-supported':'English voice recognition is unavailable on this device. Type below.'};
        stop();message(errors[e.error]||'Voice stopped. Tap Speak to try again, or type below.');
      };
      r.onend=()=>{if(recognition!==r)return;stop();message('Listening ended. Tap Speak to try again, or type a command.');};
      deadline=setTimeout(()=>{stop();message('Listening timed out. Tap Speak to try again.');},15000);
      r.start();
    }catch(_){stop();message('Could not start voice recognition. Check microphone access or type below.');}
  }
  function open(){
    if(panel?.open)return;
    previousFocus=document.activeElement;
    panel=document.createElement('dialog');panel.id='lpVoiceControl';panel.setAttribute('aria-labelledby','lpVoiceTitle');
    panel.innerHTML='<div class="lv-head"><span class="lv-eyebrow">YOUR LONERPAY ASSISTANT</span><button type="button" class="lv-close" aria-label="Close voice control">×</button><h2 id="lpVoiceTitle">Talk to LonerPay</h2><p>One command. The right screen.</p></div><div class="lv-body"><p data-status role="status" aria-live="polite">Tap Speak and say “Open data” or “Show transactions”.</p><div class="lv-actions"><button type="button" data-listen>Speak</button><button type="button" data-stop hidden>Stop listening</button></div><form><label for="lpVoiceCommand">Or type a command</label><div class="lv-entry"><input id="lpVoiceCommand" maxlength="180" autocomplete="off" placeholder="Open data"><button type="submit">Go</button></div></form><div class="lv-examples"><button type="button" data-command="Open data">Open data</button><button type="button" data-command="Fund my wallet">Fund wallet</button><button type="button" data-command="Show transactions">Transactions</button><button type="button" data-command="Check balance">Balance</button></div><p class="lv-note">English commands. Listening starts only when you tap Speak. Your browser may send audio to its speech service; an internet connection may be needed.</p><p class="lv-note">Voice opens screens only. Confirm purchases on screen with your payment PIN. Never say your PIN, password or OTP.</p></div>';
    document.body.append(panel);panel.showModal();
    panel.querySelector('.lv-close').onclick=close;
    panel.oncancel=e=>{e.preventDefault();close();};
    panel.querySelector('[data-listen]').onclick=listen;
    panel.querySelector('[data-stop]').onclick=()=>{stop();message('Microphone stopped.');};
    panel.querySelector('form').onsubmit=e=>{e.preventDefault();run(panel.querySelector('input').value);};
    panel.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>run(b.dataset.command));
  }
  function install(){
    if(document.getElementById('lpVoiceLauncher'))return;
    const anchor=document.querySelector('.balance');if(!anchor)return;
    const style=document.createElement('style');style.textContent=`
    #lpVoiceLauncher{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin:14px 0;padding:15px 17px;border:1px solid #e1cfaa;border-radius:18px;background:linear-gradient(110deg,#fffdf7,#f4e8cc);color:#795315;text-align:left;font:inherit;cursor:pointer}
    #lpVoiceLauncher svg{width:24px;height:24px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:1.8}#lpVoiceLauncher strong{display:block;font-size:15px}#lpVoiceLauncher small{display:block;color:#76694f;font-size:12px;margin-top:3px}#lpVoiceLauncher .lv-arrow{margin-left:auto}
    #lpVoiceControl{position:fixed;inset:0;width:calc(100% - 24px);max-width:440px;max-height:85dvh;box-sizing:border-box;padding:0;margin:auto;border:1px solid #ddc99f;border-radius:24px;background:#fffdf7;color:#28251e;overflow:auto;font-family:inherit;box-shadow:0 20px 70px #20190840}#lpVoiceControl::backdrop{background:#18140dc4}#lpVoiceControl *{box-sizing:border-box}#lpVoiceControl .lv-head{padding:25px 23px 18px;background:linear-gradient(130deg,#45341a,#936514);color:#fff9ea;position:relative}#lpVoiceControl h2{font-size:25px;margin:14px 0 7px}#lpVoiceControl p{line-height:1.55}#lpVoiceControl .lv-head p{margin:0;color:#f1dfbc;font-size:14px}#lpVoiceControl .lv-eyebrow{font-size:10px;letter-spacing:1.4px}#lpVoiceControl button{cursor:pointer;font:inherit;border-radius:12px;padding:12px 16px;border:1px solid #dfcfaf;color:#795315;background:#fffaf0}#lpVoiceControl .lv-close{position:absolute;right:14px;top:12px;padding:5px 12px;color:#fff;background:#ffffff18;border:0;font-size:24px}#lpVoiceControl .lv-body{padding:20px 23px}#lpVoiceControl [data-status]{margin:0 0 17px;min-height:48px;font-size:14px}#lpVoiceControl .lv-actions{display:flex;gap:8px;flex-wrap:wrap}#lpVoiceControl [data-listen],#lpVoiceControl [type=submit]{background:#936514;color:white;border-color:#936514}#lpVoiceControl button:disabled{opacity:.6;cursor:wait}#lpVoiceControl label{display:block;font-size:13px;font-weight:600;margin:22px 0 8px}#lpVoiceControl .lv-entry{display:flex;gap:8px}#lpVoiceControl input{min-width:0;width:100%;border:1px solid #ddcfb7;border-radius:12px;padding:12px;font:inherit;background:white;color:#28251e}#lpVoiceControl .lv-examples{display:flex;flex-wrap:wrap;gap:7px;margin:17px 0}#lpVoiceControl .lv-examples button{font-size:12px;padding:8px 10px}#lpVoiceControl .lv-note{font-size:12px;color:#736957;margin:12px 0 0}#lpVoiceControl :focus-visible,#lpVoiceLauncher:focus-visible{outline:3px solid #b38739;outline-offset:3px}
    `;document.head.append(style);
    const b=document.createElement('button');b.id='lpVoiceLauncher';b.type='button';b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg><span><strong>Talk to LonerPay</strong><small>Open a service with your voice</small></span><span class="lv-arrow" aria-hidden="true">↗</span>';b.onclick=open;anchor.insertAdjacentElement('afterend',b);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',close);window.addEventListener('popstate',close);
  window.LonerPayVoice=Object.freeze({open});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
