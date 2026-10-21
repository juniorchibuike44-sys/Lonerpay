(() => {
  // This is a recipient convenience only; it never changes the account profile.
  // Keep personal information in this page's memory, scoped to its login token.
  let session = null, phone = '', pending = null, checked = false;
  const attached = new Set();
  const token = () => localStorage.getItem('lonerpay_access_token') || '';
  function normalise(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00234')) digits = '0' + digits.slice(5);
    else if (digits.startsWith('234') && digits.length === 13) digits = '0' + digits.slice(3);
    else if (digits.length === 10 && /^[789]/.test(digits)) digits = '0' + digits;
    return /^0[789]\d{9}$/.test(digits) ? digits : '';
  }
  function current() {
    const next = token();
    if (next !== session) {
      for (const reset of attached) reset();
      attached.clear();
      session = next; phone = ''; pending = null; checked = false;
      // Login metadata gives a synchronous default while the profile is read.
      // No authentication/payment decision relies on decoding this value.
      try {
        const part = next.split('.')[1];
        const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        phone = normalise(claims.user_metadata?.phone || claims.phone);
      } catch (_) {}
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
  function attach(input) {
    if (!input || input.dataset.accountPhoneAttached) return;
    input.dataset.accountPhoneAttached = '1';
    current();
    const requested = session;
    let edited = false, supplied = '';
    attached.add(() => { edited = true; if (input.isConnected) input.value = ''; });
    input.addEventListener('input', () => { edited = true; });
    const fill = value => {
      if (!input.isConnected || !requested || token() !== requested || edited) return;
      if (input.value && input.value !== supplied) return;
      input.value = value; supplied = value;
    };
    fill(phone);
    load().then(value => fill(value));
  }
  window.LonerPayRecipientPhone = Object.freeze({attach,normalise});
  window.addEventListener('storage', event => { if (event.key === 'lonerpay_access_token' || event.key === null) { current(); load(); } });
  load();
})();
