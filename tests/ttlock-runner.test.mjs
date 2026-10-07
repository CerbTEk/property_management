import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ttlockRunner} from '../server/ttlock-runner.mjs';
const now=Date.parse('2026-10-06T18:00:00Z'),job={owner_id:'owner',lease_token:'lease',leased_revision:1};
test('native runner defaults disabled and never claims work or accesses customer tokens',async()=>{
 const forbidden=()=>{throw Error('must not run');};
 assert.deepEqual(await ttlockRunner({planningStore:{claim:forbidden},providerForOwner:forbidden})(),{state:'disabled',processed:0});
});
test('native runner avoids provider connections for hosts outside the explicit test allowlist',async()=>{
 let finished=0;
 const run=ttlockRunner({enabled:true,approvedDevices:['other:123'],clock:()=>now,planningStore:{claim:async()=>[job],finish:async(j,next)=>{finished++;assert.equal(next,'2026-10-06T18:15:00.000Z');return true;}},providerForOwner:()=>{throw Error('must not run');}});
 assert.deepEqual(await run(),{state:'complete',processed:1,results:[{state:'not_enabled'}]});assert.equal(finished,1);
});
test('native runner checks approved devices only and fences changes before provider writes',async()=>{
 const data={properties:[],reservations:[],locks:[{id:'l',owner_id:'owner',enabled:true,provider:'ttlock',provider_lock_id:'123'},{id:'other',owner_id:'owner',enabled:true,provider:'ttlock',provider_lock_id:'999'}],lockAssignments:[]};let observed=[],finished=0,valid=true;
 const run=ttlockRunner({enabled:true,approvedDevices:['owner:123'],fingerprintKey:'ab'.repeat(32),clock:()=>now,planningStore:{claim:async()=>[job],snapshot:async()=>({data,receipts:[]}),finish:async()=>{finished++;return true;}},executionStore:{current:async()=>valid},providerForOwner:async()=>({observe:async id=>{observed.push(id);return {owner_id:'owner',provider:'ttlock',device_id:id};}})});
 assert.equal((await run()).results[0].state,'current');assert.deepEqual(observed,['123']);assert.equal(finished,1);
 valid=false;observed=[];assert.equal((await run()).results[0].state,'superseded');assert.deepEqual(observed,[]);assert.equal(finished,1);
});
test('shared runner flags externally altered Seam receipts without overwriting or recreating the code',async()=>{
 const {accessRunner}=await import('../server/ttlock-runner.mjs');let reviewed=0,reads=0;
 const device='00000000-0000-0000-0000-000000000010',r={id:'receipt',owner_id:'owner',provider:'seam',device_id:device,booking_id:'b',lock_id:'l',code_tag:'a'.repeat(64),provider_code_id:'code',starts_at:'2026-10-06T19:00:00Z',ends_at:'2026-10-08T15:00:00Z',state:'installed',operation_token:'token'};
 // No desired booking produces a revoke intent, so use a current desired grant.
 const data={properties:[{id:'p',owner_id:'owner',timezone:'America/New_York',check_in:'15:00',check_out:'11:00'}],reservations:[{id:'b',owner_id:'owner',property_id:'p',guest_phone_last4:'0042',arrival:'2026-10-06',departure:'2026-10-08',status:'confirmed',kind:'booking'}],locks:[{id:'l',owner_id:'owner',provider:'seam',brand:'yale',provider_device_id:device,enabled:true,online:true,capabilities:{online_codes:true,code_lengths:[4]}}],lockAssignments:[{owner_id:'owner',property_id:'p',lock_id:'l',purpose:'room'}]};
 const {accessCodeTag}=await import('../server/access-lifecycle.mjs');r.code_tag=await accessCodeTag('ab'.repeat(32),'owner','seam',device,'0042');
 const provider={observe:async()=>({owner_id:'owner',provider:'seam',device_id:device,observed_at:new Date(now).toISOString(),connected:true,online:true,timed_codes:true,code_lengths:[4]}),passcodes:async()=>{reads++;return [];}};
 const run=accessRunner({enabled:true,fingerprintKey:'ab'.repeat(32),clock:()=>now,providers:{seam:{approvedDevices:['owner:'+device],providerForOwner:async()=>provider}},planningStore:{claim:async()=>[job],snapshot:async()=>({data,receipts:[r]}),finish:async()=>true},executionStore:{current:async()=>true,snapshot:async()=>({data,receipts:[r]}),review:async()=>{reviewed++;r.state='uncertain';r.operation='update';return true;}}});
 assert.equal((await run()).results[0].state,'needs_review');assert.equal(reviewed,1);assert.equal(reads,2);
});
