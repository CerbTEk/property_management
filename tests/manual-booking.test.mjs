import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareManualBooking,saveManualBooking} from '../src/manual-booking.mjs';

const property={id:'room-a',name:'Room A',min_stay:1,max_guests:2,weekday_cents:5600,weekend_cents:7000,markup_percent:0};
const values={property_id:'room-a',guest:' Test Guest ',guest_id:'guest-1',guest_phone:'(555) 555-0123',arrival:'2026-10-21',departure:'2026-10-22',guests:'2',note:'Keep this note'};
const prepare=(overrides={},properties=[property])=>prepareManualBooking({...values,...overrides},properties,[],'owner');

test('manual booking preserves saved-guest linking, normalized phone and submitted details',()=>{
 const booking=prepare();
 assert.deepEqual(booking.payload,{property_id:'room-a',guest:'Test Guest',guest_id:'guest-1',guest_phone:'+15555550123',guest_phone_last4:'0123',arrival:'2026-10-21',departure:'2026-10-22',guests:2,note:'Keep this note',owner_id:'owner'});
 assert.deepEqual(booking.summary,{property:'Room A',guest:'Test Guest',arrival:'2026-10-21',departure:'2026-10-22',guests:2,nights:1});
 assert.equal(values.guest,' Test Guest ');
 assert.equal(prepare({guest_id:'',guest_phone:''}).payload.guest_id,null);
 assert.equal(prepare({guest_phone:''}).payload.guest_phone,null);
});

test('manual booking validates listing, dates, limits, guest name and phone before saving',()=>{
 for(const [overrides,pattern] of [[{property_id:'missing'},/Choose a listing/],[{departure:'2026-10-21'},/Departure/],[{arrival:'2026-02-30'},/Departure/],[{guests:'3'},/Maximum occupancy/],[{guests:'1.5'},/valid number/],[{guests:'0'},/valid number/],[{guest:' '},/guest name/],[{guest_phone:'1234'},/country code/]])assert.throws(()=>prepare(overrides),pattern);
 assert.throws(()=>prepare({},[{...property,min_stay:2}]),/Minimum stay is 2/);
});

test('save waits for the insert before refreshing or reporting success',async()=>{
 const calls=[];let resolveInsert;
 const pending=saveManualBooking(prepare(),payload=>{calls.push(['insert',payload]);return new Promise(resolve=>{resolveInsert=resolve;});},async()=>calls.push(['refresh']));
 let completed=false;pending.then(()=>{completed=true;});
 await Promise.resolve();assert.equal(calls.length,1);assert.equal(completed,false);
 resolveInsert();const result=await pending;
 assert.equal(calls.length,2);assert.equal(result.property,'Room A');assert.equal(result.refreshError,'');
});

test('overlap and network failures reject without refreshing or changing entered values',async()=>{
 for(const message of ['This listing has a booking or blocked dates overlapping this period.','Failed to fetch']){
  const booking=prepare(),snapshot=structuredClone(booking);let refreshed=false;
  await assert.rejects(()=>saveManualBooking(booking,async()=>{throw Error(message);},async()=>{refreshed=true;}),{message});
  assert.equal(refreshed,false);assert.deepEqual(booking,snapshot);
 }
});

test('a saved booking stays successful if the subsequent refresh fails and is not inserted again',async()=>{
 let inserts=0;
 const result=await saveManualBooking(prepare(),async()=>{inserts++;},async()=>{throw Error('Refresh unavailable');});
 assert.equal(inserts,1);assert.equal(result.guest,'Test Guest');assert.equal(result.refreshError,'Refresh unavailable');
});

test('a retry can succeed after a rejected insert',async()=>{
 const booking=prepare();let calls=0;
 const save=async()=>{if(++calls===1)throw Error('Temporary failure');};
 await assert.rejects(()=>saveManualBooking(booking,save,async()=>{}));
 assert.equal((await saveManualBooking(booking,save,async()=>{})).refreshError,'');assert.equal(calls,2);
});

test('UI keeps accessible inline outcomes, prevents repeat submit and intentionally resets after success',async()=>{
 const ui=await readFile(new URL('../src/manual-booking.jsx',import.meta.url),'utf8');
 assert.match(ui,/if\(inFlight\.current\|\|busy\|\|saved\)return/);
 assert.match(ui,/inFlight\.current=true/);assert.match(ui,/disabled=\{saving\|\|busy\}/);
 assert.match(ui,/Saving booking/);assert.match(ui,/role="status"/);assert.match(ui,/role="alert"/);
 assert.match(ui,/tabIndex=\{-1\}/);assert.match(ui,/feedback\.current\.focus\(\)/);
 assert.match(ui,/Booking saved in Treestand/);assert.match(ui,/Booking not confirmed/);
 assert.match(ui,/Your entries have been kept/);assert.doesNotMatch(ui,/\.reset\(/);
 assert.match(ui,/Channel sync and door-code readiness are separate/);
 assert.match(ui,/Add another booking/);assert.match(ui,/setSaved\(null\)/);
 const main=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(main,/load\(\{preserveOnError:true\}\)/);
 assert.match(main,/if\(preserveOnError\)throw e/);
 assert.match(main,/onSave=\{reservation\}/);
});
