(() => {
  const pushScript=document.createElement('script');pushScript.src='/push-client.js';pushScript.defer=true;document.head.append(pushScript);
  let items = [], unread = 0, session = '', modal = null, error = '', loaded = false;
  let activeRequest = null, writing = false, filter = 'all', previousOverflow = null;
  const token = () => localStorage.getItem('lonerpay_access_token') || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bell = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
  const style = document.createElement('style');
  style.textContent = `
.lpInboxOverlay{position:fixed;inset:0;z-index:30050;background:#201b14a6;display:flex;align-items:center;justify-content:center;padding:22px;font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(4px)}
.lpInboxOverlay *{box-sizing:border-box}.lpInbox{width:min(540px,100%);max-height:88vh;max-height:88dvh;display:flex;flex-direction:column;overflow:hidden;background:#faf8f2;color:#28251e;border:1px solid #e4d7b9;border-radius:26px;box-shadow:0 22px 80px #0004;text-align:left}
.lpInbox button{font:inherit;cursor:pointer}.lpInbox button:disabled{opacity:.45;cursor:default}.lpInbox button:focus-visible{outline:3px solid #936514;outline-offset:3px}.lpInboxHead{padding:24px 24px 18px;border-bottom:1px solid #e9e1d2;background:#fffdf8}.lpInboxTitle{display:flex;align-items:center;gap:12px}.lpInboxLogo{display:grid;place-items:center;background:#f1e6c9;color:#936514;border:1px solid #e8d5a4;border-radius:15px;width:46px;height:46px;flex-shrink:0}.lpInbox svg{width:23px;height:23px}.lpInbox h2{font-size:23px;line-height:1.2;margin:0;letter-spacing:-.6px}.lpInboxIntro{margin:5px 0 0;color:#817660;font-size:13px;line-height:1.5}.lpInboxClose{margin-left:auto;display:grid;place-items:center;width:38px;height:38px;flex-shrink:0;border-radius:50%;border:1px solid #e7dfcf;background:#faf8f2;color:#60553d;font-size:25px}
.lpInboxActions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:21px}.lpInboxTabs{display:flex;background:#f0ece2;border:1px solid #e9e1d2;padding:4px;border-radius:100px;gap:3px}.lpInboxTab{border:0;background:transparent;color:#776d59;padding:8px 13px;border-radius:100px;font-size:12px!important;font-weight:700!important}.lpInboxTab[aria-pressed=true]{background:#fff;color:#77500e;box-shadow:0 1px 4px #33271412}.lpInboxReadAll{border:0;background:transparent;color:#936514;font-size:12px!important;font-weight:750!important;padding:9px 0}.lpInboxToolbar{display:flex;align-items:center;justify-content:space-between;padding:13px 24px 3px;color:#867a65;font-size:11px}.lpInboxRefresh{display:flex;gap:5px;align-items:center;border:0;background:transparent;color:#766548;padding:8px;font-size:12px!important}.lpInboxRefresh svg{width:15px;height:15px}.lpInboxBody{overflow:auto;overscroll-behavior:contain;padding:0 24px 24px;min-height:220px}.lpInboxGroup{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a7a5b;margin:17px 0 10px;font-weight:800}.lpInbox article{padding:16px;margin:0 0 10px;border:1px solid #e8e1d4;border-radius:17px;background:#fff;overflow-wrap:anywhere}.lpInbox article.unread{background:#fffdf6;border-color:#e2cd9f}.lpInboxMessageTop{display:flex;align-items:flex-start;gap:10px}.lpInbox article h3{font-size:14px;line-height:1.5;margin:0;flex:1;font-weight:750}.lpInboxUnreadDot{width:7px;height:7px;margin-top:7px;background:#a87719;border-radius:50%;flex-shrink:0}.lpInbox article p{font-size:13px;color:#716953;line-height:1.65;white-space:pre-wrap;margin:8px 0 12px}.lpInboxMessageFoot{display:flex;gap:10px;align-items:center;justify-content:space-between}.lpInbox time{font-size:10px;color:#92856c}.lpInboxMark{background:transparent;border:0;color:#936514;padding:4px 0;font-size:11px!important;font-weight:750!important}.lpInboxReadLabel{font-size:10px;color:#958970}.lpInboxState{padding:38px 16px;text-align:center;color:#817760}.lpInboxStateIcon{display:grid;place-items:center;margin:0 auto 16px;width:66px;height:66px;border-radius:50%;background:#efe7d6;color:#a17c33}.lpInboxStateIcon svg{width:29px;height:29px}.lpInboxState h3{font-size:17px;color:#40382a;margin:0 0 8px}.lpInboxState p{font-size:13px;line-height:1.6;margin:0 auto;max-width:290px}.lpInboxRetry{margin-top:18px;border:0;border-radius:12px;padding:11px 20px;background:#936514;color:#fff;font-size:13px!important;font-weight:700!important}.lpInboxError{background:#fff3e9;color:#825322;padding:12px;border:1px solid #eed6ba;border-radius:12px;font-size:12px;line-height:1.5;margin:10px 0}.lpInboxSkeleton{height:108px;background:linear-gradient(90deg,#eee8db,#faf7ee,#eee8db);background-size:200% 100%;border-radius:17px;margin:12px 0;animation:lpInboxShimmer 1.5s infinite}.lpInboxBadge{position:absolute;right:-4px;top:-5px;border-radius:20px;background:#936514;color:white;font:700 10px system-ui,sans-serif;min-width:19px;padding:3px;text-align:center;border:2px solid #faf8f2}#lpNotify{position:relative}#lpNotify .dot{display:none!important}
@keyframes lpInboxShimmer{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.lpInboxSkeleton{animation:none}}@media(max-width:600px){.lpInboxOverlay{align-items:flex-end;padding:0}.lpInbox{width:100%;max-height:91vh;max-height:91dvh;border-radius:26px 26px 0 0;border-bottom:0}.lpInboxHead{padding:21px 20px 17px}.lpInboxBody{padding:0 20px calc(22px + env(safe-area-inset-bottom))}.lpInboxToolbar{padding-left:20px;padding-right:16px}}@media(max-width:350px){.lpInboxActions{align-items:flex-start;flex-direction:column}.lpInbox h2{font-size:20px}}
`;
  document.head.append(style);
  function syncSession() {
    const current = token();
    if (current === session) return;
    session = current; items = []; unread = 0; loaded = false; error = ''; writing = false;
    activeRequest?.controller.abort(); activeRequest = null;
  }
  function badge() {
    const button = document.getElementById('lpNotify');
    if (!button) return;
    let count = button.querySelector('.lpInboxBadge');
    if (!count) { count = document.createElement('span'); count.className = 'lpInboxBadge'; button.append(count); }
    count.textContent = unread > 99 ? '99+' : String(unread); count.hidden = !unread;
    button.setAttribute('aria-label', `Notifications${unread ? ', '+unread+' unread' : ''}`);
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', String(!!modal?.isConnected));
  }
  async function api(body, controller) {
    const current = token();
    if (!current) throw Error('Please sign in to see your notifications.');
    const response = await fetch('/api/notifications', {method:body?'PATCH':'GET',cache:'no-store',headers:{Authorization:'Bearer '+current,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller?.signal || AbortSignal.timeout(10000)});
    if (token() !== current) throw Error('Your session changed. Open notifications again.');
    let data; try { data = await response.json(); } catch { throw Error('Could not load notifications. Please try again.'); }
    if (!response.ok) throw Error(response.status===401 || response.status===403 ? 'Please sign in again to see your notifications.' : response.status===503 ? 'Notifications are temporarily unavailable. Please try again shortly.' : data.error || 'Could not load notifications.');
    return data;
  }
  function dateLabel(value) {
    const date = new Date(value); if (!Number.isFinite(date.getTime())) return 'Earlier';
    const today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate()-1);
    return date.toDateString()===today.toDateString() ? 'Today' : date.toDateString()===yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString('en-NG',{day:'numeric',month:'short',year:date.getFullYear()!==today.getFullYear()?'numeric':undefined});
  }
  function messages() {
    const shown = filter==='unread' ? items.filter(n=>!n.read_at) : items;
    let lastGroup='';
    return shown.map(n=>{
      const group=dateLabel(n.created_at), date=new Date(n.created_at), valid=Number.isFinite(date.getTime());
      const heading=group!==lastGroup?`<h3 class="lpInboxGroup">${esc(group)}</h3>`:'';lastGroup=group;
      return heading+`<article class="${n.read_at?'':'unread'}"><div class="lpInboxMessageTop"><h3>${esc(n.title || 'LonerPay update')}</h3>${n.read_at?'':'<span class="lpInboxUnreadDot" aria-label="Unread"></span>'}</div><p>${esc(n.body)}</p><div class="lpInboxMessageFoot"><time ${valid?`datetime="${esc(date.toISOString())}"`:''}>${valid?esc(date.toLocaleString('en-NG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})):''}</time>${!n.read_at?`<button type="button" class="lpInboxMark" data-read="${esc(n.id)}" ${writing || activeRequest?'disabled':''}>Mark as read</button>`:'<span class="lpInboxReadLabel">Read</span>'}</div></article>`;
    }).join('');
  }
  function render() {
    if (!modal?.isConnected) return;
    const root=modal.querySelector('.lpInbox'), body=root.querySelector('.lpInboxBody');
    const scroll=body?.scrollTop || 0, focused=document.activeElement;
    const focusedId=focused?.id, focusedRead=focused?.dataset?.read;
    const pending=!!activeRequest;
    const hasShown=(filter==='unread'?items.filter(n=>!n.read_at):items).length>0;
    const state=(title,detail,retry=false)=>`<div class="lpInboxState"><div class="lpInboxStateIcon">${bell}</div><h3>${esc(title)}</h3><p>${esc(detail)}</p>${retry?'<button type="button" class="lpInboxRetry" id="lpInboxRetry">Try again</button>':''}</div>`;
    let content;
    if (!items.length && pending && !loaded) content='<div role="status" aria-label="Loading notifications"><div class="lpInboxSkeleton"></div><div class="lpInboxSkeleton"></div><div class="lpInboxSkeleton"></div></div>';
    else if (!items.length && error) content=state('Couldn’t load notifications',error,true);
    else content=(error?`<p class="lpInboxError" role="alert">${esc(error)}</p>`:'')+(hasShown?messages():state(filter==='unread'?'You’re all caught up':'No notifications yet',filter==='unread'?'You have no unread messages in your recent notifications.':'Updates about your account and payments will appear here.'));
    root.innerHTML=`<header class="lpInboxHead"><div class="lpInboxTitle"><span class="lpInboxLogo">${bell}</span><div><h2 id="lpInboxTitle">Notifications</h2><p class="lpInboxIntro" aria-live="polite" aria-atomic="true">${unread?`${unread} unread ${unread===1?'message':'messages'}`:'Your account updates, in one place'}</p></div><button type="button" class="lpInboxClose" id="lpInboxClose" aria-label="Close notifications">×</button></div><div class="lpInboxActions"><div class="lpInboxTabs" role="group" aria-label="Filter notifications"><button type="button" id="lpInboxAll" class="lpInboxTab" data-filter="all" aria-pressed="${filter==='all'}">All</button><button type="button" id="lpInboxUnread" class="lpInboxTab" data-filter="unread" aria-pressed="${filter==='unread'}">Unread${unread?' · '+unread:''}</button></div><button type="button" id="lpInboxReadAll" class="lpInboxReadAll" ${!unread || pending || writing?'disabled':''}>${writing?'Saving…':'Mark all as read'}</button></div></header><div class="lpInboxToolbar"><span>${items.length===50?'Latest 50 messages':'Recent messages'}</span><button type="button" id="lpInboxRefresh" class="lpInboxRefresh" ${pending || writing?'disabled':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg>${pending?'Refreshing…':'Refresh'}</button></div><div class="lpInboxBody" aria-busy="${pending || writing}">${content}</div>`;
    root.querySelector('.lpInboxBody').scrollTop=scroll;
    if (focusedId) document.getElementById(focusedId)?.focus({preventScroll:true});
    else if (focusedRead) { const target=[...root.querySelectorAll('[data-read]')].find(b=>b.dataset.read===focusedRead); (target || root.querySelector('#lpInboxReadAll')).focus({preventScroll:true}); }
  }
  async function refresh() {
    syncSession(); if (activeRequest) return activeRequest.promise;
    const current=session, controller=new AbortController(), request={controller};
    activeRequest=request;
    request.promise=(async()=>{
      const timeout=setTimeout(()=>controller.abort(),10000);
      try {
        const data=await api(undefined,controller);
        if (session!==current || token()!==current) return;
        items=Array.isArray(data.notifications)?data.notifications.filter(n=>n && typeof n==='object'):[];
        unread=Math.max(0,Math.floor(Number(data.unread_count)||0)); loaded=true;error='';
      } catch (e) {
        if (session!==current || token()!==current) return;
        error=e.name==='AbortError'?'Connection timed out. Please try again.':e.message;
      } finally {
        clearTimeout(timeout);
        if (activeRequest===request) { activeRequest=null;badge();render(); }
      }
    })();render();return request.promise;
  }
  async function read(body) {
    syncSession(); if (writing || activeRequest) return;
    const current=session;writing=true;error='';render();
    try {
      await api(body);
      if (session!==current || token()!==current) return;
      // Refresh from the server after PATCH. Never claim a failed write succeeded.
      await refresh();
    } catch (e) { if(session===current && token()===current)error=e.name==='AbortError' || e.name==='TimeoutError'?'Connection timed out. Please try again.':e.message; }
    finally { if(session===current){writing=false;badge();render();} }
  }
  function releaseScroll() { if(previousOverflow!==null){document.body.style.overflow=previousOverflow;previousOverflow=null;} }
  function close() { modal?.remove();modal=null;releaseScroll();badge();document.getElementById('lpNotify')?.focus(); }
  window.openLonerPayNotifications=()=>{
    syncSession(); if(modal?.isConnected)return;
    filter='all';modal=document.createElement('div');modal.className='lpInboxOverlay';
    modal.innerHTML='<section class="lpInbox" role="dialog" aria-modal="true" aria-labelledby="lpInboxTitle" tabindex="-1"></section>';
    previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    modal.addEventListener('click',event=>{
      if(event.target===modal)return close();
      const button=event.target.closest('button');if(!button || button.disabled)return;
      if(button.id==='lpInboxClose')close();
      else if(button.id==='lpInboxRefresh' || button.id==='lpInboxRetry')refresh();
      else if(button.id==='lpInboxReadAll')read({all:true});
      else if(button.dataset.read)read({id:button.dataset.read});
      else if(button.dataset.filter){filter=button.dataset.filter;render();}
    });
    document.body.append(modal);render();refresh();badge();modal.querySelector('.lpInbox').focus();
  };
  document.addEventListener('keydown',event=>{
    if(!modal?.isConnected)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const controls=[...modal.querySelectorAll('button:not([disabled])')],first=controls[0],last=controls.at(-1);
      if(event.shiftKey && (document.activeElement===first || document.activeElement===modal.querySelector('section'))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && (document.activeElement===last || document.activeElement===modal.querySelector('section'))){event.preventDefault();first?.focus();}
    }
  });
  document.addEventListener('click',event=>{if(event.target.closest?.('#lpNotify')){event.preventDefault();event.stopImmediatePropagation();window.openLonerPayNotifications();}},true);
  function init(){
    if(/profile\.html$/.test(location.pathname) && !document.getElementById('lpNotify')){
      const header=document.querySelector('.header');if(header){const b=document.createElement('button');b.id='lpNotify';b.type='button';b.textContent='Notifications';b.style.cssText='margin-left:auto;border:1px solid #d0a34d;background:#936514;color:#fff;padding:10px;border-radius:12px';header.append(b);}
    }
    // Dashboard's existing Back navigation owns overlay history. Release scroll
    // when it removes this panel, and re-adopt the panel on Forward navigation.
    new MutationObserver(()=>{
      const connected=document.querySelector('.lpInboxOverlay');
      if(modal && !modal.isConnected){modal=null;releaseScroll();badge();}
      if(!modal && connected){syncSession();modal=connected;previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';badge();render();refresh();}
      if(document.getElementById('lpNotify') && !document.querySelector('#lpNotify .lpInboxBadge'))badge();
    }).observe(document.body,{childList:true,subtree:true});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  setInterval(()=>{if(!document.hidden && !writing)refresh();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('storage',event=>{if(event.key==='lonerpay_access_token' || event.key===null){syncSession();badge();render();refresh();}});
})();

