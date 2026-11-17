(() => {
  // Recipient convenience only; it never changes the account profile.
  // Recent recipients stay on this device and are separated by signed-in user ID.
  let session = null, userId = '', phone = '', pending = null, checked = false;
  const attached = new Set(), maxRecent = 8;
  const token = () => localStorage.getItem('lonerpay_access_token') || '';
  function normalise(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00234')) digits = '0' + digits.slice(5);
    else if (digits.startsWith('234') && digits.length === 13) digits = '0' + digits.slice(3);
    else if (digits.length === 10 && /^[789]/.test(digits)) digits = '0' + digits;
    return /^0[789]\d{9}$/.test(digits) ? digits : '';
  }
  function claims(value) {
    try {
      const part = value.split('.')[1];
      return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    } catch (_) { return {}; }
  }
  const recentKey = () => userId ? 'lonerpay_recent_recipients_' + userId : '';
  function recent() {
    const key = recentKey(); if (!key) return [];
    try {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(list) ? list.map(normalise).filter(Boolean).slice(0, maxRecent) : [];
    } catch (_) { return []; }
  }
  function remember(value) {
    current();
    const number = normalise(value), key = recentKey();
    if (!number || !key) return false;
    const next = [number, ...recent().filter(item => item !== number)].slice(0, maxRecent);
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('lonerpay:recipients-updated', {detail:{number}}));
    return true;
  }
  function current() {
    const next = token();
    if (next !== session) {
      for (const reset of attached) reset();
      attached.clear();
      session = next; phone = ''; pending = null; checked = false;
      const data = claims(next); userId = String(data.sub || '');
      phone = normalise(data.user_metadata?.phone || data.phone);
    }
    return phone;
  }
  function load() {
    current();
    if (!session || checked) return Promise.resolve(phone);
    if (pending) return pending;
    const requested = session;
    const request = (async () => {
      try {
        const response = await fetch('/api/profile', {headers:{Authorization:'Bearer '+requested},cache:'no-store',signal:AbortSignal.timeout(8000)});
        if (!response.ok) return current();
        const profile = await response.json();
        if (token() !== requested || session !== requested) return '';
        phone = normalise(profile.phone); checked = true;
        return phone;
      } catch (_) { return token() === requested && session === requested ? phone : ''; }
      finally { if (session === requested) pending = null; }
    })();
    pending = request;
    return request;
  }
  function ensureStyle() {
    if (document.getElementById('lp-recipient-suggestions-style')) return;
    const style = document.createElement('style'); style.id = 'lp-recipient-suggestions-style';
    style.textContent = '.lp-recipient-suggestions{display:none;margin:7px 0 2px;padding:6px;background:#fff;border:1px solid #dde5ed;border-radius:13px;box-shadow:0 10px 24px rgba(20,45,65,.10);position:relative;z-index:4}.lp-recipient-suggestions.show{display:grid;gap:3px}.lp-recipient-suggestion{border:0;background:#f6f8fa;color:#263f50;border-radius:10px;padding:11px 12px;text-align:left;font-size:14px;font-weight:700;letter-spacing:.03em}.lp-recipient-suggestion:active{background:#f3ecd9}.lp-recipient-suggestion small{display:block;color:#82909b;font-size:9px;font-weight:600;margin-top:3px;letter-spacing:0}';
    document.head.append(style);
  }
  function attach(input) {
    if (!input || input.dataset.accountPhoneAttached) return;
    input.dataset.accountPhoneAttached = '1'; ensureStyle(); current();
    const requested = session;
    let edited = false, supplied = '';
    const box = document.createElement('div'); box.className = 'lp-recipient-suggestions';
    box.setAttribute('role','listbox'); box.setAttribute('aria-label','Previously used phone numbers');
    input.insertAdjacentElement('afterend', box);
    const hide = () => { box.classList.remove('show'); box.replaceChildren(); };
    const show = () => {
      const query = String(input.value || '').replace(/\D/g,'');
      if (query.length < 3) return hide();
      const matches = recent().filter(number => number.startsWith(query) && number !== normalise(input.value)).slice(0,5);
      box.replaceChildren();
      matches.forEach(number => {
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'lp-recipient-suggestion'; button.setAttribute('role','option');
        button.innerHTML = number + '<small>Previously recharged</small>';
        button.addEventListener('pointerdown', event => event.preventDefault());
        button.onclick = () => {
          input.value = number; edited = true; hide(); input.dispatchEvent(new Event('input',{bubbles:true})); input.focus();
        };
        box.append(button);
      });
      box.classList.toggle('show', matches.length > 0);
    };
    const reset = () => { edited = true; hide(); if (input.isConnected) input.value = ''; };
    attached.add(reset);
    input.addEventListener('input', () => { edited = true; show(); });
    input.addEventListener('focus', show);
    input.addEventListener('blur', () => setTimeout(hide, 120));
    window.addEventListener('lonerpay:recipients-updated', show);
    const fill = value => {
      if (!input.isConnected || !requested || token() !== requested || edited) return;
      if (input.value && input.value !== supplied) return;
      input.value = value; supplied = value;
    };
    fill(phone);
    load().then(value => fill(value));
  }
  window.LonerPayRecipientPhone = Object.freeze({attach,normalise,remember,recent});
  window.addEventListener('storage', event => { if (event.key === 'lonerpay_access_token' || event.key === null) { current(); load(); } });
  load();
})();