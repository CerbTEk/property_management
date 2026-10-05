import {test} from 'node:test';import assert from 'node:assert/strict';import {quote,nights,validDay} from '../src/model.mjs';
import {calendarDays} from '../src/model.mjs';
test('calendar uses occupied nights, account-loaded listings and leap months',()=>{const r=[{id:'1',property_id:'A',arrival:'2026-10-01',departure:'2026-10-03',status:'confirmed'},{id:'2',property_id:'E',arrival:'2026-10-03',departure:'2026-10-05',status:'confirmed'},{id:'3',property_id:'A',arrival:'2026-10-01',departure:'2026-10-10',status:'cancelled'}];const g=calendarDays('2026-10',r,'A');assert.equal(g.days.length,31);assert.equal(g.padding,4);assert.equal(g.days[1].bookings.length,1);assert.equal(g.days[2].bookings.length,0);assert.equal(calendarDays('2028-02').days.length,29);assert.throws(()=>calendarDays('2026-13'));});
test('calendar nights remain stable across DST',()=>{assert.equal(nights('2026-03-07','2026-03-09'),2);assert.equal(validDay('2026-02-30'),false);assert.throws(()=>nights('2026-10-05','2026-10-05'));});
test('Friday/Saturday rates, listing-specific override and markup',()=>{const p={id:'A',weekday_cents:5600,weekend_cents:7000,markup_percent:18.34};assert.deepEqual(quote(p,'2026-10-09','2026-10-12',[{property_id:'A',day:'2026-10-10',amount_cents:8000},{property_id:'E',day:'2026-10-09',amount_cents:100}]),{nights:3,total:206,markedUp:243.78});});

test('calendar includes active blocks, excludes released blocks and frees the end date',()=>{
 const reservations=[{id:'block',property_id:'room',arrival:'2026-10-05',departure:'2026-10-07',status:'blocked',kind:'block'},{id:'released',property_id:'room',arrival:'2026-10-07',departure:'2026-10-09',status:'cancelled',kind:'block'}];
 const grid=calendarDays('2026-10',reservations,'room');
 assert.equal(grid.days.find(d=>d.day==='2026-10-05').bookings[0].id,'block');
 assert.equal(grid.days.find(d=>d.day==='2026-10-07').bookings.length,0);
});
