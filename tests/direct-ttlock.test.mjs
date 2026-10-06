import {test} from 'node:test';
import assert from 'node:assert/strict';
import {directTTLockConnection,directTTLockOwner} from '../server/direct-ttlock.mjs';
const env=name=>({TTLOCK_CLIENT_ID:'synthetic-client',TTLOCK_ACCESS_TOKEN:'synthetic-token'})[name];
test('direct TTLock requires its own credentials, does not need Seam, and denies use by another host',async()=>{
 const absent=directTTLockConnection({ownerId:directTTLockOwner,env:()=>null});assert.equal(absent.status().configured,false);await assert.rejects(()=>absent.inventory(),e=>e.code==='not_configured');
 let lookedUp=false,calls=0;
 const foreign=directTTLockConnection({ownerId:'foreign',env:()=>{lookedUp=true;return 'private';},fetcher:async()=>{calls++;}});
 assert.equal(foreign.status().account_setup_required,true);await assert.rejects(()=>foreign.inventory(),e=>e.code==='ownership');assert.equal(lookedUp,false);assert.equal(calls,0);
 assert.equal(directTTLockConnection({ownerId:directTTLockOwner,env}).status().configured,true);
});
test('direct inventory imports TTLock only, sanitizes provider data and refuses duplicate IDs',async()=>{
 const fetcher=async(url)=>({ok:true,json:async()=>({list:url.endsWith('lock/list')?[{lockId:123,lockAlias:'Room A',electricQuantity:80,keyboardPwdVersion:4,hasGateway:1,lockData:'private'}]:[{gatewayId:22,isOnline:1,gatewayName:'private'}]})});
 const result=await directTTLockConnection({ownerId:directTTLockOwner,env,fetcher}).inventory();assert.equal(result.locks[0].provider,'ttlock');assert.equal(result.locks[0].provider_lock_id,'123');assert.equal(result.locks[0].capabilities.battery,80);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(result.gateways[0].online,true);
 const duplicate=async(url)=>({ok:true,json:async()=>({list:url.endsWith('lock/list')?[{lockId:1},{lockId:1}]:[]})});await assert.rejects(()=>directTTLockConnection({ownerId:directTTLockOwner,env,fetcher:duplicate}).inventory(),e=>e.code==='invalid_response');
});
