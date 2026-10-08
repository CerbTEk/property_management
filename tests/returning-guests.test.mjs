import {test} from 'node:test';
import assert from 'node:assert/strict';
import {returningGuests} from '../src/returning-guests.mjs';
const property={id:'p',owner_id:'a',timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00'};
const profiles=[{id:'g',owner_id:'a'},{id:'other',owner_id:'a'},{id:'foreign',owner_id:'b'}];
const prior={id:'old',guest_id:'g',property_id:'p',owner_id:'a',guest:'Josh Kennedy',guest_phone_last4:'1234',arrival:'2026-10-01',departure:'2026-10-03',status:'confirmed'};
const next={...prior,id:'new',arrival:'2026-10-10',departure:'2026-10-12'};
const now=Date.parse('2026-10-08T18:00:00Z');
const run=reservations=>returningGuests({properties:[property,{...property,id:'q'}],guestProfiles:profiles,reservations},'a',now);
test('returning badge follows saved profile history across owned properties',()=>{
 const result=run([prior,{...next,property_id:'q',guest:' JOSH   Kennedy '}]);
 assert.deepEqual(result.get('new'),{count:1,lastDeparture:'2026-10-03'});assert.equal(result.has('old'),false);
});
test('names and suffixes never merge profiles; cancelled, foreign and blocked records never match',()=>{
 for(const change of [{guest_id:'other'},{guest_id:null},{guest_id:'foreign'},{status:'cancelled'},{owner_id:'b'},{kind:'block'},{departure:'invalid'}])assert.equal(run([{...prior,...change},next]).size,0);
});
test('only prior ended stays count; checkout is exclusive and future history is excluded',()=>{
 const data={properties:[property],guestProfiles:profiles,reservations:[prior,next]};
 assert.equal(returningGuests(data,'a',Date.parse('2026-10-03T14:59:59Z')).size,0);
 assert.equal(returningGuests(data,'a',Date.parse('2026-10-03T15:00:00Z')).get('new').count,1);
 const mid={...prior,id:'mid',arrival:'2026-10-04',departure:'2026-10-06'};
 assert.equal(run([next,mid,prior]).get('new').count,2);assert.equal(run([next,mid,prior]).get('mid').count,1);
 assert.equal(run([{...prior,id:'g',guest_id:null},next]).get('new').count,1);
});
