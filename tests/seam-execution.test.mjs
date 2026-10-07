import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seamExecution} from '../server/access-execution.mjs';
import {accessCodeTag,accessLifecycle} from '../server/access-lifecycle.mjs';
const now=Date.parse('2026-10-06T18:00:00Z'),secret='ab'.repeat(32),rid='00000000-0000-0000-0000-000000000001';
async function setup(){
 const owner='owner',job={owner_id:owner,lease_token:'lease',leased_revision:1},events=[];
 const data={properties:[{id:'p',owner_id:owner,timezone:'America/New_York',check_in:'15:00',check_out:'11:00'}],reservations:[{id:'b',owner_id:owner,property_id:'p',guest_phone_last4:'0042',arrival:'2026-10-06',departure:'2026-10-08',status:'confirmed',kind:'booking'}],locks:[{id:'l',owner_id:owner,provider:'seam',brand:'yale',provider_device_id:'00000000-0000-0000-0000-000000000010',enabled:true,online:true,capabilities:{online_codes:true,code_lengths:[4]}}],lockAssignments:[{owner_id:owner,property_id:'p',lock_id:'l',purpose:'room'}]};
 const observation={owner_id:owner,provider:'seam',device_id:'00000000-0000-0000-0000-000000000010',observed_at:new Date(now).toISOString(),connected:true,online:true,gateway_online:true,passcode_version:4,timed_codes:true,code_lengths:[4]};
 const tag=await accessCodeTag(secret,owner,'seam','00000000-0000-0000-0000-000000000010','0042');
 const f={job,data,events,receipts:[],codes:[],valid:true,ack:true,settle:true};
 f.store={current:async()=>f.valid,snapshot:async()=>({data:f.data,receipts:f.receipts}),begin:async(j,op,id,grant)=>{events.push('checkpoint');const r={...(id?f.receipts.find(r=>r.id===id):{}),...grant,id:id||rid,owner_id:owner,provider:'seam',device_id:'00000000-0000-0000-0000-000000000010',state:'uncertain',operation:op,operation_token:'operation'};f.receipts=[r];return r;},ack:async()=>{events.push('ack');return f.ack;},settle:async()=>{events.push('settle');return f.settle;}};
 const code=()=>({provider_code_id:'456',marker:'Treestand '+rid,code_tag:tag,start:Date.parse(f.receipts[0]?.starts_at),end:Date.parse(f.receipts[0]?.ends_at),type:'time_bound',confirmed:true,writable:true});
 f.provider={removalConfirmed:async()=>true,observe:async()=>observation,passcodes:async()=>f.codes,create:async grant=>{events.push('write');assert.equal(f.receipts[0].state,'uncertain');assert.equal(grant.code,'0042');f.codes=[code()];return {provider_code_id:'456'};},update:async()=>{events.push('write');f.codes=[code()];return {provider_code_id:'456'};},revoke:async()=>{events.push('write');f.codes=[];return {provider_code_id:'456'};}};
 f.intent=(await accessLifecycle({ownerId:owner,data,receipts:[],observations:[observation],fingerprintKey:secret,now})).actions[0];
 f.execute=()=>seamExecution({store:f.store,provider:f.provider,fingerprintKey:secret,enabled:true,clock:()=>now})(job,f.intent);
 return f;
}
test('Seam execution defaults disabled and rejects stale jobs without any provider write',async()=>{
 const f=await setup();assert.deepEqual(await seamExecution({store:f.store,provider:f.provider})({},{action:'create'}),{state:'disabled'});assert.deepEqual(f.events,[]);
 f.valid=false;assert.deepEqual(await f.execute(),{state:'superseded'});assert.deepEqual(f.events,[]);
});
test('create persists uncertain checkpoint before provider call, then verifies receipt before installation',async()=>{
 const f=await setup();assert.deepEqual(await f.execute(),{state:'installed'});assert.deepEqual(f.events,['checkpoint','write','ack','settle']);assert.equal(JSON.stringify(f.receipts).includes('0042'),false);
});
test('timeouts and missing verification preserve uncertain receipts without repeating a write',async()=>{
 const f=await setup();f.provider.create=async()=>{f.events.push('write');throw Error('private token');};assert.deepEqual(await f.execute(),{state:'uncertain'});assert.equal(f.receipts[0].state,'uncertain');
 const g=await setup();g.provider.create=async()=>({provider_code_id:'456'});assert.deepEqual(await g.execute(),{state:'uncertain'});assert.equal(g.events.includes('settle'),false);
 const h=await setup();h.ack=false;assert.deepEqual(await h.execute(),{state:'uncertain'});assert.equal(h.events.includes('settle'),false);
});
test('unmanaged collisions, foreign observations and assignment changes prevent writes',async()=>{
 const f=await setup();f.codes=[{provider_code_id:'999',code_tag:f.intent.code_tag}];assert.deepEqual(await f.execute(),{state:'needs_review'});assert.deepEqual(f.events,[]);
 const g=await setup();g.data.lockAssignments=[];assert.deepEqual(await g.execute(),{state:'superseded'});assert.deepEqual(g.events,[]);
 const h=await setup();h.provider.observe=async()=>({owner_id:'foreign'});await assert.rejects(()=>h.execute(),/another owner/);assert.deepEqual(h.events,[]);
});
test('unknown create reconciles only an exact uniquely labeled result, and absent codes remain uncertain',async()=>{
 const f=await setup();await f.execute();f.receipts[0].provider_code_id=null;f.intent={action:'reconcile',booking_id:'b',lock_id:'l',receipt_id:rid};f.events.length=0;
 assert.deepEqual(await f.execute(),{state:'installed'});assert.deepEqual(f.events,['settle']);
 f.codes=[];assert.deepEqual(await f.execute(),{state:'needs_review'});
});
test('cancellation revokes only the owned receipt code and confirms provider removal',async()=>{
 const f=await setup();await f.execute();f.receipts[0].state='installed';f.receipts[0].provider_code_id='456';f.data.reservations[0].status='cancelled';f.intent={action:'revoke',booking_id:'b',lock_id:'l',receipt_id:rid};f.events.length=0;
 assert.deepEqual(await f.execute(),{state:'revoked'});assert.deepEqual(f.events,['checkpoint','write','ack','settle']);
 const g=await setup();await g.execute();g.receipts[0].state='installed';g.receipts[0].provider_code_id='456';g.data.reservations[0].status='cancelled';g.intent={action:'revoke',booking_id:'b',lock_id:'l',receipt_id:rid};g.codes[0].marker='Someone else';g.events.length=0;assert.deepEqual(await g.execute(),{state:'needs_review'});assert.deepEqual(g.events,[]);
});

