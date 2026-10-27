// Quotes only: estimated cashback never changes a wallet or recorded profit.
function kobo(value, name, allowZero = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || value > 1000000) throw Error(`Invalid ${name}`);
  return Math.round(value * 100);
}
export function bulkQuote({cost, price, quantity, feeReserve = 0, minimumMargin = 0, estimatedCashbackPercent = 0}) {
  const c = kobo(cost, 'provider cost'), p = kobo(price, 'buyer price');
  const fees = kobo(feeReserve, 'fee reserve', true), margin = kobo(minimumMargin, 'minimum margin', true);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw Error('Quantity must be between 1 and 1000');
  if (![0, 2, 3, 5].includes(estimatedCashbackPercent)) throw Error('Choose a supported estimated cashback rate');
  // Round per transaction, then total: bulk purchases consist of separate orders.
  const cashback = Math.round(c * estimatedCashbackPercent / 100);
  const cashMargin = p - c - fees;
  return {
    quantity, unit_cost: c / 100, unit_price: p / 100,
    unit_fee_reserve: fees / 100, unit_minimum_margin: margin / 100,
    minimum_unit_price: (c + fees + margin) / 100,
    total_price: p * quantity / 100, total_provider_cost: c * quantity / 100,
    total_fee_reserve: fees * quantity / 100,
    margin_before_cashback: cashMargin * quantity / 100,
    estimated_cashback_percent: estimatedCashbackPercent,
    estimated_cashback: cashback * quantity / 100,
    estimated_margin_with_cashback: (cashMargin + cashback) * quantity / 100,
    covers_costs_and_minimum_margin: cashMargin >= margin,
    cashback_status: 'unconfirmed_estimate', checkout_enabled: false
  };
}
