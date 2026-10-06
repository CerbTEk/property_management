import {ttlockInventory,TTLockError} from './ttlock.mjs';
// Customer tokens come from the owner-bound server vault. Legacy pilot credentials are owner-restricted.
export const directTTLockOwner='3f03551d-89de-4214-aa7a-db7a86fe1735';
export function directTTLockConnection({ownerId,env,fetcher=fetch,accountToken}){
 const authorized=Boolean(accountToken)||ownerId===directTTLockOwner;
 const clientId=authorized?env('TTLOCK_CLIENT_ID'):null,accessToken=accountToken||(authorized?env('TTLOCK_ACCESS_TOKEN'):null);
 return {
  status(){return {provider:'ttlock',mode:'direct',configured:Boolean(clientId&&accessToken),ready:Boolean(clientId&&accessToken),account_setup_required:!authorized};},
  async inventory(){
   if(!authorized)throw new TTLockError('This account needs its own direct TTLock connection.','ownership');
   const api=ttlockInventory({clientId,accessToken,fetcher});
   const [locks,gateways]=await Promise.all([api.locks(),api.gateways()]);
   const seen=new Set();
   const rows=locks.map(lock=>{
    if(!/^[1-9][0-9]{0,14}$/.test(lock.provider_lock_id)||seen.has(lock.provider_lock_id))throw new TTLockError('TTLock returned invalid or duplicate devices.','invalid_response');
    seen.add(lock.provider_lock_id);
    return {provider:'ttlock',brand:'ttlock',provider_lock_id:lock.provider_lock_id,provider_device_id:lock.provider_lock_id,name:lock.name.slice(0,120),capabilities:{has_gateway:lock.has_gateway,battery:lock.battery,passcode_version:Number.isInteger(lock.passcode_version)?lock.passcode_version:null},synced_at:new Date().toISOString()};
   });
   return {locks:rows,gateways};
  }
 };
}
