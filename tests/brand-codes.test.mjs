import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lockGuestCode,codeCompatibility} from '../src/lock-providers.mjs';
import {guestAccessPlan} from '../src/lock-model.mjs';
import {seamBookingCodeBody} from '../server/seam.mjs';
const owner='a',property={id:'room',owner_id:owner,timezone:'UTC',check_in:'15:00',check_out:'11:00'},booking={id:'stay',owner_id:owner,property_id:'room',status:'confirmed',arrival:'2026-10-05',departure:'2026-10-07',guest_phone_last4:'0042'};
const ttlock={id:'tt',owner_id:owner,brand:'ttlock',provider:'ttlock',enabled:true};
const tedee={id:'td',owner_id:owner,brand:'tedee',provider:'seam',provider_device_id:'00000000-0000-0000-0000-000000000001',enabled:true,online:true,capabilities:{online_codes:true,code_lengths:[5,6,7,8]}};
const assignments=[ttlock,tedee].map(l=>({owner_id:owner,property_id:'room',lock_id:l.id,purpose:'room'}));
test('Tedee adds exactly one leading zero and other brands preserve the exact phone suffix',()=>{
 assert.equal(lockGuestCode(tedee,'0042'),'00042');assert.equal(lockGuestCode(ttlock,'0042'),'0042');
 assert.equal(lockGuestCode(tedee,'9876'),'09876');assert.equal(lockGuestCode(tedee,null),null);
});
test('mixed-brand guest plan and provider request use the correct code on each lock',()=>{
 const args={property,booking,locks:[ttlock,tedee],assignments};
 const plan=guestAccessPlan(property,booking,args.locks,assignments);
 assert.equal(plan.code,'0042');assert.equal(plan.locks.find(l=>l.id==='tt').code,'0042');assert.equal(plan.locks.find(l=>l.id==='td').code,'00042');assert.deepEqual(plan.issues,[]);
 assert.equal(seamBookingCodeBody({...args,lockRecordId:'td',now:1}).code,'00042');
});
test('Tedee refuses weak/sequential codes, missing five-digit capability and offline devices',()=>{
 for(const suffix of ['0000','7777','1234']){
  assert.match(codeCompatibility(tedee,lockGuestCode(tedee,suffix)),/Tedee/);
  assert.throws(()=>seamBookingCodeBody({property,booking:{...booking,guest_phone_last4:suffix},locks:[tedee],assignments,lockRecordId:'td',now:1}),e=>e.code==='needs_review');
 }
 assert.match(codeCompatibility({...tedee,capabilities:{online_codes:true,code_lengths:[4]}},'00042'),/Five-digit/);
 assert.match(codeCompatibility({...tedee,online:false},'00042'),/offline/);
});
test('padded Tedee codes still reject overlapping stays on a shared lock',()=>{
 const other={...booking,id:'other',property_id:'second'};
 const plan=guestAccessPlan(property,booking,[tedee],[...assignments,{owner_id:owner,property_id:'second',lock_id:'td',purpose:'entrance'}],{properties:[property,{...property,id:'second'}],reservations:[booking,other]});
 assert.equal(plan.conflicts.length,1);assert.equal(plan.status,'needs_review');
});
