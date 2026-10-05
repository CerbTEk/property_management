import {guestAccessPlan} from '../src/lock-model.mjs';
// Server-only building blocks. No HTTP route, credentials or live execution configured.
// Never import this module into the browser. Never log request bodies or provider responses.
export class TTLockError extends Error{constructor(message,code){super(message);this.code=code;}}
export function timedPasscodeBody({clientId,accessToken,lockId,code,start,end,now=Date.now()}){
 if(!clientId||!accessToken)throw new TTLockError('TTLock credentials are not configured.','not_configured');
 if(!/^[1-9][0-9]{0,14}$/.test(String(lockId))||!/^\d{4,9}$/.test(code))throw new TTLockError('Invalid lock ID or passcode format.','invalid');
 if(![start,end,now].every(Number.isSafeInteger)||end<=start||end<=now)throw new TTLockError('Invalid or expired access window.','invalid');
 return new URLSearchParams({clientId,accessToken,lockId:String(lockId),keyboardPwd:code,keyboardPwdName:'Treestand guest access',keyboardPwdType:'3',startDate:String(start),endDate:String(end),addType:'2',date:String(now)});
}
export function ttlockInventory({clientId,accessToken,fetcher=fetch,now=Date.now}){
 async function list(path){
  if(!clientId||!accessToken)throw new TTLockError('TTLock credentials are not configured.','not_configured');
  let results=[];
  for(let page=1;page<=100;page++){
   const body=new URLSearchParams({clientId,accessToken,pageNo:String(page),pageSize:'100',date:String(now())});
   let response;try{response=await fetcher('https://api.sciener.com/v3/'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new TTLockError('TTLock inventory could not be reached.','unavailable');}
   if(!response.ok)throw new TTLockError('TTLock inventory request failed.','unavailable');
   let payload;try{payload=await response.json();}catch{throw new TTLockError('TTLock returned an invalid response.','invalid_response');}
   if(payload.errcode!==undefined&&payload.errcode!==0)throw new TTLockError('TTLock rejected the inventory request. Reconnect or check provider access.','provider_error');
   if(!Array.isArray(payload.list))throw new TTLockError('TTLock inventory is unavailable.','invalid_response');
   results.push(...payload.list);
   if(payload.list.length<100)return results;
  }
  throw new TTLockError('TTLock inventory exceeds the supported import limit.','limit');
 }
 return {
  // Do not expose raw provider lockData, MAC addresses, network names or tokens.
  async locks(){return (await list('lock/list')).map(l=>({provider_lock_id:String(l.lockId),name:String(l.lockAlias||l.lockName||'TTLock'),battery:Number.isInteger(l.electricQuantity)?l.electricQuantity:null,passcode_version:l.keyboardPwdVersion,has_gateway:l.hasGateway===1}));},
  async gateways(){return (await list('gateway/list')).map(g=>({gateway_id:String(g.gatewayId),online:g.isOnline===1}));}
 };
}

// Future provisioning must use current server-loaded booking/assignment data.
// The caller cannot choose a guest passcode or a foreign lock ID.
export function bookingPasscodeBody({property,booking,locks,assignments,properties,reservations,lockRecordId,clientId,accessToken,now=Date.now()}){
 const plan=guestAccessPlan(property,booking,locks,assignments,{properties,reservations});
 if(plan.issues.length)throw new TTLockError('Guest access needs review before provisioning.','needs_review');
 const lock=plan.locks.find(l=>l.id===lockRecordId);
 if(!lock)throw new TTLockError('Lock is not assigned to this booking.','not_assigned');
 return timedPasscodeBody({clientId,accessToken,lockId:lock.provider_lock_id,code:plan.code,start:plan.start,end:plan.end,now});
}
