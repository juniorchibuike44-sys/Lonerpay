// A refund debit and its matching refund credit describe the same returned money.
// Count credits once; include old refunded debits only when no credit is present.
export function refundEntries(activity) {
  const credits = activity.filter(x => x.transaction_type === 'refund' && x.status === 'successful');
  const originals = new Set(credits.map(x => String(x.reference || '').replace(/:refund$/, '')));
  return [...credits, ...activity.filter(x => x.transaction_type === 'debit' && x.status === 'refunded' && !originals.has(String(x.reference || '')))];
}
export function earningsCoverage(finance) {
  return {
    confirmed_net_profit: null,
    provider_cashback_status: 'not_reconciled',
    wallet_funding_fees_status: 'not_reconciled',
    missing_provider_costs: finance ? Number(finance.unpriced_sales || 0) : null,
    note: 'Recorded service margin excludes separate provider cashback, wallet-funding fees and operating expenses. Estimated cashback is not confirmed earnings. Moving commission between balances is not new income.'
  };
}
