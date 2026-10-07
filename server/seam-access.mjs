import {SeamError} from './seam.mjs';
import {accessCodeTag} from './access-lifecycle.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function seamAccess({client,ownerId,connectionIds,fingerprintKey,clock=Date.now}){
 const id=value=>{if(!uuid.test(value||''))throw new SeamError('Invalid access identity.','invalid');return value;};
 const own=device=>client.ownedDevice(ownerId,connectionIds,id(device));
 async function list(path,deviceId){
  const codes=[],seen=new Set();let cursor;
  for(let page=0;page<100;page++){
   const result=await client.request(path,{device_id:id(deviceId),limit:100,...(cursor?{page_cursor:cursor}:{})});
   if(!Array.isArray(result.access_codes))throw new SeamError('Access codes could not be verified.','invalid_response');
   for(const raw of result.access_codes){
    if(!uuid.test(raw.access_code_id)||raw.device_id!==deviceId||seen.has(raw.access_code_id))throw new SeamError('Access code ownership could not be verified.','ownership');
    seen.add(raw.access_code_id);
    // Unknown or concealed codes block creation rather than assuming no collision.
    if(!/^\d{4,12}$/.test(raw.code||''))throw new SeamError('An existing device code needs review.','needs_review');
    codes.push({provider_code_id:raw.access_code_id,marker:typeof raw.name==='string'?raw.name:'',code_tag:await accessCodeTag(fingerprintKey,ownerId,'seam',deviceId,raw.code),
     start:Date.parse(raw.starts_at),end:Date.parse(raw.ends_at),writable:raw.is_managed===true&&Array.isArray(raw.errors)&&raw.errors.length===0&&['set','unset'].includes(raw.status)&&(!raw.pending_mutations||raw.pending_mutations.length===0),confirmed:raw.is_managed===true&&raw.type==='time_bound'&&(raw.status==='set'||raw.is_scheduled_on_device===true)&&Array.isArray(raw.errors)&&raw.errors.length===0&&(!raw.pending_mutations||raw.pending_mutations.length===0)});
   }
   if(!result.pagination?.has_next_page)return codes;
   const next=result.pagination.next_page_cursor;
   if(typeof next!=='string'||!next||next===cursor)throw new SeamError('Invalid code pagination.','invalid_response');cursor=next;
  }
  throw new SeamError('Access code verification limit exceeded.','limit');
 }
 const window=({code,start,end,receiptId})=>{
  if(!/^\d{4,12}$/.test(code||'')||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end<=clock())throw new SeamError('Guest access needs review.','needs_review');
  return {code,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),name:'Treestand '+id(receiptId)};
 };
 return {
  async observe(deviceId){
   const d=await own(deviceId),p=d.properties||{};
   // Seam reports online-code capability; pending codes remain uncertain
   // until set on the device or confirmed scheduled on the device.
   const ready=d.can_program_online_access_codes===true&&p.online===true;
   return {owner_id:ownerId,provider:'seam',device_id:deviceId,observed_at:new Date(clock()).toISOString(),connected:true,online:p.online===true,timed_codes:ready,
    code_lengths:Array.isArray(p.supported_code_lengths)?p.supported_code_lengths.filter(n=>Number.isInteger(n)&&n>=4&&n<=12):[]};
  },
  async passcodes(deviceId){
   await own(deviceId);
   const [managed,unmanaged]=await Promise.all([list('access_codes/list',deviceId),list('access_codes/unmanaged/list',deviceId)]);
   if(new Set([...managed,...unmanaged].map(c=>c.provider_code_id)).size!==managed.length+unmanaged.length)throw new SeamError('Access code inventory is ambiguous.','invalid_response');
   return [...managed,...unmanaged];
  },
  async removalConfirmed(receipt){
   await own(receipt.device_id);
   const started=Date.parse(receipt.operation_started_at);
   if(!Number.isFinite(started)||!receipt.provider_code_id)return false;
   const result=await client.request('events/list',{device_id:id(receipt.device_id),access_code_id:id(receipt.provider_code_id),event_type:'access_code.removed_from_device',since:new Date(started-1000).toISOString(),limit:100});
   if(!Array.isArray(result.events))throw new SeamError('Removal could not be verified.','invalid_response');
   return result.events.some(e=>e.device_id===receipt.device_id&&e.access_code_id===receipt.provider_code_id&&e.event_type==='access_code.removed_from_device'&&Date.parse(e.occurred_at)>=started-1000);
  },
  async create({lockId,code,start,end,receiptId}){
   await own(lockId);
   const result=await client.request('access_codes/create',{device_id:id(lockId),...window({code,start,end,receiptId}),prefer_native_scheduling:true,attempt_for_offline_device:false,use_backup_access_code_pool:false,is_offline_access_code:false},'POST');
   if(result.access_code?.device_id!==lockId)throw new SeamError('Access result is uncertain.','outcome_unknown');
   return {provider_code_id:id(result.access_code?.access_code_id)};
  },
  async update({lockId,providerCodeId,code,start,end,receiptId}){
   await own(lockId);
   await client.request('access_codes/update',{access_code_id:id(providerCodeId),...window({code,start,end,receiptId})},'PATCH');
   return {provider_code_id:providerCodeId};
  },
  async revoke({lockId,providerCodeId}){
   await own(lockId);
   await client.request('access_codes/delete',{device_id:id(lockId),access_code_id:id(providerCodeId)},'DELETE');
   return {provider_code_id:providerCodeId};
  }
 };
}
