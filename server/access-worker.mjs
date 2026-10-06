import {accessLifecycle} from './access-lifecycle.mjs';

// Planning worker only. No provider calls, credentials, or door writes.
// Production scheduling/execution must be enabled separately after device testing.
export function accessPlanningWorker({store,fingerprintKey,clock=Date.now}){
 return async function run(limit=10){
  const jobs=await store.claim(limit),results=[];
  for(const job of jobs){
   try{
    const snapshot=await store.snapshot(job.owner_id);
    const plan=await accessLifecycle({...snapshot,ownerId:job.owner_id,fingerprintKey,now:clock()});
    const saved=await store.finish(job,plan.nextRunAt);
    results.push(saved?{owner_id:job.owner_id,state:'planned',plan}:{owner_id:job.owner_id,state:'superseded'});
   }catch{
    // Do not acknowledge failed snapshots. The lease expires for a later retry.
    // Never copy SQL/provider error text, snapshots, PINs or tokens into logs.
    results.push({owner_id:job.owner_id,state:'retry_after_lease'});
   }
  }
  return results;
 };
}

export function accessPlanningStore(db){
 async function read(table,owner){
  const {data,error}=await db.from(table).select('*').eq('owner_id',owner);
  if(error||!Array.isArray(data))throw Error('Access snapshot unavailable.');
  return data;
 }
 return {
  async claim(limit){const {data,error}=await db.rpc('ts_claim_access_work',{p_limit:limit});if(error||!Array.isArray(data))throw Error('Access queue unavailable.');return data;},
  async snapshot(owner){
   const [properties,reservations,locks,lockAssignments,receipts]=await Promise.all(['ts_properties','ts_reservations','ts_locks','ts_lock_assignments','ts_access_receipts'].map(t=>read(t,owner)));
   // Cached lock inventory is not proof of live gateway/code readiness.
   return {data:{properties,reservations,locks,lockAssignments},receipts,observations:[]};
  },
  async finish(job,next){const {data,error}=await db.rpc('ts_finish_access_work',{p_owner:job.owner_id,p_token:job.lease_token,p_revision:job.leased_revision,p_next:next});if(error)throw Error('Access queue completion failed.');return data===true;}
 };
}
