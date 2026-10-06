import {ttlockInventory,timedPasscodeBody,TTLockError} from './ttlock.mjs';
import {accessCodeTag} from './access-lifecycle.mjs';

// Native TTLock only. Tokens/PINs remain transient server values; never log payloads.
export function ttlockAccess({clientId,accessToken,ownerId,fingerprintKey,fetcher=fetch,now=Date.now}){
 const inventory=ttlockInventory({clientId,accessToken,fetcher,now});
 const id=value=>{if(!/^[1-9][0-9]{0,14}$/.test(String(value)))throw new TTLockError('Invalid TTLock device or code identity.','invalid');return String(value);};
 async function request(path,values,{write=false}={}){
  if(!clientId||!accessToken||!ownerId)throw new TTLockError('Connect your TTLock account first.','not_connected');
  let response,payload;
  try{
   response=await fetcher('https://api.sciener.com/v3/'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({clientId,accessToken,...values,date:String(now())}),redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error();payload=await response.json();
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error();
  }catch{throw new TTLockError(write?'TTLock operation result is uncertain. Reconcile before retrying.':'TTLock verification is unavailable.',write?'outcome_unknown':'unavailable');}
  if(payload.errcode!==undefined&&payload.errcode!==0)throw new TTLockError('TTLock rejected the operation. Review the device connection.','provider_error');
  return payload;
 }
 async function observe(lockId){
  lockId=id(lockId);
  const [locks,gateways]=await Promise.all([inventory.locks(),inventory.gateways()]);
  const lock=locks.find(l=>l.provider_lock_id===lockId);
  if(!lock)throw new TTLockError('The connected TTLock account does not own this device.','ownership');
  const associated=await request('gateway/listByLock',{lockId});
  if(!Array.isArray(associated.list))throw new TTLockError('TTLock gateway association is unavailable.','invalid_response');
  const gatewayOnline=associated.list.some(g=>gateways.some(known=>known.gateway_id===id(g.gatewayId)&&known.online));
  let reachable=false;
  if(gatewayOnline){const value=await request('lock/queryOpenState',{lockId});reachable=value.state===0||value.state===1;}
  return {owner_id:ownerId,provider:'ttlock',device_id:lockId,observed_at:new Date(now()).toISOString(),connected:true,online:reachable,gateway_online:gatewayOnline,
   passcode_version:lock.passcode_version,timed_codes:reachable&&gatewayOnline&&lock.passcode_version===4,code_lengths:lock.passcode_version===4?[4,5,6,7,8,9]:[]};
 }
 async function passcodes(lockId){
  lockId=id(lockId);const codes=[],seen=new Set();
  for(let page=1;page<=5;page++){
   const result=await request('lock/listKeyboardPwd',{lockId,pageNo:String(page),pageSize:'100'});
   if(!Array.isArray(result.list))throw new TTLockError('TTLock passcodes could not be verified.','invalid_response');
   for(const raw of result.list){
    const codeId=id(raw.keyboardPwdId),code=String(raw.keyboardPwd);
    if(seen.has(codeId)||String(raw.lockId)!==lockId||!/^\d{4,9}$/.test(code)||!Number.isSafeInteger(raw.startDate)||!Number.isSafeInteger(raw.endDate))throw new TTLockError('TTLock returned unverifiable passcode records.','invalid_response');
    seen.add(codeId);
    // Compare protected tags, never return the provider PIN or sender username.
    codes.push({provider_code_id:codeId,marker:typeof raw.keyboardPwdName==='string'?raw.keyboardPwdName:'',code_tag:await accessCodeTag(fingerprintKey,ownerId,'ttlock',lockId,code),start:raw.startDate,end:raw.endDate,type:raw.keyboardPwdType,status:raw.status??null});
   }
   if(result.list.length<100)return codes;
  }
  throw new TTLockError('TTLock passcode list exceeded the verification limit.','limit');
 }
 function marker(receiptId){if(!/^[a-f0-9-]{36}$/i.test(receiptId))throw new TTLockError('Invalid access receipt.','invalid');return 'Treestand '+receiptId;}
 return {
  observe,passcodes,
  async create({lockId,code,start,end,receiptId}){
   const body=timedPasscodeBody({clientId,accessToken,lockId:id(lockId),code,start,end,now:now()});
   body.set('keyboardPwdName',marker(receiptId));
   const result=await request('keyboardPwd/add',Object.fromEntries(body),{write:true});
   if(!/^[1-9][0-9]{0,14}$/.test(String(result.keyboardPwdId)))throw new TTLockError('TTLock operation result is uncertain. Reconcile before retrying.','outcome_unknown');
   return {provider_code_id:String(result.keyboardPwdId)};
  },
  async update({lockId,providerCodeId,code,start,end,receiptId}){
   timedPasscodeBody({clientId,accessToken,lockId:id(lockId),code,start,end,now:now()});
   const result=await request('keyboardPwd/change',{lockId:id(lockId),keyboardPwdId:id(providerCodeId),keyboardPwdName:marker(receiptId),newKeyboardPwd:code,startDate:String(start),endDate:String(end),changeType:'2'},{write:true});
   if(result.errcode!==0)throw new TTLockError('TTLock operation result is uncertain.','outcome_unknown');
   return {provider_code_id:id(providerCodeId)};
  },
  async revoke({lockId,providerCodeId}){
   const result=await request('keyboardPwd/delete',{lockId:id(lockId),keyboardPwdId:id(providerCodeId),deleteType:'2'},{write:true});
   if(result.errcode!==0)throw new TTLockError('TTLock operation result is uncertain.','outcome_unknown');
   return {provider_code_id:id(providerCodeId)};
  }
 };
}
