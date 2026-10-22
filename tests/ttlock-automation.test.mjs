import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignedTTLockDevices,ttlockAutomationPolicy} from '../server/ttlock-automation.mjs';
import {accessRunner} from '../server/ttlock-runner.mjs';
import {accessExecution} from '../server/access-execution.mjs';
const owner='owner',now=Date.parse('2026-10-21T21:00:00Z'),job={owner_id:owner,lease_token:'lease',leased_revision:1};
const secret='ab'.repeat(32);
function fixture(){
 const data={properties:[{id:'p',owner_id:owner,timezone:'America/New_York',check_in:'15:00',check_out:'11:00'}],reservations:[{id:'b',owner_id:owner,property_id:'p',guest_phone_last4:'0042',arrival:'2026-10-21',departure:'2026-10-22',status:'confirmed',kind:'booking'}],locks:['123','456','789'].map((id,i)=>({id:'l'+i,owner_id:owner,provider:'ttlock',brand:'ttlock',provider_lock_id:id,enabled:true})),lockAssignments:[{owner_id:owner,property_id:'p',lock_id:'l0',purpose:'room'},{owner_id:owner,property_id:'p',lock_id:'l1',purpose:'entrance'}]};
 return {data,receipts:[]};
}
test('assignment scope includes multiple assigned doors and managed cleanup but not unassigned inventory',()=>{
 const s=fixture();s.receipts=[{owner_id:owner,provider:'ttlock',state:'installed',device_id:'999'},{owner_id:owner,provider:'ttlock',state:'revoked',device_id:'888'}];
 assert.deepEqual(assignedTTLockDevices(owner,s),['123','456','999']);
 s.data.locks[1].enabled=false;assert.deepEqual(assignedTTLockDevices(owner,s),['123','999']);
 s.data.lockAssignments[0].owner_id='foreign';assert.throws(()=>assignedTTLockDevices(owner,s),/ownership/);
});
test('host consent fails closed, emergency pause wins, revisions reject stale or re-enabled sessions',async()=>{
 let row={owner_id:owner,status:'connected',automation_enabled:false,automation_revision:'a'};
 const p=ttlockAutomationPolicy({readAccount:async()=>row});
 assert.equal(await p.resolveScope(owner,fixture()),null);
 row.automation_enabled=true;const scope=await p.resolveScope(owner,fixture());assert.deepEqual(scope.devices,['123','456']);assert.equal(await p.authorize(owner,scope),true);
 row.automation_revision='b';assert.equal(await p.authorize(owner,scope),false);
 row.status='disconnected';assert.equal(await p.resolveScope(owner,fixture()),null);
 row.status='connected';row.owner_id='foreign';assert.equal(await p.resolveScope(owner,fixture()),null);
 const paused=ttlockAutomationPolicy({paused:true,readAccount:()=>{throw Error('must not read');}});assert.equal(await paused.resolveScope(owner,fixture()),null);assert.equal(await paused.authorize(owner,scope),false);
});
test('assignment runner observes only consented assigned devices; missing consent never loads provider credentials',async()=>{
 const snapshot=fixture();snapshot.data.reservations=[];
 let consent=true,calls=[];
 const policy=ttlockAutomationPolicy({readAccount:async()=>({owner_id:owner,status:'connected',automation_enabled:consent,automation_revision:'a'})});
 const run=accessRunner({enabled:true,fingerprintKey:secret,clock:()=>now,providers:{ttlock:{...policy,providerForOwner:async()=>{calls.push('provider');return {observe:async id=>{calls.push(id);return {owner_id:owner,provider:'ttlock',device_id:id};}};}}},planningStore:{claim:async()=>[job],snapshot:async()=>snapshot,finish:async()=>true},executionStore:{current:async()=>true}});
 assert.equal((await run()).results[0].state,'current');assert.deepEqual(calls,['provider','123','456']);
 calls=[];consent=false;assert.equal((await run()).results[0].state,'not_enabled');assert.deepEqual(calls,[]);
});
test('execution refuses revoked consent before any provider activity',async()=>{
 const forbidden=()=>{throw Error('must not run');};
 assert.deepEqual(await accessExecution({providerName:'ttlock',enabled:true,authorize:async()=>false,store:{current:forbidden},provider:{observe:forbidden}})(job,{}),{state:'disabled'});
});
test('consent loss after durable checkpoint cannot send a physical mutation',async()=>{
 const snapshot=fixture();snapshot.data.lockAssignments=snapshot.data.lockAssignments.slice(0,1);
 let consent=true,writes=0,checkpoints=0;
 const observation={owner_id:owner,provider:'ttlock',device_id:'123',observed_at:new Date(now).toISOString(),connected:true,online:true,gateway_online:true,passcode_version:4,timed_codes:true,code_lengths:[4]};
 const store={current:async()=>true,snapshot:async()=>snapshot,begin:async(j,op,id,grant)=>{consent=false;checkpoints++;return {...grant,id:'receipt',owner_id:owner,state:'uncertain',operation_token:'token'};}};
 const provider={observe:async()=>observation,passcodes:async()=>[],create:async()=>{writes++;throw Error('must not write');}};
 const {accessLifecycle}=await import('../server/access-lifecycle.mjs');
 const intent=(await accessLifecycle({...snapshot,ownerId:owner,observations:[observation],fingerprintKey:secret,now})).actions[0];
 assert.equal((await accessExecution({providerName:'ttlock',enabled:true,authorize:async()=>consent,store,provider,fingerprintKey:secret,clock:()=>now})(job,intent)).state,'uncertain');
 assert.equal(checkpoints,1);assert.equal(writes,0);
});
async function runningFixture(){
 const snapshot=fixture(),codes=new Map(),writes=[];
 const policy=ttlockAutomationPolicy({readAccount:async()=>({owner_id:owner,status:'connected',automation_enabled:true,automation_revision:'a'})});
 const {accessCodeTag}=await import('../server/access-lifecycle.mjs');let n=0;
 const provider={
  observe:async device=>({owner_id:owner,provider:'ttlock',device_id:device,observed_at:new Date(now).toISOString(),connected:true,online:true,gateway_online:true,passcode_version:4,timed_codes:true,code_lengths:[4]}),
  passcodes:async id=>codes.get(id)||[],
  create:async g=>{const id=String(++n);writes.push(['create',g.lockId,g.code]);codes.set(g.lockId,[...(codes.get(g.lockId)||[]),{provider_code_id:id,marker:'Treestand '+g.receiptId,code_tag:await accessCodeTag(secret,owner,'ttlock',g.lockId,g.code),start:g.start,end:g.end,type:3,status:null}]);return {provider_code_id:id};},
  revoke:async g=>{writes.push(['revoke',g.lockId]);codes.set(g.lockId,(codes.get(g.lockId)||[]).filter(c=>c.provider_code_id!==g.providerCodeId));return {provider_code_id:g.providerCodeId};}
 };
 const store={current:async()=>true,snapshot:async()=>snapshot,
  begin:async(j,operation,id,grant)=>{let r=id?snapshot.receipts.find(r=>r.id===id):{...grant,id:'receipt-'+(n+1),owner_id:owner};Object.assign(r,{operation,state:'uncertain',operation_token:'token'});if(!id)snapshot.receipts.push(r);return {...r};},
  ack:async(j,r,id)=>{Object.assign(snapshot.receipts.find(a=>a.id===r.id),{provider_code_id:id,provider_acknowledged:true});return true;},
  settle:async(j,r,state,id)=>{Object.assign(snapshot.receipts.find(a=>a.id===r.id),{state,provider_code_id:id});return true;}
 };
 const run=accessRunner({enabled:true,fingerprintKey:secret,clock:()=>now,providers:{ttlock:{...policy,providerForOwner:async()=>provider}},planningStore:{claim:async()=>[job],snapshot:async()=>snapshot,finish:async()=>true},executionStore:store});
 return {snapshot,codes,writes,run};
}
test('one booking installs on both assigned doors; assignment removal cleans only its managed receipt',async()=>{
 const f=await runningFixture();
 assert.equal((await f.run()).results[0].state,'installed');assert.equal((await f.run()).results[0].state,'installed');
 assert.deepEqual(f.writes,[['create','123','0042'],['create','456','0042']]);
 f.codes.get('456').push({provider_code_id:'unmanaged',marker:'Other system',code_tag:'unrelated'});
 f.snapshot.data.lockAssignments=f.snapshot.data.lockAssignments.filter(a=>a.lock_id!=='l1');
 assert.equal((await f.run()).results[0].state,'revoked');assert.equal(f.codes.get('123').length,1);assert.equal(f.codes.get('456')[0].marker,'Other system');
 assert.equal(f.snapshot.receipts.filter(r=>r.state==='installed').length,1);
});
test('shared entrance preserves other booking access when one booking is cancelled',async()=>{
 const f=await runningFixture(),d=f.snapshot.data;
 d.properties.push({...d.properties[0],id:'p2'});
 d.reservations.push({...d.reservations[0],id:'b2',property_id:'p2',guest_phone_last4:'0053'});
 d.lockAssignments.push({owner_id:owner,property_id:'p2',lock_id:'l1',purpose:'entrance'});
 for(let i=0;i<3;i++)assert.equal((await f.run()).results[0].state,'installed');
 assert.equal(f.codes.get('456').length,2);
 d.reservations[0].status='cancelled';
 assert.equal((await f.run()).results[0].state,'revoked');assert.equal((await f.run()).results[0].state,'revoked');
 assert.equal(f.codes.get('123').length,0);assert.equal(f.codes.get('456').length,1);
 assert.equal(f.snapshot.receipts.find(r=>r.booking_id==='b2').state,'installed');
});
