import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentGuest,localClock} from '../supabase/functions/guest-display/schedule.mjs';
const property={timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00'};
const booking={guest:'Alex Synthetic',arrival:'2026-10-05',departure:'2026-10-07',status:'confirmed'};
test('upcoming guest is welcomed before arrival and removed at exclusive check-out',()=>{
 for(const [time,name] of [['2026-10-05T18:59:59Z','Alex'],['2026-10-05T19:00:00Z','Alex'],['2026-10-07T14:59:59Z','Alex'],['2026-10-07T15:00:00Z','Guest']])assert.equal(currentGuest([booking],property,new Date(time)),name);
 assert.equal(currentGuest([{...booking,status:'cancelled'}],property,new Date('2026-10-06T20:00:00Z')),'Guest');
 assert.equal(currentGuest([booking,booking],property,new Date('2026-10-06T20:00:00Z')),'Guest');
});
test('same-day turnover welcomes the next guest at checkout before their arrival time',()=>{
 const next={...booking,guest:'Jordan Next',arrival:'2026-10-07',departure:'2026-10-09'};
 assert.equal(currentGuest([booking,next],property,new Date('2026-10-07T14:59:59Z')),'Alex');
 assert.equal(currentGuest([booking,next],property,new Date('2026-10-07T15:00:00Z')),'Jordan');
 assert.equal(currentGuest([booking,next],property,new Date('2026-10-07T17:00:00Z')),'Jordan');
 assert.equal(currentGuest([booking,next],property,new Date('2026-10-07T19:00:00Z')),'Jordan');
});
test('gaps choose the earliest upcoming confirmed stay regardless of input order',()=>{
 const next={...booking,guest:'Jordan Next',arrival:'2026-10-10',departure:'2026-10-12'};
 const later={...next,guest:'Taylor Later',arrival:'2026-10-15',departure:'2026-10-17'};
 const cancelled={...next,guest:'Cancelled',arrival:'2026-10-08',status:'cancelled'};
 const now=new Date('2026-10-07T15:00:00Z');
 assert.equal(currentGuest([later,cancelled,booking,next],property,now),'Jordan');
 assert.equal(currentGuest([booking,cancelled],property,now),'Guest');
 assert.equal(currentGuest([next,{...next,guest:'Duplicate'}],property,now),'Guest');
 assert.equal(currentGuest([booking,booking,next],property,new Date('2026-10-06T20:00:00Z')),'Guest');
});
test('listing timezone and daylight-saving boundaries control display timing',()=>{
 const dst={...booking,arrival:'2026-10-31',departure:'2026-11-01'};
 assert.equal(currentGuest([dst],property,new Date('2026-11-01T15:59:59Z')),'Alex');
 assert.equal(currentGuest([dst],property,new Date('2026-11-01T16:00:00Z')),'Guest');
 assert.equal(localClock(new Date('2026-10-06T03:00:00Z'),'America/New_York').day,'2026-10-05');
 assert.equal(currentGuest([booking],{...property,timezone:'invalid'},new Date()),'Guest');
});
