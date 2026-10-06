import {guestAccessPlan} from '../src/lock-model.mjs';

// Server-only. Return plans, never provider writes. Load a complete owner snapshot
// and fresh provider observations before calling; never log this input.
export async function accessCodeTag(secret,owner,provider,device,code){
 if(!/^[a-f0-9]{64}$/i.test(secret||''))throw Error('Access fingerprint key is not configured.');
 const bytes=Uint8Array.from(secret.match(/../g),h=>parseInt(h,16));
 const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([owner,provider,device,code])));
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
const identity=x=>JSON.stringify([x.provider,x.device_id]);
const route=x=>JSON.stringify([x.booking_id,x.lock_id]);
const overlaps=(a,b)=>a.start<b.end&&b.start<a.end;

export async function accessLifecycle({ownerId,data,receipts=[],observations=[],fingerprintKey,now=Date.now()}){
 if(!ownerId||!Number.isSafeInteger(now))throw Error('An owner and current time are required.');
 if(!data||['properties','reservations','locks','lockAssignments'].some(k=>!Array.isArray(data[k])))throw Error('A complete access snapshot is required.');
 const properties=data.properties||[],reservations=data.reservations||[],locks=data.locks||[],assignments=data.lockAssignments||[];
 for(const rows of [properties,reservations,locks,assignments,receipts,observations]){
  if(rows.some(r=>r.owner_id!==ownerId))throw Error('Access snapshot contains another owner.');
 }
 const desired=[],review=[],actions=[];
 let nextRun=now+15*60*1000;
 for(const booking of reservations){
  if(booking.status!=='confirmed'||booking.kind==='block')continue;
  try{
   const property=properties.find(p=>p.id===booking.property_id);
   const plan=guestAccessPlan(property,booking,locks,assignments,{properties,reservations});
   if(plan.end<=now)continue;
   if(plan.start>now)nextRun=Math.min(nextRun,plan.start);
   nextRun=Math.min(nextRun,plan.end);
   if(plan.issues.length){review.push({booking_id:booking.id,reasons:plan.issues});continue;}
   for(const lock of plan.locks){
    const provider=lock.provider,device_id=String(lock.provider_device_id||lock.provider_lock_id||'');
    const tag=await accessCodeTag(fingerprintKey,ownerId,provider,device_id,lock.code);
    desired.push({booking_id:booking.id,lock_id:lock.id,provider,device_id,code_tag:tag,start:plan.start,end:plan.end,code_length:lock.code.length});
   }
  }catch(e){
   // Configuration errors must not be mistaken for booking removal/revocation.
   if(e.message==='Access fingerprint key is not configured.')throw e;
   review.push({booking_id:booking.id,reasons:['The reservation access window could not be verified.']});
  }
 }
 const active=receipts.filter(r=>r.state!=='revoked').map(r=>({...r,start:Date.parse(r.starts_at),end:Date.parse(r.ends_at)}));
 if(active.some(r=>!['installed','uncertain'].includes(r.state)||!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.end<=r.start||!r.id||!r.device_id||!r.provider||!r.code_tag||(r.state==='installed'&&!r.provider_code_id)))throw Error('Access receipts need reconciliation before planning.');
 const blockedDevices=new Set();
 const counts=new Map();for(const r of active)counts.set(route(r),(counts.get(route(r))||0)+1);
 for(const r of active){
  if(r.state==='uncertain'||counts.get(route(r))>1){
   blockedDevices.add(identity(r));
   actions.push({action:'reconcile',receipt_id:r.id,booking_id:r.booking_id,lock_id:r.lock_id,reason:r.state==='uncertain'?'provider_result_unknown':'multiple_receipts'});
  }
 }
 for(const r of active){
  if(r.state==='uncertain'||counts.get(route(r))>1)continue;
  const target=desired.find(d=>route(d)===route(r));
  if(!target){
   actions.push({action:'revoke',receipt_id:r.id,booking_id:r.booking_id,lock_id:r.lock_id,reason:r.end<=now?'expired':'access_no_longer_valid'});
   continue;
  }
  if(identity(target)!==identity(r)||target.code_tag!==r.code_tag){
   actions.push({action:'replace',receipt_id:r.id,booking_id:r.booking_id,lock_id:r.lock_id,reason:'code_or_device_changed'});
  }
 }
 for(const d of desired){
  const existing=active.filter(r=>route(r)===route(d));
  if(existing.some(r=>r.state==='uncertain')||existing.length>1)continue;
  if(existing.length&&(identity(existing[0])!==identity(d)||existing[0].code_tag!==d.code_tag))continue;
  if(blockedDevices.has(identity(d))){review.push({booking_id:d.booking_id,lock_id:d.lock_id,reasons:['A previous provider result on this device must be reconciled first.']});continue;}
  const collision=active.some(r=>route(r)!==route(d)&&identity(r)===identity(d)&&r.code_tag===d.code_tag&&overlaps(r,d));
  if(collision){review.push({booking_id:d.booking_id,lock_id:d.lock_id,reasons:['An existing device passcode conflicts with this access window.']});continue;}
  const observation=observations.find(o=>o.provider===d.provider&&o.device_id===d.device_id);
  const age=now-Date.parse(observation?.observed_at);
  if(!observation||!Number.isFinite(age)||age<0||age>5*60*1000||observation.connected!==true||observation.online!==true||observation.timed_codes!==true||!observation.code_lengths?.includes(d.code_length)||
     (d.provider==='ttlock'&&(observation.gateway_online!==true||observation.passcode_version!==4))){
   review.push({booking_id:d.booking_id,lock_id:d.lock_id,reasons:['Fresh device ownership, online connection, and timed-code support must be verified.']});continue;
  }
  const r=existing[0];
  if(r&&r.start===d.start&&r.end===d.end)continue;
  actions.push({action:r?'update':'create',...(r?{receipt_id:r.id}:{}),booking_id:d.booking_id,lock_id:d.lock_id,
   provider:d.provider,device_id:d.device_id,start:d.start,end:d.end,code_tag:d.code_tag,
   operation_key:await accessCodeTag(fingerprintKey,ownerId,d.provider,d.device_id,JSON.stringify([d.booking_id,d.lock_id,d.code_tag,d.start,d.end,r?.id||null]))});
 }
 // Revocation/replacement requires provider-confirmed removal before recreation.
 // Reconcile uncertain results first; never blindly repeat a create after timeout.
 const order={reconcile:0,revoke:1,replace:2,update:3,create:4};
 actions.sort((a,b)=>order[a.action]-order[b.action]||route(a).localeCompare(route(b)));
 return {actions,review,nextRunAt:new Date(nextRun).toISOString()};
}
