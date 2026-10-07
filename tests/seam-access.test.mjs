import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seamAccess} from '../server/seam-access.mjs';
const device='00000000-0000-0000-0000-000000000010',codeId='00000000-0000-0000-0000-000000000011',receiptId='00000000-0000-0000-0000-000000000012',now=Date.parse('2026-10-07T20:00:00Z');
function fixture(){
 const calls=[],f={owned:true,raw:{device_id:device,access_code_id:codeId,code:'0042',name:'Treestand '+receiptId,type:'time_bound',status:'unset',is_scheduled_on_device:true,is_managed:true,errors:[],pending_mutations:[],starts_at:new Date(now).toISOString(),ends_at:new Date(now+3600000).toISOString()},events:[]};
 const client={ownedDevice:async(owner,views,id)=>{assert.equal(owner,'owner');assert.equal(id,device);if(!f.owned)throw Error('ownership');return {device_id:device,can_program_online_access_codes:true,properties:{online:true,supported_code_lengths:[4,6]}};},request:async(path,params,method)=>{calls.push({path,params,method});if(path==='access_codes/list')return {access_codes:[f.raw]};if(path==='access_codes/unmanaged/list')return {access_codes:[]};if(path==='events/list')return {events:f.events};if(path==='access_codes/create')return {access_code:{device_id:device,access_code_id:codeId}};return {};}};
 f.access=seamAccess({client,ownerId:'owner',connectionIds:['view'],fingerprintKey:'ab'.repeat(32),clock:()=>now});f.calls=calls;return f;
}
test('Seam verifies connection ownership, supports scheduled codes and conceals inventory PINs',async()=>{
 const f=fixture();assert.equal((await f.access.observe(device)).timed_codes,true);const codes=await f.access.passcodes(device);assert.equal(codes[0].confirmed,true);assert.equal(JSON.stringify(codes).includes('0042'),false);
 f.raw.is_scheduled_on_device=false;assert.equal((await f.access.passcodes(device))[0].confirmed,false);f.raw.pending_mutations=[{mutation_code:'creating'}];f.raw.status='set';assert.equal((await f.access.passcodes(device))[0].confirmed,false);
 f.raw.code=null;await assert.rejects(()=>f.access.passcodes(device),e=>e.code==='needs_review');
 f.owned=false;await assert.rejects(()=>f.access.create({lockId:device,code:'0042',start:now,end:now+3600000,receiptId}),/ownership/);assert.equal(f.calls.some(c=>c.path==='access_codes/create'),false);
});
test('Seam uses documented write methods, exact window and no backup or random PIN substitution',async()=>{
 const f=fixture(),args={lockId:device,code:'0042',start:now,end:now+3600000,receiptId,providerCodeId:codeId};
 await f.access.create(args);await f.access.update(args);await f.access.revoke(args);
 assert.deepEqual(f.calls.map(c=>c.method),['POST','PATCH','DELETE']);assert.equal(f.calls[0].params.code,'0042');assert.equal(f.calls[0].params.attempt_for_offline_device,false);assert.equal(f.calls[0].params.use_backup_access_code_pool,false);
 await assert.rejects(()=>f.access.create({...args,end:now}),e=>e.code==='needs_review');
});
test('Seam removal accepts only matching device/code events after the operation began',async()=>{
 const f=fixture(),r={device_id:device,provider_code_id:codeId,operation_started_at:new Date(now).toISOString()};
 assert.equal(await f.access.removalConfirmed(r),false);
 f.events=[{device_id:device,access_code_id:codeId,event_type:'access_code.deleted',occurred_at:new Date(now+1000).toISOString()}];assert.equal(await f.access.removalConfirmed(r),false);
 f.events[0].event_type='access_code.removed_from_device';f.events[0].occurred_at=new Date(now-10000).toISOString();assert.equal(await f.access.removalConfirmed(r),false);
 f.events[0].occurred_at=new Date(now+1000).toISOString();assert.equal(await f.access.removalConfirmed(r),true);
 f.events[0].device_id=codeId;assert.equal(await f.access.removalConfirmed(r),false);
});
