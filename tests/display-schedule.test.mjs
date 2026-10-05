import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentGuest,localClock} from '../supabase/functions/guest-display/schedule.mjs';
const property={timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00'};
const booking={guest:'Alex Synthetic',arrival:'2026-10-05',departure:'2026-10-07',status:'confirmed'};
test('guest is shown only between local check-in and exclusive check-out',()=>{
 for(const [time,name] of [['2026-10-05T18:59:59Z','Guest'],['2026-10-05T19:00:00Z','Alex'],['2026-10-07T14:59:59Z','Alex'],['2026-10-07T15:00:00Z','Guest']])assert.equal(currentGuest([booking],property,new Date(time)),name);
 assert.equal(currentGuest([{...booking,status:'cancelled'}],property,new Date('2026-10-06T20:00:00Z')),'Guest');
 assert.equal(currentGuest([booking,booking],property,new Date('2026-10-06T20:00:00Z')),'Guest');
});
test('same-day turnover leaves a generic greeting until the next arrival time',()=>{
 const next={...booking,guest:'Jordan Next',arrival:'2026-10-07',departure:'2026-10-09'};
 assert.equal(currentGuest([booking,next],property,new Date('2026-10-07T17:00:00Z')),'Guest');
 assert.equal(currentGuest([booking,next],property,new Date('2026-10-07T19:00:00Z')),'Jordan');
});
test('listing timezone and daylight-saving boundaries control display timing',()=>{
 const dst={...booking,arrival:'2026-10-31',departure:'2026-11-01'};
 assert.equal(currentGuest([dst],property,new Date('2026-11-01T15:59:59Z')),'Alex');
 assert.equal(currentGuest([dst],property,new Date('2026-11-01T16:00:00Z')),'Guest');
 assert.equal(localClock(new Date('2026-10-06T03:00:00Z'),'America/New_York').day,'2026-10-05');
 assert.equal(currentGuest([booking],{...property,timezone:'invalid'},new Date()),'Guest');
});
