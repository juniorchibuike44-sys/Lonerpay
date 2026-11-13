/* Optional funding pilot. Existing funding actions are deliberately preserved until cutover. */
(function () {
  'use strict';
  const token = () => localStorage.getItem('lonerpay_access_token');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let overlay, timer, originalFocus, controller, primaryView = false, accessCache;
  function close() {
    controller?.abort(); clearInterval(timer); overlay?.remove(); overlay = null;
    document.removeEventListener('keydown', keydown); originalFocus?.focus();
  }
  function keydown(e) {
    if (e.key === 'Escape') close();
    if (e.key !== 'Tab' || !overlay) return;
    const focusable = [...overlay.querySelectorAll('button,input,select,a[href]')].filter(x => !x.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  async function request(path, session, body, signal) {
    if (!session || token() !== session) throw Error('Please log in again.');
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + session, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: signal || AbortSignal.timeout(45000)
    });
    const data = await response.json();
    if (token() !== session) throw Error('Your session changed. Please log in again.');
    if (!response.ok) throw Error(data.error || 'Unable to complete this request.');
    return data;
  }
  function render(content) {
    if (!overlay) return;
    overlay.innerHTML = `<section class="lp-mnf-card" role="dialog" aria-modal="true" aria-labelledby="lpMnfTitle"><header><h2 id="lpMnfTitle">${primaryView ? 'Fund Wallet' : 'Monnify funding test'}</h2><button type="button" id="lpMnfClose" aria-label="Close funding">✕</button></header>${content}</section>`;
    overlay.querySelector('#lpMnfClose').onclick = close;
    overlay.querySelector('#lpMnfClose').focus();
  }
  const terms = '<p class="lp-mnf-muted">Your balance is a non-interest-bearing advance payment for airtime, data, electricity and TV purchases only. It cannot be withdrawn or transferred. Betting, third-party payouts and other services are excluded from this test.</p>';
  function showAccount(account, session) {
    render(`<p>Your Monnify account is ready. This is a different account from your previous funding account.</p>${account.accounts.map(a => `<div class="lp-mnf-bank"><small>${escape(a.bank_name)}</small><strong>${escape(a.account_number)}</strong><span>${escape(a.account_name)}</span><button type="button" data-copy="${escape(a.account_number)}">Copy account number</button></div>`).join('')}${terms}<p class="lp-mnf-muted">Confirm the account name in your banking app. Use a small test amount first. A bank debit alone does not confirm a LonerPay credit.</p><button type="button" id="lpMnfRefresh">Check wallet balance</button><p id="lpMnfStatus" role="status" aria-live="polite"></p>`);
    overlay.querySelectorAll('[data-copy]').forEach(button => button.onclick = async () => {
      try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied'; }
      catch { button.textContent = 'Select and copy the account number above'; }
    });
    overlay.querySelector('#lpMnfRefresh').onclick = async () => {
      const button = overlay.querySelector('#lpMnfRefresh'), status = overlay.querySelector('#lpMnfStatus');
      button.disabled = true; status.textContent = 'Checking your confirmed wallet balance…';
      try {
        const result = await request('/api/wallet', session, undefined, controller.signal);
        if (!overlay) return;
        const value = Number(result.balance ?? result.wallet?.balance);
        if (!Number.isFinite(value)) throw Error('Balance could not be loaded. Check your transaction history.');
        status.textContent = `Confirmed wallet balance: ₦${value.toLocaleString('en-NG', {minimumFractionDigits:2,maximumFractionDigits:2})}. Check Transaction History for the matching funding reference.`;
        window.loadSecureWallet?.();
      } catch (e) { if (overlay) status.textContent = e.message; }
      finally { if (overlay) button.disabled = false; }
    };
  }
  function showForm(session) {
    render(`<p>Connect your verified identity to create your dedicated funding account.</p><form id="lpMnfForm"><label>Full legal name<input name="full_name" required minlength="3" maxlength="100" autocomplete="name"></label><label>Identity document<select name="identity_type"><option value="bvn">BVN</option><option value="nin">NIN</option></select></label><label>BVN or NIN<input name="identity_number" type="password" inputmode="numeric" autocomplete="off" required pattern="[0-9]{11}" minlength="11" maxlength="11"></label><label class="lp-mnf-consent"><input name="consent" type="checkbox" required><span>I consent to LonerPay securely sending my name, email and BVN or NIN to Monnify for identity verification and account creation.</span></label>${terms}<p class="lp-mnf-muted">Your BVN or NIN is not saved by this form. Never send it to support in a message.</p><p id="lpMnfStatus" role="status" aria-live="polite"></p><button type="submit">Create funding account</button></form>`);
    const form = overlay.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault(); if (!form.reportValidity()) return;
      const button = form.querySelector('button'), status = form.querySelector('[role=status]');
      button.disabled = true; status.textContent = 'Verifying and creating your account…';
      const number = form.elements.identity_number.value;
      form.elements.identity_number.value = '';
      try {
        const result = await request('/api/monnify-account', session, { full_name: form.elements.full_name.value.trim(), [form.elements.identity_type.value]: number, consent: form.elements.consent.checked }, controller.signal);
        if (form.isConnected) showAccount(result.account, session);
      } catch (error) { if (form.isConnected) { status.textContent = error.message; button.disabled = false; } }
    };
  }
  async function open() {
    close(); originalFocus = document.activeElement;
    const session = token(); if (!session) return;
    controller = new AbortController();
    overlay = document.createElement('div'); overlay.id = 'lpMonnifyOverlay';
    const view = overlay;
    overlay.className = 'lp-mnf-overlay'; document.body.appendChild(overlay);
    document.addEventListener('keydown', keydown);
    timer = setInterval(() => { if (token() !== session) close(); }, 500);
    render('<p role="status">Checking your Monnify connection…</p>');
    try {
      const result = await request('/api/monnify-account', session, undefined, controller.signal);
      if (overlay !== view) return;
      if (result.account?.accounts?.length) showAccount(result.account, session); else showForm(session);
    } catch (error) {
      if (overlay === view) render(`<p role="alert">${escape(error.message)}</p><p>No payment has been requested. Close this screen and try again later.</p>`);
    }
  }
  function fundingAccess(session) {
    if (!accessCache || accessCache.session !== session || Date.now() - accessCache.time > 30000) {
      const record = { session, time: Date.now() };
      record.promise = request('/api/monnify-access', session).catch(error => { if (accessCache === record) accessCache = null; throw error; });
      accessCache = record;
    }
    return accessCache.promise;
  }
  // Every entry point chooses its provider on the server, including voice actions.
  for (const name of ['openFundWallet', 'addDemoFunds', 'openVirtualAccount']) {
    const legacy = window[name];
    window[name] = async function (...args) {
      const session = token();
      if (!session) return;
      try {
        const access = await fundingAccess(session);
        if (token() !== session) return;
        if (access.primary) {
          if (!access.available) throw Error('Bank transfer funding is temporarily unavailable. Please try again shortly.');
          primaryView = true; return open();
        }
        return legacy?.apply(this, args);
      } catch { window.alert('Unable to check your funding provider. Please try again shortly.'); }
    };
  }
  async function install() {
    const session = token(); if (!session) return;
    try {
      const access = await fundingAccess(session);
      if (!access.available || token() !== session || document.getElementById('lpMonnifyPilot')) return;
      const balance = document.querySelector('.balance'); if (!balance) return;
      if (access.primary) {
        primaryView = true;
        const hint = document.querySelector('.lp-virtual-account-hint');
        if (hint) hint.textContent = 'Your funding provider is now Monnify. Use Fund Wallet to view or create your new account. Your existing balance is unchanged.';
        document.querySelectorAll('.service').forEach(card => {
          if (/^(Education|Recharge Cards)$/i.test(card.querySelector('h3')?.textContent.trim() || '')) card.classList.add('lp-primary-restricted');
        });
        if (location.hash === '#fund-wallet') { history.replaceState(null, '', location.pathname + location.search); open(); }
        return;
      }
      const button = document.createElement('button'); button.id = 'lpMonnifyPilot'; button.type = 'button'; button.className = 'lp-mnf-pilot';
      button.textContent = access.pilot ? 'Test Monnify funding' : 'Fund by bank transfer'; button.onclick = open;
      balance.appendChild(button);
    } catch { /* Existing funding remains usable if pilot discovery is unavailable. */ }
  }
  window.addEventListener('storage', e => { if (e.key === 'lonerpay_access_token') { close(); document.getElementById('lpMonnifyPilot')?.remove(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
})();
