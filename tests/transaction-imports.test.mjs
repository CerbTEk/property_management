import {test} from 'node:test';import assert from 'node:assert/strict';import {parseTransactionCsv,transactionMapping,previewTransactionImport} from '../src/transaction-imports.mjs';
const header='transaction_id,booking_id,guest,arrival,departure,guests,kind,amount,currency,occurred_on,method,reference,parent_transaction_id\n',pay='P1,B1,Guest,2026-11-01,2026-11-03,2,payment,200.01,USD,2026-10-01,channel,Pay-ref,',refund='R1,B1,Guest,2026-11-01,2026-11-03,2,refund,50,USD,2026-10-02,channel,Refund-ref,P1';
const booking={id:'b',property_id:'p',kind:'booking',status:'confirmed',guest:'Guest',arrival:'2026-11-01',departure:'2026-11-03',guests:2},link={reservation_id:'b',property_id:'p',source:'uplisting',external_id:'B1'};
const preview=(text=pay,bookings=[booking],links=[link],entries=[],receipts=[])=>{const csv=parseTransactionCsv(header+text);return previewTransactionImport(csv,transactionMapping(csv.headers),{id:'p'},'uplisting',bookings,links,entries,receipts,'2026-10-07');};
test('payment/refund preview orders dependencies, preserves exact cents and rejects cumulative over-refunds',()=>{
 const p=preview(refund+'\n'+pay);assert.equal(p.added,2);assert.equal(p.paymentCents,20001);assert.equal(p.refundCents,5000);assert.equal(p.rows[0].record.kind,'refund');
 assert.equal(preview(refund).errors,1);assert.equal(preview(pay+'\n'+refund+'\n'+refund.replace('R1','R2').replace('50','160').replace('Refund-ref','Second-ref')).errors,1);
 assert.equal(preview(pay+'\n'+refund.replace('2026-10-02','2026-09-30')).errors,1);assert.equal(preview(pay+'\n'+refund.replace('B1','B2'),[booking],[link]).errors,1);
 for(const bad of [pay.replace('200.01','0'),pay.replace('200.01','1.001'),pay.replace('USD','EUR'),pay.replace('2026-10-01','2026-10-08'),pay.replace('payment','pending'),pay.replace('channel','card'),pay.replace('Guest','Changed'),pay.replace(',2,payment',',1,payment'),pay+'PARENT'])assert.equal(preview(bad).errors,1);
 assert.equal(preview(pay+'\n'+pay).errors,1);assert.equal(preview(pay+'\n'+pay.replace('P1','P2').replace('Pay-ref','pay-REF')).errors,1);
});
test('repeat imports preserve corrections/cancellations and new refunds can reference a prior imported payment',()=>{
 const record=preview().rows[0].record,entry={id:'t',booking_id:'b',kind:'payment',amount_cents:20001,occurred_on:'2026-10-01',reference:'Pay-ref',sequence:1},receipt={source:'uplisting',external_id:'P1',property_id:'p',booking_id:'b',transaction_id:'t',snapshot:record};
 assert.equal(preview(refund,[{...booking,status:'cancelled'}],[link],[entry],[receipt]).added,1);
 assert.equal(preview(pay,[{...booking,status:'cancelled',guest:'Later edit'}],[link],[entry,{id:'rev',booking_id:'b',kind:'reversal',related_id:'t'}],[receipt]).skipped,1);
 assert.equal(preview(pay.replace('200.01','210.01'),[booking],[link],[entry],[receipt]).errors,1);
 assert.equal(preview(refund,[booking],[link],[entry],[]).errors,1);assert.equal(preview(pay,[{...booking,status:'cancelled'}]).errors,1);
 assert.equal(preview(refund,[booking],[link],[entry,{id:'manual',booking_id:'b',kind:'payment'}],[receipt]).errors,1);
 const csv=parseTransactionCsv(header+pay);assert.throws(()=>previewTransactionImport(csv,{}, {id:'p'},'uplisting'),/Map/);
});
