import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessCodeTag,accessLifecycle} from '../server/access-lifecycle.mjs';
import {accessPlanningWorker} from '../server/access-worker.mjs';
const now=Date.parse('2026-10-06T18:00:00Z'),secret='ab'.repeat(32),owner='owner';
const property={id:'p',owner_id:owner,timezone:'America/New_York',check_in:'15:00',check_out:'11:00'};
const booking={id:'b',owner_id:owner,property_id:'p',guest_phone_last4:'0042',arrival:'2026-10-06',departure:'2026-10-08',status:'confirmed',kind:'booking'};
const lock={id:'l',owner_id:owner,provider:'ttlock',brand:'ttlock',provider_lock_id:'123',enabled:true};
const data={properties:[property],reservations:[booking],locks:[lock],lockAssignments:[{owner_id:owner,property_id:'p',lock_id:'l',purpose:'room'}]};
const observation={owner_id:owner,provider:'ttlock',device_id:'123',observed_at:new Date(now).toISOString(),connected:true,online:true,gateway_online:true,passcode_version:4,timed_codes:true,code_lengths:[4]};
const args={ownerId:owner,data,observations:[observation],fingerprintKey:secret,now};
const run=extra=>accessLifecycle({...args,...extra});
const receipt=async extra=>({id:'r',owner_id:owner,booking_id:'b',lock_id:'l',provider:'ttlock',device_id:'123',provider_code_id:'456',code_tag:await accessCodeTag(secret,owner,'ttlock','123','0042'),starts_at:'2026-10-06T19:00:00Z',ends_at:'2026-10-08T15:00:00Z',state:'installed',...extra});
test('lifecycle derives stable create operations without exposing PINs; installed receipts suppress duplicates',async()=>{
 const a=await run(),b=await run();assert.equal(a.actions[0].action,'create');assert.deepEqual(a,b);
 assert.equal(a.nextRunAt,'2026-10-06T18:15:00.000Z');assert.equal(JSON.stringify(a).includes('0042'),false);
 assert.deepEqual((await run({receipts:[await receipt()]})).actions,[]);
 assert.notEqual(await accessCodeTag(secret,owner,'ttlock','124','0042'),await accessCodeTag(secret,owner,'ttlock','123','0042'));
 await assert.rejects(()=>run({fingerprintKey:''}),/fingerprint key/);
 await assert.rejects(()=>run({data:{}}),/complete/);
 await assert.rejects(async()=>run({receipts:[await receipt({owner_id:'foreign'})]}),/another owner/);
});
test('extensions update, phone changes require confirmed replacement, cancellation/unassignment/expiry revoke',async()=>{
 const receipts=[await receipt()];
 const edited={...data,reservations:[{...booking,departure:'2026-10-09'}]};
 assert.equal((await run({data:edited,receipts})).actions[0].action,'update');
 assert.equal((await run({data:{...data,reservations:[{...booking,guest_phone_last4:'9724'}]},receipts})).actions[0].action,'replace');
 for(const changes of [{reservations:[{...booking,status:'cancelled'}]},{lockAssignments:[]},{locks:[{...lock,enabled:false}]},{reservations:[]}]){
  const result=await run({data:{...data,...changes},receipts});assert.deepEqual(result.actions.map(a=>a.action),['revoke']);
 }
 const expired=await run({receipts,now:Date.parse('2026-10-08T15:00:00Z')});assert.equal(expired.actions[0].reason,'expired');
 const missingPhone=await run({receipts,data:{...data,reservations:[{...booking,guest_phone_last4:null}]}});assert.equal(missingPhone.actions[0].action,'revoke');assert.ok(missingPhone.review.length);
});
test('unknown outcomes and duplicate receipts reconcile before further writes',async()=>{
 const unknown=await run({receipts:[await receipt({state:'uncertain',provider_code_id:null})]});assert.deepEqual(unknown.actions.map(a=>a.action),['reconcile']);
 const duplicates=await run({receipts:[await receipt(),await receipt({id:'r2'})]});assert.deepEqual(duplicates.actions.map(a=>a.action),['reconcile','reconcile']);
 const orphan=await run({receipts:[await receipt({booking_id:'old',state:'uncertain'})]});assert.deepEqual(orphan.actions.map(a=>a.action),['reconcile']);assert.ok(orphan.review.length);
 await assert.rejects(async()=>run({receipts:[await receipt({ends_at:'invalid'})]}),/receipts/);
});
test('fresh provider ownership, gateway and capabilities are mandatory; old code collisions block creation',async()=>{
 for(const changed of [{observed_at:new Date(now-300001).toISOString()},{observed_at:new Date(now+1).toISOString()},{online:false},{gateway_online:false},{passcode_version:3},{connected:false},{timed_codes:false},{code_lengths:[6]}]){
  const result=await run({observations:[{...observation,...changed}]});assert.equal(result.actions.length,0);assert.ok(result.review.length);
 }
 assert.equal((await run({observations:[]})).actions.length,0);
 const collision=await run({receipts:[await receipt({booking_id:'old'})]});assert.deepEqual(collision.actions.map(a=>a.action),['revoke']);assert.ok(collision.review.length);
 const removed=await run({receipts:[await receipt({booking_id:'old',state:'revoked'})]});assert.equal(removed.actions[0].action,'create');
});
test('shared entrance phone collisions block both bookings and DST timing failures require review',async()=>{
 const p2={...property,id:'p2'},b2={...booking,id:'b2',property_id:'p2'};
 const shared={...data,properties:[property,p2],reservations:[booking,b2],lockAssignments:[...data.lockAssignments,{...data.lockAssignments[0],property_id:'p2'}]};
 const result=await run({data:shared});assert.equal(result.actions.length,0);assert.equal(result.review.length,2);
 const dst=await run({data:{...data,properties:[{...property,check_in:'01:30'}],reservations:[{...booking,arrival:'2026-11-01',departure:'2026-11-03'}]}});assert.equal(dst.actions.length,0);assert.ok(dst.review.length);
});
test('planning worker acknowledges only fenced snapshots and retains failures for retry',async()=>{
 const job={owner_id:owner,lease_token:'token',leased_revision:1};let finishes=0;
 const store={claim:async()=>[job],snapshot:async()=>({data,observations:[observation],receipts:[]}),finish:async(j,next)=>{finishes++;assert.equal(j,job);assert.ok(Date.parse(next)>now);return true;}};
 let results=await accessPlanningWorker({store,fingerprintKey:secret,clock:()=>now})();assert.equal(results[0].state,'planned');assert.equal(results[0].plan.actions[0].action,'create');
 store.finish=async()=>false;results=await accessPlanningWorker({store,fingerprintKey:secret,clock:()=>now})();assert.deepEqual(results,[{owner_id:owner,state:'superseded'}]);
 store.snapshot=async()=>{throw Error('private provider information');};results=await accessPlanningWorker({store,fingerprintKey:secret,clock:()=>now})();assert.deepEqual(results,[{owner_id:owner,state:'retry_after_lease'}]);assert.equal(finishes,1);
});
