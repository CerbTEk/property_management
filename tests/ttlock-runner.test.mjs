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
