import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseBookingCsv,suggestMapping,previewBookingImport} from '../src/booking-imports.mjs';
const header='external_id,guest,arrival,departure,guests,status,phone,note\n',line='B1,Guest,2026-11-01,2026-11-03,2,confirmed,+1 555 555 0123,Note',property={id:'p',max_guests:2,min_stay:1};
const preview=(text=line,bookings=[],receipts=[])=>{const csv=parseBookingCsv(header+text);return previewBookingImport(csv,suggestMapping(csv.headers),property,'uplisting',bookings,receipts);};
test('CSV parser supports BOM, escaped quotes, commas, embedded CRLF and rejects malformed/oversized files',()=>{
 const csv=parseBookingCsv('\uFEFFa,b\r\n"Guest, \"\"J\"\"","one\r\ntwo"\r\n');assert.deepEqual(csv,{headers:['a','b'],rows:[['Guest, "J"','one\r\ntwo']]});
 for(const input of ['a,b\n"open,b','a,b\n"a"x,b','a,b\na"b,c','a,a\nx,y','a,b\nx','a,b\n','x'.repeat(524289),'a\n'+Array(201).fill('x').join('\n')])assert.throws(()=>parseBookingCsv(input));
});
test('preview normalizes status and retains full phone plus suffix, with capacity and strict date validation',()=>{
 const p=preview();assert.equal(p.added,1);assert.equal(p.rows[0].record.guest_phone_last4,'0123');assert.equal('phone' in p.rows[0].record,false);
 assert.equal(p.rows[0].record.guest_phone,'+15555550123');
 assert.equal(preview(line.replace('confirmed','canceled')).rows[0].record.status,'cancelled');
 for(const bad of [line.replace('2026-11-01','2026-02-30'),line.replace(',2,',',3,'),line.replace(',2,',',1.5,'),line.replace('confirmed','pending'),line.replace('+1 555 555 0123','0123')])assert.equal(preview(bad).errors,1);
 const csv=parseBookingCsv(header+line);assert.throws(()=>previewBookingImport(csv,{},property,'uplisting'),/Map/);assert.throws(()=>previewBookingImport(csv,{...suggestMapping(csv.headers),guest:'external_id'},property,'uplisting'),/only one/);
});
test('imports detect duplicates, changed original IDs, calendar blocks, batch overlaps and permit checkout turnover',()=>{
 const first=preview().rows[0].record,receipts=[{property_id:'p',source:'uplisting',external_id:'B1',snapshot:first}];
 assert.equal(preview(line,[],receipts).skipped,1);assert.equal(preview(line.replace('Guest','Changed'),[],receipts).errors,1);
 assert.equal(preview(line,[],[{...receipts[0],property_id:'foreign'}]).errors,1);
 assert.equal(preview(line+'\n'+line).errors,1);
 const block={property_id:'p',kind:'block',status:'blocked',arrival:'2026-11-02',departure:'2026-11-04'};
 assert.equal(preview(line,[block]).errors,1);assert.equal(preview(line.replace('confirmed','cancelled'),[block]).added,1);
 assert.equal(preview(line+'\n'+line.replace('B1','B2').replace('Guest','Other')).errors,1);
 assert.equal(preview(line+'\n'+line.replace('B1','B2').replace('Guest','Other').replace('2026-11-03','2026-11-05').replace('2026-11-01','2026-11-03')).added,2);
 assert.equal(preview(line,[{...first,property_id:'p',kind:'booking',status:'cancelled'}]).errors,1);
});
