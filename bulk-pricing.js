(() => {
  const form = document.getElementById('quoteForm'), status = document.getElementById('status'), result = document.getElementById('result');
  const money = n => new Intl.NumberFormat('en-NG', {style: 'currency', currency: 'NGN'}).format(n);
  let busy = false;
  form.addEventListener('input', () => { result.hidden = true; status.textContent = ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; result.hidden = true; status.textContent = 'Checking the current plan price…';
    const button = form.querySelector('button'); button.disabled = true;
    const b = Object.fromEntries(new FormData(form));
    for (const key of ['quantity','price','feeReserve','minimumMargin','estimatedCashbackPercent']) b[key] = Number(b[key]);
    const submitted = JSON.stringify(b);
    try {
      const response = await window.lpBusinessSession.request('/api/bulk-pricing', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: submitted});
      const d = await response.json(); if (!response.ok) throw Error(d.error || 'Could not check pricing');
      const current = Object.fromEntries(new FormData(form));
      for (const key of ['quantity','price','feeReserve','minimumMargin','estimatedCashbackPercent']) current[key] = Number(current[key]);
      if (JSON.stringify(current) !== submitted) { status.textContent = 'Your inputs changed. Check the price again.'; return; }
      document.getElementById('planName').textContent = d.plan_name;
      document.getElementById('decision').textContent = d.covers_costs_and_minimum_margin ? 'This price covers the provider cost, entered fee reserve and minimum margin without cashback.' : 'This price does not cover the provider cost, entered fee reserve and minimum margin. Raise the buyer price.';
      const figures = document.getElementById('figures'); figures.replaceChildren();
      const rows = [['Provider cost per purchase', d.unit_cost], ['Minimum buyer price per purchase', d.minimum_unit_price], ['Buyer pays in total', d.total_price], ['Provider cost in total', d.total_provider_cost], ['Fee reserve in total', d.total_fee_reserve], ['Margin after fee reserve, before cashback', d.margin_before_cashback], ['Estimated cashback · unconfirmed', d.estimated_cashback], ['Estimated margin including cashback', d.estimated_margin_with_cashback]];
      for (const [label, value] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = money(value); figures.append(dt, dd); }
      status.textContent = 'Quote checked at ' + new Date(d.generated_at).toLocaleTimeString('en-NG') + '. Recheck before setting an offer.'; result.hidden = false;
    } catch (e) { status.textContent = e.message; }
    finally { busy = false; button.disabled = false; }
  });
})();
