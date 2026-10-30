/* Progress describes the request without implying delivery before confirmation. */
(() => {
  function render(host, stage, type) {
    if (!host) return;
    const labels = [
      ['Payment', 'Your purchase request is being sent securely.'],
      ['Processing', 'Waiting for the provider to confirm your purchase.'],
      ['Successful', `Your ${type} purchase has been confirmed.`]
    ];
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.style.cssText = 'text-align:left;margin:16px 0;padding:14px;background:#faf7ef;border:1px solid #eadfca;border-radius:16px';
    host.innerHTML = labels.map(([title, description], i) => {
      const done = i < stage || (stage === 2 && i === 2);
      const active = i === stage && stage !== 2;
      const mark = done ? '✓' : String(i + 1);
      const color = done ? '#168353' : active ? '#9a6b19' : '#9ca3af';
      return `<div style="display:flex;gap:11px;align-items:flex-start;padding:7px 0;color:${color}"><span style="flex:none;width:25px;height:25px;border-radius:50%;border:1px solid currentColor;display:grid;place-items:center;font-weight:700;font-size:12px">${mark}</span><div><strong style="font-size:14px">${title}</strong><div style="font-size:12px;line-height:1.45;color:#667085">${description}</div></div></div>`;
    }).join('');
  }
  window.LonerPayPurchaseProgress = { render };
})();
