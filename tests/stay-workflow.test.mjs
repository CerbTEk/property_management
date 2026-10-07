import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stayWorkflow} from '../src/stay-workflow.mjs';
import {currentGuest} from '../supabase/functions/guest-display/schedule.mjs';
const owner='host';
const p={id:'p',owner_id:owner,name:'Room A',timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00'};
const b={id:'b',owner_id:owner,property_id:'p',guest:'Casey Test',guest_phone_last4:'0042',arrival:'2026-10-06',departure:'2026-10-08',status:'confirmed',kind:'booking'};
const data={properties:[p],reservations:[b],locks:[{id:'l',owner_id:owner,name:'Door',enabled:true,provider:'ttlock',brand:'ttlock'}],lockAssignments:[{owner_id:owner,property_id:'p',lock_id:'l',purpose:'room'}],displays:[{owner_id:owner,property_id:'p',personalize:true,house_rules:'Quiet after 10pm.'}],displayDevices:[{id:'d',owner_id:owner,property_id:'p',revoked:false,expires_at:null,pairing_expires_at:null}]};
const view=(input,time)=>stayWorkflow(input,owner,Date.parse(time));
test('local arrival/checkout boundaries match the real TV personalization schedule',()=>{
 for(const [time,stage,name] of [['2026-10-06T18:59:59Z','upcoming','Casey'],['2026-10-06T19:00:00Z','in_stay','Casey'],['2026-10-08T14:59:59Z','in_stay','Casey'],['2026-10-08T15:00:00Z','finished','Guest']]){
  const result=view(data,time);assert.equal(result.rows[0].stage,stage);assert.equal(currentGuest([b],p,new Date(time)),name);
 }
 assert.equal(view(data,'2026-10-07T01:00:00Z').counts.arrivals,1); // Still October 6 locally.
 assert.equal(view(data,'2026-10-08T16:00:00Z').counts.departures,1);
 assert.equal(view(data,'2026-10-09T01:00:00Z').counts.departures,1); // Still checkout day locally.
});
test('updates and cancellations change TV schedule and never imply door cleanup succeeded',()=>{
 const moved={...b,arrival:'2026-10-09',departure:'2026-10-10'};
 assert.equal(view({...data,reservations:[moved]},'2026-10-07T20:00:00Z').rows[0].stage,'upcoming');
 assert.equal(currentGuest([moved],p,new Date('2026-10-07T20:00:00Z')),'Casey');
 const cancelled={...b,status:'cancelled'};
 const r=view({...data,reservations:[cancelled]},'2026-10-06T20:00:00Z');
 assert.equal(r.rows[0].stage,'cancelled');assert.equal(r.rows[0].access.state,'cleanup_unverified');assert.equal(r.rows[0].tv.state,'generic');assert.equal(r.counts.arrivals,0);assert.equal(r.counts.inStay,0);
 assert.equal(currentGuest([cancelled],p,new Date('2026-10-06T20:00:00Z')),'Guest');
});
test('TV preparation ignores revoked, expired, unclaimed and foreign registrations',()=>{
 for(const device of [{...data.displayDevices[0],revoked:true},{...data.displayDevices[0],expires_at:'2026-01-01T00:00:00Z'},{...data.displayDevices[0],pairing_expires_at:'2026-10-06T20:00:00Z'},{...data.displayDevices[0],owner_id:'foreign'}]){
  const r=view({...data,displayDevices:[device]},'2026-10-06T12:00:00Z');assert.equal(r.rows[0].tv.state,'needs_setup');assert.equal(r.rows[0].tv.screenCount,0);assert.equal(r.counts.review,1);
 }
 assert.equal(view(data,'2026-10-06T12:00:00Z').rows[0].tv.state,'scheduled');
 assert.equal(view({...data,displays:[{...data.displays[0],personalize:false}]},'2026-10-06T12:00:00Z').counts.review,1);
 assert.equal(view({...data,displays:[{...data.displays[0],house_rules:'  '}]},'2026-10-06T12:00:00Z').counts.review,1);
});
test('foreign bookings and blocks cannot enter host workflow; drafts do not expose PINs',()=>{
 const result=view({...data,reservations:[b,{...b,id:'foreign',owner_id:'other'},{...b,id:'block',kind:'block',status:'blocked'}]},'2026-10-06T12:00:00Z');
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].access.state,'draft_ready');assert.equal(JSON.stringify(result).includes('0042'),false);
 const foreign=view({...data,locks:[{...data.locks[0],owner_id:'other'}]},'2026-10-06T12:00:00Z');assert.equal(foreign.rows[0].access.state,'needs_review');
});
test('missing listings and ambiguous DST times remain visible for review',()=>{
 assert.equal(view({...data,properties:[]},'2026-10-06T12:00:00Z').rows[0].stage,'review');
 const dst=view({...data,properties:[{...p,check_in:'01:30:00'}],reservations:[{...b,arrival:'2026-11-01',departure:'2026-11-02'}]},'2026-10-31T20:00:00Z');
 assert.equal(dst.rows[0].stage,'review');assert.match(dst.rows[0].issues[0],/ambiguous/);assert.equal(dst.counts.review,1);
});
