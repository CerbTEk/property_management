import {test} from 'node:test';import assert from 'node:assert/strict';import {parseFinancialCsv,financialMapping,previewFinancialImport} from '../src/financial-imports.mjs';
const header='external_id,guest,arrival,departure,guests,currency,accommodation,discount,cleaning,extra_guest,other_fee,tax,channel_fee\n',line='B1,Guest,2026-11-01,2026-11-03,2,USD,200.01,10,20,5,0,15,9';
const property={id:'p'},booking={id:'b',property_id:'p',kind:'booking',status:'confirmed',guest:'Guest',arrival:'2026-11-01',departure:'2026-11-03',guests:2},link={reservation_id:'b',property_id:'p',source:'uplisting',external_id:'B1'};
const preview=(text=line,bookings=[booking],links=[link],financials=[],receipts=[])=>{const csv=parseFinancialCsv(header+text);return previewFinancialImport(csv,financialMapping(csv.headers),property,'uplisting',bookings,links,financials,receipts);};
test('charge CSV preserves cents, separates host fees and requires every amount, currency and booking identity',()=>{
 const p=preview();assert.equal(p.added,1);assert.equal(p.totalCents,23001);assert.equal(p.rows[0].record.amounts.accommodation_cents,20001);
 for(const bad of [line.replace('USD','EUR'),line.replace('200.01','200.001'),line.replace(',10,',',201,'),line.replace(',10,',',-10,'),line.replace(',9',',300'),line.replace(',0,',',,'),line.replace('Guest','Changed'),line.replace('2026-11-03','2026-11-04'),line.replace(',2,USD',',1,USD'),line.replace('2026-11-01','2026-02-30')])assert.equal(preview(bad).errors,1);
 assert.equal(preview(line,[],[]).errors,1);assert.equal(preview(line,[{...booking,status:'cancelled'}]).errors,1);assert.equal(preview(line,[booking],[{...link,property_id:'foreign'}]).errors,1);assert.equal(preview(line,[booking],[link],[{reservation_id:'b'}]).errors,1);
 const csv=parseFinancialCsv(header+line);assert.throws(()=>previewFinancialImport(csv,{},property,'uplisting'),/Map/);assert.throws(()=>previewFinancialImport(csv,{...financialMapping(csv.headers),tax:'discount'},property,'uplisting'),/only one/);
});
test('replay uses deep canonical snapshots and never replaces newer charge history or cancelled bookings',()=>{
 const record=preview().rows[0].record,reordered={...record,amounts:Object.fromEntries(Object.entries(record.amounts).reverse())},receipt={source:'uplisting',external_id:'B1',property_id:'p',reservation_id:'b',snapshot:reordered};
 assert.equal(preview(line,[{...booking,status:'cancelled',guest:'Later edit'}],[link],[{reservation_id:'b',revision:2}],[receipt]).skipped,1);
 assert.equal(preview(line.replace('200.01','210.01'),[booking],[link],[],[receipt]).errors,1);
 assert.equal(preview(line,[booking],[link],[],[{...receipt,reservation_id:'foreign'}]).errors,1);
 assert.equal(preview(line+'\n'+line).errors,1);
});
