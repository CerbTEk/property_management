import {test} from 'node:test';import assert from 'node:assert/strict';import {parsePropertyCsv,propertyMapping,previewPropertyImport,listingSnapshot} from '../src/property-imports.mjs';
const header='external_id,name,timezone,currency,weekday,weekend,markup,max_guests,min_stay,check_in,check_out\n',line='L1,Listing,America/New_York,USD,56.01,70,18.34,2,1,15:00,11:00';
const preview=(text=line,properties=[],receipts=[],targets={})=>{const csv=parsePropertyCsv(header+text);return previewPropertyImport(csv,propertyMapping(csv.headers),'uplisting',properties,receipts,targets);};
test('listing CSV validates precise prices, currency, timezone, times and occupancy without inferring missing settings',()=>{
 const r=preview();assert.equal(r.created,1);assert.equal(r.rows[0].record.weekday_cents,5601);assert.equal(r.rows[0].record.markup_percent,18.34);
 for(const text of [line.replace('USD','EUR'),line.replace('America/New_York','Invalid/Zone'),line.replace('56.01','56.001'),line.replace('56.01','0.99'),line.replace('18.34','100.01'),line.replace(',2,1,',',1.5,1,'),line.replace(',2,1,',',2,366,'),line.replace('15:00','3:00'),line.replace('11:00','24:00')])assert.equal(preview(text).errors,1);
 const csv=parsePropertyCsv(header+line);assert.throws(()=>previewPropertyImport(csv,{},'uplisting'),/Map/);assert.throws(()=>previewPropertyImport(csv,{...propertyMapping(csv.headers),name:'external_id'},'uplisting'),/only one/);assert.throws(()=>parsePropertyCsv(header+Array(51).fill(line).join('\n')),/50 listings/);
});
test('listing imports flag duplicates and only link exactly matching settings, retaining edited live listings on replay',()=>{
 const record=preview().rows[0].record,p={...record,id:'p',check_in:'15:00:00',check_out:'11:00:00'};delete p.external_id;delete p.currency;
 assert.deepEqual(listingSnapshot(p,'L1'),record);assert.equal(preview(line,[p]).errors,1);assert.equal(preview(line,[p],[],{L1:'p'}).linked,1);
 assert.equal(preview(line,[{...p,weekday_cents:6000}],[],{L1:'p'}).errors,1);assert.equal(preview(line,[{...p,check_in:'15:00:30'}],[],{L1:'p'}).errors,1);assert.equal(preview(line,[p],[],{L1:'foreign'}).errors,1);
 const receipt={source:'uplisting',external_id:'L1',property_id:'p',snapshot:record};assert.equal(preview(line,[{...p,name:'Later edited'}],[receipt]).skipped,1);assert.equal(preview(line.replace('56.01','60'),[p],[receipt]).errors,1);assert.equal(preview(line,[p],[receipt],{L1:'foreign'}).errors,1);
 assert.equal(preview(line+'\n'+line).errors,1);assert.equal(preview(line+'\n'+line.replace('L1','L2')).errors,1);assert.equal(preview(line+'\n'+line.replace('L1','L2').replace('Listing','Second')).created,2);
 assert.equal(preview(line+'\n'+line.replace('L1','L2'),[p],[],{L1:'p',L2:'p'}).errors,1);
});
