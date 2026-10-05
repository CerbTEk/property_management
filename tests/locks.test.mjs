import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phoneLastFour} from '../src/phone-code.mjs';
import {localInstant,guestAccessPlan} from '../src/lock-model.mjs';
import {timedPasscodeBody,ttlockInventory,bookingPasscodeBody} from '../server/ttlock.mjs';
const property={id:'room-a',owner_id:'owner',timezone:'America/New_York',check_in:'15:00:00',check_out:'11:00:00'};
const booking={id:'booking-a',guest_phone_last4:'0042',property_id:'room-a',owner_id:'owner',arrival:'2026-10-05',departure:'2026-10-07',status:'confirmed',kind:'booking'};
test('access windows follow listing local time, DST, and reject ambiguous/missing times',()=>{
 assert.equal(new Date(localInstant('2026-10-05','15:00','America/New_York')).toISOString(),'2026-10-05T19:00:00.000Z');
 assert.equal(new Date(localInstant('2026-11-02','11:00','America/New_York')).toISOString(),'2026-11-02T16:00:00.000Z');
 assert.equal(new Date(localInstant('2026-10-05','00:00','Asia/Kathmandu')).toISOString(),'2026-10-04T18:15:00.000Z');
 assert.throws(()=>localInstant('2026-11-01','01:30','America/New_York'),/ambiguous/);
 assert.throws(()=>localInstant('2026-03-08','02:30','America/New_York'),/missing/);
 assert.throws(()=>localInstant('2026-02-30','15:00','America/New_York'),/Invalid/);
});
test('access plan includes only owned assigned active locks and excludes cancelled/block bookings',()=>{
 const locks=[{id:'a',owner_id:'owner',enabled:true},{id:'front',owner_id:'owner',enabled:true},{id:'b',owner_id:'owner',enabled:true},{id:'foreign',owner_id:'other',enabled:true},{id:'paused',owner_id:'owner',enabled:false}];
 const assignments=[['room-a','a','room'],['room-a','front','entrance'],['room-b','b','room'],['room-a','foreign','room'],['room-a','paused','room']].map(([property_id,lock_id,purpose])=>({owner_id:'owner',property_id,lock_id,purpose}));
 const p=guestAccessPlan(property,booking,locks,assignments);assert.deepEqual(p.locks.map(l=>l.id),['a','front']);assert.equal(p.status,'draft');assert.ok(p.end>p.start);
 assert.throws(()=>guestAccessPlan(property,{...booking,status:'cancelled'},locks,assignments),/confirmed/);
 assert.throws(()=>guestAccessPlan(property,{...booking,kind:'block'},locks,assignments),/confirmed/);
 assert.throws(()=>guestAccessPlan(property,{...booking,owner_id:'foreign'},locks,assignments),/confirmed/);
});
test('timed TTLock request uses gateway, explicit expiry, and rejects permanent/invalid windows',()=>{
 const data={clientId:'synthetic-client',accessToken:'synthetic-token',lockId:'123',code:'482951',start:1000,end:2000,now:500};
 const p=timedPasscodeBody(data);assert.equal(p.get('keyboardPwdType'),'3');assert.equal(p.get('addType'),'2');assert.equal(p.get('startDate'),'1000');assert.equal(p.get('endDate'),'2000');
 assert.throws(()=>timedPasscodeBody({...data,end:400}),/expired/);assert.throws(()=>timedPasscodeBody({...data,code:'123'}),/format/);assert.throws(()=>timedPasscodeBody({...data,accessToken:''}),/configured/);
});
test('TTLock inventory strips sensitive provider fields and fails closed on provider errors',async()=>{
 let calls=0;
 const client=ttlockInventory({clientId:'synthetic-client',accessToken:'synthetic-token',fetcher:async(url,options)=>{calls++;assert.equal(options.redirect,'error');assert.ok(url.endsWith('/lock/list'));return {ok:true,json:async()=>({list:[{lockId:123,lockAlias:'Synthetic lock',lockData:'secret',lockMac:'private',electricQuantity:70,hasGateway:1,keyboardPwdVersion:4}]})};}});
 const locks=await client.locks();assert.equal(calls,1);assert.equal(locks[0].battery,70);assert.equal(locks[0].has_gateway,true);assert.equal('lockData' in locks[0],false);assert.equal('lockMac' in locks[0],false);
 const error=ttlockInventory({clientId:'synthetic',accessToken:'synthetic',fetcher:async()=>({ok:true,json:async()=>({errcode:-1,errmsg:'secret provider info'})})});await assert.rejects(()=>error.locks(),e=>e.code==='provider_error'&&!e.message.includes('secret'));
 const absent=ttlockInventory({});await assert.rejects(()=>absent.locks(),/not configured/);
});

test('phone code preserves leading zeroes, accepts formatting, and rejects extensions/incomplete numbers',()=>{
 assert.equal(phoneLastFour('+1 (919) 555-0042'),'0042');
 assert.equal(phoneLastFour('020 7946 0017'),'0017');
 assert.equal(phoneLastFour(''),null);
 assert.throws(()=>phoneLastFour('0042'),/complete/);
 assert.throws(()=>phoneLastFour('9195550042 ext 17'),/extension/);
});
test('same phone ending on a shared lock blocks overlapping access, but allows separate rooms or turnover',()=>{
 const secondProperty={...property,id:'room-b'};
 const locks=[{id:'front',owner_id:'owner',enabled:true}];
 const assignments=[{owner_id:'owner',property_id:'room-a',lock_id:'front',purpose:'entrance'},{owner_id:'owner',property_id:'room-b',lock_id:'front',purpose:'entrance'}];
 const other={...booking,id:'booking-b',property_id:'room-b'};
 const context={properties:[property,secondProperty],reservations:[booking,other]};
 const p=guestAccessPlan(property,booking,locks,assignments,context);assert.equal(p.code,'0042');assert.equal(p.status,'needs_review');assert.equal(p.conflicts.length,1);
 assert.equal(guestAccessPlan(property,booking,locks,assignments,{...context,reservations:[{...other,arrival:'2026-10-07',departure:'2026-10-09'}]}).status,'draft');
 assert.equal(guestAccessPlan(property,booking,locks,assignments,{...context,reservations:[{...other,status:'cancelled'}]}).conflicts.length,0);
 assert.equal(guestAccessPlan(property,booking,locks,assignments.slice(0,1),context).conflicts.length,0);
 assert.equal(guestAccessPlan(property,{...booking,guest_phone_last4:null},locks,assignments).code,null);
 assert.equal(guestAccessPlan(property,{...booking,guest_phone_last4:null},locks,assignments).status,'needs_review');
});

test('guest request builder derives phone suffix and rejects missing phone or unassigned lock',()=>{
 const locks=[{id:'room-lock',owner_id:'owner',enabled:true,provider_lock_id:'123'}],assignments=[{owner_id:'owner',property_id:'room-a',lock_id:'room-lock',purpose:'room'}];
 const args={property,booking,locks,assignments,properties:[property],reservations:[booking],lockRecordId:'room-lock',clientId:'synthetic-client',accessToken:'synthetic-token',now:1};
 assert.equal(bookingPasscodeBody(args).get('keyboardPwd'),'0042');
 assert.throws(()=>bookingPasscodeBody({...args,booking:{...booking,guest_phone_last4:null}}),e=>e.code==='needs_review');
 assert.throws(()=>bookingPasscodeBody({...args,lockRecordId:'foreign'}),e=>e.code==='not_assigned');
});
