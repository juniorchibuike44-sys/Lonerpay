import test from 'node:test';
import assert from 'node:assert/strict';
import {refundEntries,earningsCoverage} from '../api/_earnings-report.js';
test('refund totals include the returned money once rather than debit and credit',()=>{
 const rows=[{reference:'a',transaction_type:'debit',status:'refunded',amount:100},{reference:'a:refund',transaction_type:'refund',status:'successful',amount:100},{reference:'b',transaction_type:'debit',status:'refunded',amount:50}];
 assert.equal(refundEntries(rows).reduce((s,x)=>s+x.amount,0),150);
});
test('pending and failed refund records do not count as returned money',()=>{
 assert.equal(refundEntries([{reference:'x:refund',transaction_type:'refund',status:'pending',amount:100}]).length,0);
});
test('partial margins cannot become confirmed net profit or cashback income',()=>{
 const c=earningsCoverage({recorded_profit:1000,unpriced_sales:84});
 assert.equal(c.confirmed_net_profit,null);assert.equal(c.missing_provider_costs,84);
 assert.equal(c.provider_cashback_status,'not_reconciled');assert.equal(c.wallet_funding_fees_status,'not_reconciled');
 assert.equal(earningsCoverage(null).missing_provider_costs,null);
});
