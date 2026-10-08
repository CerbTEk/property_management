import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stayDate,stayTime} from '../src/tv-stay.mjs';
import {currentStay} from '../supabase/functions/guest-display/schedule.mjs';
test('stay dates remain calendar dates and times use readable AM/PM',()=>{
 assert.equal(stayDate('2026-10-08'),'Oct 8, 2026');assert.equal(stayDate(null),'');
 assert.equal(stayTime('15:00:00'),'3:00 PM');assert.equal(stayTime('11:00:00'),'11:00 AM');assert.equal(stayTime('00:30'),'12:30 AM');
});
test('selected dates turn over with the guest and clear at checkout or ambiguity',()=>{
 const property={timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00'};
 const a={guest:'Josh Kennedy',arrival:'2026-10-07',departure:'2026-10-08',status:'confirmed'};
 const b={guest:'Alex Next',arrival:'2026-10-10',departure:'2026-10-12',status:'confirmed'};
 assert.deepEqual(currentStay([a,b],property,new Date('2026-10-08T14:59:59Z')),{guest:'Josh',arrival:a.arrival,departure:a.departure});
 assert.deepEqual(currentStay([a,b],property,new Date('2026-10-08T15:00:00Z')),{guest:'Alex',arrival:b.arrival,departure:b.departure});
 assert.equal(currentStay([a],property,new Date('2026-10-08T15:00:00Z')),null);
 assert.equal(currentStay([a,a,b],property,new Date('2026-10-08T14:59:59Z')),null);
});