test('Seam async programming stays uncertain until provider confirms the exact code and schedule',async()=>{
 const f=await setup();const create=f.provider.create;
 f.provider.create=async grant=>{const result=await create(grant);f.codes[0].confirmed=false;return result;};
 assert.deepEqual(await f.execute(),{state:'uncertain'});assert.equal(f.events.includes('settle'),false);
 f.intent={action:'reconcile',booking_id:'b',lock_id:'l',receipt_id:rid};f.events.length=0;
 assert.deepEqual(await f.execute(),{state:'needs_review'});assert.deepEqual(f.events,[]);
 f.codes[0].confirmed=true;assert.deepEqual(await f.execute(),{state:'installed'});
});
test('Seam removal needs a device removal event, even after delete acknowledgement and empty inventory',async()=>{
 const f=await setup();await f.execute();f.receipts[0].state='installed';f.receipts[0].provider_code_id='456';f.data.reservations[0].status='cancelled';f.intent={action:'revoke',booking_id:'b',lock_id:'l',receipt_id:rid};
 f.provider.removalConfirmed=async()=>false;f.events.length=0;
 assert.deepEqual(await f.execute(),{state:'uncertain'});assert.deepEqual(f.events,['checkpoint','write','ack']);
});
test('Seam stay date changes update the existing code identity instead of creating a duplicate',async()=>{
 const f=await setup();await f.execute();f.receipts[0].state='installed';f.receipts[0].provider_code_id='456';f.data.reservations[0].departure='2026-10-09';f.intent={action:'update',booking_id:'b',lock_id:'l',receipt_id:rid};f.events.length=0;
 assert.deepEqual(await f.execute(),{state:'installed'});assert.deepEqual(f.events,['checkpoint','write','ack','settle']);assert.equal(f.receipts[0].ends_at,'2026-10-09T15:00:00.000Z');
});
