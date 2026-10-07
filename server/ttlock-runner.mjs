import {accessLifecycle} from './access-lifecycle.mjs';
import {accessExecution,receiptMatches} from './access-execution.mjs';

// One mutation per owner per claim. Continue only after its receipt is settled.
// Test activation is limited to explicitly configured owner/device pairs.
export const ttlockRunner=({providerForOwner,enabled=false,approvedDevices=[],...options})=>accessRunner({...options,providers:{ttlock:{providerForOwner,approvedDevices}},enabled});
export function accessRunner({planningStore,executionStore,providers,fingerprintKey,enabled=false,clock=Date.now}){
 return async function run(limit=5){
  if(!enabled)return {state:'disabled',processed:0};
  const jobs=await planningStore.claim(Math.max(1,Math.min(limit,5))),results=[];
  for(const job of jobs){
   try{
    if(!Object.values(providers).some(p=>p.approvedDevices.some(device=>device.startsWith(job.owner_id+':')))){
     const finished=await planningStore.finish(job,new Date(clock()+15*60*1000).toISOString());
     results.push({state:finished?'not_enabled':'superseded'});continue;
    }
    let snapshot=await planningStore.snapshot(job.owner_id),observations=[],clients={};
    if(!await executionStore.current(job)){results.push({state:'superseded'});continue;}
    for(const [name,config] of Object.entries(providers)){
     const devices=[...new Set([...snapshot.data.locks.filter(l=>l.provider===name&&l.enabled).map(l=>String(name==='seam'?l.provider_device_id:l.provider_lock_id)),...snapshot.receipts.filter(r=>r.provider===name&&r.state!=='revoked').map(r=>r.device_id)])].filter(device=>config.approvedDevices.includes(job.owner_id+':'+device));
     if(!devices.length)continue;
     const provider=clients[name]=await config.providerForOwner(job.owner_id);
     for(const device of devices)observations.push(await provider.observe(device));
    }
    const plan=await accessLifecycle({...snapshot,observations,ownerId:job.owner_id,fingerprintKey,now:clock()});
    let intent=plan.actions.find(a=>{
     const receipt=snapshot.receipts.find(r=>r.id===a.receipt_id);
     const device=receipt?.device_id||a.device_id;
     const name=receipt?.provider||a.provider;
     return clients[name]&&providers[name]?.approvedDevices.includes(job.owner_id+':'+device);
    });
    // Periodically verify otherwise-current installed receipts. External edits
    // become uncertain; never recreate or overwrite a manually altered PIN.
    if(!intent&&executionStore.review){
     for(const r of snapshot.receipts.filter(r=>r.state==='installed'&&clients[r.provider]&&providers[r.provider].approvedDevices.includes(job.owner_id+':'+r.device_id))){
      const codes=await clients[r.provider].passcodes(r.device_id);
      if(codes.filter(c=>c.provider_code_id===r.provider_code_id&&receiptMatches(c,r)).length!==1){
       if(!await executionStore.review(job,r))throw Error('Stale access verification.');
       snapshot=await planningStore.snapshot(job.owner_id);
       intent={action:'reconcile',booking_id:r.booking_id,lock_id:r.lock_id,receipt_id:r.id};break;
      }
     }
    }
    let state=plan.review.length?'needs_review':'current';
    if(intent){
     const name=snapshot.receipts.find(r=>r.id===intent.receipt_id)?.provider||intent.provider;
     state=(await accessExecution({store:executionStore,provider:clients[name],providerName:name,fingerprintKey,enabled:true,clock})(job,intent)).state;
    }
    const next=['installed','revoked'].includes(state)?new Date(clock()+5000).toISOString():plan.nextRunAt;
    const finished=await planningStore.finish(job,next);
    results.push({state:finished?state:'superseded'});
   }catch{results.push({state:'retry_after_lease'});}
  }
  return {state:'complete',processed:jobs.length,results};
 };
}
