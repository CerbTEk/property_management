import {accessLifecycle,accessCodeTag} from './access-lifecycle.mjs';
import {bookingPasscodeBody} from './ttlock.mjs';

const label=r=>'Treestand '+r.id;
const normal=c=>c.status===null||c.status===1;
const exact=(c,r)=>c.marker===label(r)&&c.code_tag===r.code_tag&&c.start===Date.parse(r.starts_at)&&c.end===Date.parse(r.ends_at)&&c.type===3&&normal(c);
const safeState=state=>({state});

// Executes one server-recomputed intent. This is never a browser-supplied PIN,
// device ID, provider code ID or grant. Default is disabled until physical testing.
export function ttlockExecution({store,provider,fingerprintKey,enabled=false,clock=Date.now}){
 return async function execute(job,intent){
  if(!enabled)return safeState('disabled');
  if(!await store.current(job))return safeState('superseded');
  const snapshot=await store.snapshot(job.owner_id);
  const {data,receipts}=snapshot;
  if(!Array.isArray(receipts)||receipts.some(r=>r.owner_id!==job.owner_id))throw Error('Access receipt ownership mismatch.');
  if(intent.action==='reconcile'){
   const r=receipts.find(r=>r.id===intent.receipt_id&&r.booking_id===intent.booking_id&&r.lock_id===intent.lock_id&&r.state==='uncertain'&&r.provider==='ttlock');
   if(!r||!r.operation_token)return safeState('needs_review');
   const codes=await provider.passcodes(r.device_id);
   if(!await store.current(job))return safeState('superseded');
   const matches=codes.filter(c=>exact(c,r)&&(!r.provider_code_id||c.provider_code_id===r.provider_code_id));
   if(r.operation==='revoke'){
    // Absence after an unacknowledged timeout is not proof of physical removal.
    if(r.provider_acknowledged&&!codes.some(c=>c.provider_code_id===r.provider_code_id||c.marker===label(r))){
     return safeState(await store.settle(job,r,'revoked',r.provider_code_id)?'revoked':'superseded');
    }
    return safeState('needs_review');
   }
   if(matches.length===1)return safeState(await store.settle(job,r,'installed',matches[0].provider_code_id)?'installed':'superseded');
   return safeState('needs_review');
  }
  if(!['create','update','revoke','replace'].includes(intent.action))return safeState('needs_review');
  const old=receipts.find(r=>r.id===intent.receipt_id);
  const lock=data.locks?.find(l=>l.id===intent.lock_id&&l.owner_id===job.owner_id);
  const deviceId=['revoke','replace'].includes(intent.action)?old?.device_id:lock?.provider_lock_id;
  if((old&&old.provider!=='ttlock')||(!old&&lock?.provider!=='ttlock')||!deviceId)return safeState('unsupported');
  const observation=await provider.observe(deviceId);
  const plan=await accessLifecycle({ownerId:job.owner_id,data,receipts,observations:[observation],fingerprintKey,now:clock()});
  const action=plan.actions.find(a=>a.action===intent.action&&a.booking_id===intent.booking_id&&a.lock_id===intent.lock_id&&a.receipt_id===intent.receipt_id);
  if(!action)return safeState('superseded');
  if(observation.owner_id!==job.owner_id||observation.device_id!==String(deviceId)||observation.online!==true||observation.gateway_online!==true||observation.passcode_version!==4)return safeState('needs_review');
  const operation=action.action==='replace'?'revoke':action.action;
  const codes=await provider.passcodes(deviceId);
  if(!await store.current(job))return safeState('superseded');
  let code;
  if(operation==='create'||operation==='update'){
   const booking=data.reservations.find(b=>b.id===action.booking_id),property=data.properties.find(p=>p.id===booking?.property_id);
   const body=bookingPasscodeBody({property,booking,locks:data.locks,assignments:data.lockAssignments,properties:data.properties,reservations:data.reservations,lockRecordId:action.lock_id,clientId:'server-derived',accessToken:'server-derived',now:clock()});
   code=body.get('keyboardPwd');
   if(await accessCodeTag(fingerprintKey,job.owner_id,'ttlock',String(deviceId),code)!==action.code_tag)return safeState('superseded');
   // A device may reject duplicate PINs even when stay windows do not overlap.
   // Never adopt or delete a pre-existing unmanaged code to make space.
   if(codes.some(c=>c.code_tag===action.code_tag&&c.provider_code_id!==old?.provider_code_id))return safeState('needs_review');
  }
  if(operation!=='create'){
   const prior=codes.find(c=>c.provider_code_id===old?.provider_code_id);
   if(!old||old.state!=='installed'||!prior||prior.marker!==label(old)||prior.code_tag!==old.code_tag||!normal(prior))return safeState('needs_review');
  }
  const grant=operation==='revoke'?null:{booking_id:action.booking_id,lock_id:action.lock_id,provider:'ttlock',device_id:String(deviceId),code_tag:action.code_tag,starts_at:new Date(action.start).toISOString(),ends_at:new Date(action.end).toISOString()};
  const receipt=await store.begin(job,operation,old?.id||null,grant);
  if(!receipt)return safeState('superseded');
  // Receipt is durable and uncertain BEFORE any provider write. Another worker
  // will reconcile it if the process crashes, a request times out, or edits race.
  if(receipt.owner_id!==job.owner_id||receipt.provider!=='ttlock'||receipt.device_id!==String(deviceId)||receipt.state!=='uncertain'||!receipt.operation_token)throw Error('Invalid access checkpoint.');
  if(!await store.current(job))return safeState('superseded');
  try{
   const result=operation==='revoke'?await provider.revoke({lockId:deviceId,providerCodeId:receipt.provider_code_id}):await provider[operation]({lockId:deviceId,providerCodeId:receipt.provider_code_id,code,start:action.start,end:action.end,receiptId:receipt.id});
   if(!await store.ack(job,receipt,result.provider_code_id))return safeState('uncertain');
   const after=await provider.passcodes(deviceId);
   const confirmed=operation==='revoke'?!after.some(c=>c.provider_code_id===result.provider_code_id||c.marker===label(receipt)):
    after.filter(c=>c.provider_code_id===result.provider_code_id&&exact(c,receipt)).length===1;
   if(!confirmed)return safeState('uncertain');
   const state=operation==='revoke'?'revoked':'installed';
   return safeState(await store.settle(job,receipt,state,result.provider_code_id)?state:'uncertain');
  }catch{return safeState('uncertain');}
 };
}

export function accessExecutionStore(db,planningStore){
 const args=job=>({p_owner:job.owner_id,p_token:job.lease_token,p_revision:job.leased_revision});
 async function rpc(name,values){const {data,error}=await db.rpc(name,values);if(error)throw Error('Access operation storage failed.');return data;}
 return {
  snapshot:planningStore.snapshot,
  current:async job=>(await rpc('ts_access_work_current',args(job)))===true,
  begin:async(job,operation,receipt,grant)=>(await rpc('ts_begin_access_operation',{...args(job),p_operation:operation,p_receipt:receipt,p_grant:grant}))?.[0]||null,
  ack:async(job,r,providerId)=>(await rpc('ts_ack_access_operation',{...args(job),p_receipt:r.id,p_operation_token:r.operation_token,p_provider_code_id:providerId}))===true,
  settle:async(job,r,state,providerId)=>(await rpc('ts_settle_access_operation',{...args(job),p_receipt:r.id,p_operation_token:r.operation_token,p_state:state,p_provider_code_id:providerId}))===true
 };
}
