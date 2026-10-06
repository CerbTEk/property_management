import {accessLifecycle} from './access-lifecycle.mjs';
import {ttlockExecution} from './access-execution.mjs';

// One mutation per owner per claim. Continue only after its receipt is settled.
// Test activation is limited to explicitly configured owner/device pairs.
export function ttlockRunner({planningStore,executionStore,providerForOwner,fingerprintKey,enabled=false,approvedDevices=[],clock=Date.now}){
 return async function run(limit=5){
  if(!enabled)return {state:'disabled',processed:0};
  const jobs=await planningStore.claim(Math.max(1,Math.min(limit,5))),results=[];
  for(const job of jobs){
   try{
    if(!approvedDevices.some(device=>device.startsWith(job.owner_id+':'))){
     const finished=await planningStore.finish(job,new Date(clock()+15*60*1000).toISOString());
     results.push({state:finished?'not_enabled':'superseded'});continue;
    }
    const snapshot=await planningStore.snapshot(job.owner_id),provider=await providerForOwner(job.owner_id);
    if(!await executionStore.current(job)){results.push({state:'superseded'});continue;}
    const devices=[...new Set([...snapshot.data.locks.filter(l=>l.provider==='ttlock'&&l.enabled).map(l=>String(l.provider_lock_id)),...snapshot.receipts.filter(r=>r.provider==='ttlock'&&r.state!=='revoked').map(r=>r.device_id)])];
    const observations=[];
    for(const device of devices){
     if(!approvedDevices.includes(job.owner_id+':'+device))continue;
     observations.push(await provider.observe(device));
    }
    const plan=await accessLifecycle({...snapshot,observations,ownerId:job.owner_id,fingerprintKey,now:clock()});
    const intent=plan.actions.find(a=>{
     const receipt=snapshot.receipts.find(r=>r.id===a.receipt_id);
     const device=receipt?.device_id||a.device_id;
     return (receipt?.provider||a.provider)==='ttlock'&&approvedDevices.includes(job.owner_id+':'+device);
    });
    let state=plan.review.length?'needs_review':'current';
    if(intent)state=(await ttlockExecution({store:executionStore,provider,fingerprintKey,enabled:true,clock})(job,intent)).state;
    const next=['installed','revoked'].includes(state)?new Date(clock()+5000).toISOString():plan.nextRunAt;
    const finished=await planningStore.finish(job,next);
    results.push({state:finished?state:'superseded'});
   }catch{results.push({state:'retry_after_lease'});}
  }
  return {state:'complete',processed:jobs.length,results};
 };
}
