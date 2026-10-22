import {accessLifecycle} from './access-lifecycle.mjs';
import {accessExecution,receiptMatches} from './access-execution.mjs';

// One mutation per owner per claim. Continue only after its receipt is settled.
// TTLock production scope follows explicit host consent and listing assignments.
// Legacy provider test scopes remain supported, without broadening other providers.
export const ttlockRunner=({providerForOwner,enabled=false,approvedDevices=[],...options})=>accessRunner({...options,providers:{ttlock:{providerForOwner,approvedDevices}},enabled});
export function accessRunner({planningStore,executionStore,providers,fingerprintKey,enabled=false,clock=Date.now}){
 return async function run(limit=5){
  if(!enabled)return {state:'disabled',processed:0};
  const jobs=await planningStore.claim(Math.max(1,Math.min(limit,5))),results=[];
  for(const job of jobs){
   try{
    if(!Object.values(providers).some(p=>p.resolveScope||(p.approvedDevices||[]).some(device=>device.startsWith(job.owner_id+':')))){
     const finished=await planningStore.finish(job,new Date(clock()+15*60*1000).toISOString());
     results.push({state:finished?'not_enabled':'superseded'});continue;
    }
    let snapshot=await planningStore.snapshot(job.owner_id),observations=[],clients={},scopes={};
    if(!await executionStore.current(job)){results.push({state:'superseded'});continue;}
    for(const [name,config] of Object.entries(providers)){
     const scope=config.resolveScope?await config.resolveScope(job.owner_id,snapshot):{devices:(config.approvedDevices||[]).filter(d=>d.startsWith(job.owner_id+':')).map(d=>d.slice(job.owner_id.length+1))};
     if(!scope)continue;
     scopes[name]=scope;
     const devices=[...new Set([...snapshot.data.locks.filter(l=>l.provider===name&&l.enabled).map(l=>String(name==='seam'?l.provider_device_id:l.provider_lock_id)),...snapshot.receipts.filter(r=>r.provider===name&&r.state!=='revoked').map(r=>r.device_id)])].filter(device=>scope.devices.includes(device));
     if(!devices.length)continue;
     if(!await executionStore.current(job)||config.authorize&&!await config.authorize(job.owner_id,scope))continue;
     const provider=clients[name]=await config.providerForOwner(job.owner_id);
     for(const device of devices)observations.push(await provider.observe(device));
    }
    if(!Object.keys(scopes).length){
     const finished=await planningStore.finish(job,new Date(clock()+15*60*1000).toISOString());
     results.push({state:finished?'not_enabled':'superseded'});continue;
    }
    const plan=await accessLifecycle({...snapshot,observations,ownerId:job.owner_id,fingerprintKey,now:clock()});
    let intent=plan.actions.find(a=>{
     const receipt=snapshot.receipts.find(r=>r.id===a.receipt_id);
     const device=receipt?.device_id||a.device_id;
     const name=receipt?.provider||a.provider;
     return clients[name]&&scopes[name]?.devices.includes(String(device));
    });
    // Periodically verify otherwise-current installed receipts. External edits
    // become uncertain; never recreate or overwrite a manually altered PIN.
    if(!intent&&executionStore.review){
     for(const r of snapshot.receipts.filter(r=>r.state==='installed'&&clients[r.provider]&&scopes[r.provider]?.devices.includes(String(r.device_id)))){
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
     state=(await accessExecution({store:executionStore,provider:clients[name],providerName:name,fingerprintKey,enabled:true,clock,authorize:async()=>!providers[name].authorize||await providers[name].authorize(job.owner_id,scopes[name])})(job,intent)).state;
    }
    const next=['installed','revoked'].includes(state)?new Date(clock()+5000).toISOString():plan.nextRunAt;
    const finished=await planningStore.finish(job,next);
    results.push({state:finished?state:'superseded'});
   }catch{results.push({state:'retry_after_lease'});}
  }
  return {state:'complete',processed:jobs.length,results};
 };
}
