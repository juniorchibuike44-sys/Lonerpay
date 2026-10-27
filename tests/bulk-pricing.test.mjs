import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkQuote} from '../api/_bulk-pricing.js';
test('cashback is separate from cash margin and cannot rescue an unsafe offer', () => {
  const q = bulkQuote({cost: 270, price: 269, quantity: 10, estimatedCashbackPercent: 2});
  assert.equal(q.margin_before_cashback, -10);
  assert.equal(q.estimated_cashback, 54);
  assert.equal(q.estimated_margin_with_cashback, 44);
  assert.equal(q.covers_costs_and_minimum_margin, false);
  assert.equal(q.checkout_enabled, false);
});
test('fees and minimum margin determine the price floor', () => {
  const q = bulkQuote({cost: 270, price: 275, quantity: 10, feeReserve: 2, minimumMargin: 3, estimatedCashbackPercent: 2});
  assert.equal(q.minimum_unit_price, 275);
  assert.equal(q.margin_before_cashback, 30);
  assert.equal(q.covers_costs_and_minimum_margin, true);
});
test('rounds each transaction cashback before summing', () => {
  assert.equal(bulkQuote({cost: .26, price: 1, quantity: 10, estimatedCashbackPercent: 2}).estimated_cashback, .1);
});
test('rejects invalid money, quantity and assumed rates', () => {
  for (const overrides of [{price: -1}, {cost: NaN}, {quantity: 1.1}, {quantity: 1001}, {estimatedCashbackPercent: 100}, {feeReserve: -1}, {minimumMargin: '3'}]) assert.throws(() => bulkQuote({cost: 270, price: 275, quantity: 10, ...overrides}));
});
