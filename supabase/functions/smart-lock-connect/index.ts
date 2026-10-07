import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {seamClient,SeamError} from '../../../server/seam.mjs';
import {seamAccess} from '../../../server/seam-access.mjs';
import {directTTLockConnection} from '../../../server/direct-ttlock.mjs';
import {ttlockAccounts} from '../../../server/ttlock-auth.mjs';
import {ttlockAccess} from '../../../server/ttlock-access.mjs';
import {nativeInventory} from '../../../server/native-inventory.mjs';
import {nativeAccounts} from '../../../server/native-accounts.mjs';
import {NativeOAuthError} from '../../../server/native-oauth.mjs';
import {TTLockError} from '../../../server/ttlock.mjs';
const origin='https://treestand-manager.webflow.io';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply({error:'Origin not allowed.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 const token=req.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!token)return reply({error:'Sign in required.'},401);
 const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data:identity,error:authError}=await userClient.auth.getUser(token);
 if(authError||!identity.user)return reply({error:'Sign in required.'},401);
 const {data:claims,error:claimError}=await userClient.auth.getClaims(token);
 if(claimError||claims?.claims?.sub!==identity.user.id)return reply({error:'Sign in required.'},401);
 const owner=identity.user.id;
 if(owner!=='3f03551d-89de-4214-aa7a-db7a86fe1735'&&claims.claims.aal!=='aal2')return reply({error:'Authenticator verification required.'},403);
 if(Number(req.headers.get('content-length'))>4096)return reply({error:'Request too large.'},413);
 let body;try{const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large.'},413);body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request.'},400);}catch{return reply({error:'Invalid request.'},400);}
 if(['ttlock_status','ttlock_connect','ttlock_disconnect','ttlock_sync','ttlock_preflight'].includes(body.action)){
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const store={
   async read(ownerId){const {data,error}=await admin.from('ts_ttlock_accounts').select('*').eq('owner_id',ownerId).maybeSingle();if(error)throw Error('storage');return data;},
   async claim(ownerId){const {data,error}=await admin.rpc('ts_claim_ttlock_connect',{p_owner:ownerId});if(error)throw Error('storage');return data?.[0]||null;},
   async save(ownerId,revision,values){const {data,error}=await admin.from('ts_ttlock_accounts').update({...values,revision:crypto.randomUUID(),updated_at:new Date().toISOString()}).eq('owner_id',ownerId).eq('revision',revision).select('owner_id');if(error)throw Error('storage');return data?.length===1;}
  };
  const accounts=ttlockAccounts({clientId:Deno.env.get('TTLOCK_CLIENT_ID'),clientSecret:Deno.env.get('TTLOCK_CLIENT_SECRET'),encryptionKey:Deno.env.get('TTLOCK_TOKEN_ENCRYPTION_KEY'),store});
  try{
   if(body.action==='ttlock_status')return reply(await accounts.status(owner));
   if(body.action==='ttlock_connect')return reply(await accounts.connect(owner,body.username,body.password));
   if(body.action==='ttlock_disconnect'){
    const result=await accounts.disconnect(owner);
    const {error}=await admin.from('ts_locks').update({online:null,synced_at:null,capabilities:{}}).eq('owner_id',owner).eq('provider','ttlock');if(error)throw Error('storage');
    return reply(result);
   }
   const accountToken=await accounts.accessToken(owner);
   if(body.action==='ttlock_preflight'){
    if(typeof body.lock_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.lock_id))return reply({error:'Choose a TTLock device.'},400);
    const {data:lock,error}=await admin.from('ts_locks').select('id,provider,provider_lock_id,capabilities').eq('id',body.lock_id).eq('owner_id',owner).maybeSingle();
    if(error)throw Error('storage');
    if(!lock||lock.provider!=='ttlock'||!lock.provider_lock_id)return reply({error:'TTLock device unavailable.'},404);
    const account=await store.read(owner);
    const access=ttlockAccess({clientId:Deno.env.get('TTLOCK_CLIENT_ID'),accessToken:accountToken,ownerId:owner});
    const observation=await access.observe(lock.provider_lock_id);
    const current=await store.read(owner);
    if(current?.status!=='connected'||current.revision!==account?.revision)throw new TTLockError('The connection changed. Recheck before verifying the device.','connection_changed');
    const saved=await admin.from('ts_locks').update({provider_device_id:observation.device_id,online:observation.online,synced_at:observation.observed_at,
     capabilities:{...lock.capabilities,online_codes:observation.timed_codes,code_lengths:observation.code_lengths,passcode_version:observation.passcode_version,gateway_online:observation.gateway_online}})
     .eq('id',lock.id).eq('owner_id',owner).eq('provider_lock_id',lock.provider_lock_id).select('id');
    if(saved.error||saved.data?.length!==1)throw new TTLockError('The device changed. Refresh and verify again.','connection_changed');
    return reply({verified:observation.timed_codes,online:observation.online,gateway_online:observation.gateway_online,passcode_version:observation.passcode_version,
     message:observation.timed_codes?'Gateway and timed-code capability verified. Physical keypad testing is still required.':'The device needs an online gateway and compatible V4 passcodes before automatic access can be enabled.'});
   }
   const direct=directTTLockConnection({ownerId:owner,env:name=>Deno.env.get(name),accountToken});
   const inventory=await direct.inventory();
   for(const lock of inventory.locks){
    const {data:existing,error}=await admin.from('ts_locks').select('id,provider').eq('owner_id',owner).eq('provider_lock_id',lock.provider_lock_id).maybeSingle();
    if(error)throw Error('storage');
    if(existing&&existing.provider!=='ttlock')throw new TTLockError('A device ID is already associated with another provider. Review that inventory entry.','needs_review');
    const result=existing?await admin.from('ts_locks').update(lock).eq('id',existing.id).eq('owner_id',owner):await admin.from('ts_locks').insert({...lock,owner_id:owner});
    if(result.error)throw Error('storage');
   }
   return reply({imported:inventory.locks.length,mode:'direct',gateways:inventory.gateways});
  }catch(e){return reply({error:e instanceof TTLockError?e.message:'TTLock connection could not be saved.',code:e instanceof TTLockError?e.code:'unavailable'},e instanceof TTLockError&&e.code==='ownership'?403:e instanceof TTLockError&&e.code==='rate_limit'?429:502);}
 }
 if(['native_status','native_begin','native_complete','native_disconnect','native_sync'].includes(body.action)){
  if(!['tedee','igloohome'].includes(body.provider))return reply({error:'Manufacturer connection unavailable.'},400);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const store={
   async read(ownerId,provider){const {data,error}=await admin.from('ts_native_lock_accounts').select('*').eq('owner_id',ownerId).eq('provider',provider).maybeSingle();if(error)throw Error('storage');return data;},
   async begin(ownerId,provider,values){const {data,error}=await admin.rpc('ts_begin_native_lock',{p_owner:ownerId,p_provider:provider,p_state:values.state_hash,p_binding:values.binding_hash,p_sealed:values.sealed_transaction,p_expires:values.expires_at});if(error)throw Error('storage');return data;},
   async consume(ownerId,provider,state,binding){const {data,error}=await admin.rpc('ts_consume_native_lock',{p_owner:ownerId,p_provider:provider,p_state:state,p_binding:binding});if(error)throw Error('storage');return data?.[0]||null;},
   async save(ownerId,provider,revision,values){const {data,error}=await admin.rpc('ts_save_native_account',{p_owner:ownerId,p_provider:provider,p_revision:revision,p_sealed:values.sealed_tokens,p_expires:values.expires_at});if(error)throw Error('storage');return data===true;},
   async claimRefresh(ownerId,provider,revision){const {data,error}=await admin.rpc('ts_claim_native_refresh',{p_owner:ownerId,p_provider:provider,p_revision:revision});if(error)throw Error('storage');return data?.[0]||null;},
   async finishRefresh(ownerId,provider,revision,values){const {data,error}=await admin.from('ts_native_lock_accounts').update({...values,updated_at:new Date().toISOString()}).eq('owner_id',ownerId).eq('provider',provider).eq('revision',revision).eq('status','connected').select('owner_id');if(error)throw Error('storage');return data?.length===1;},
   async disconnect(ownerId,provider){const {error}=await admin.rpc('ts_disconnect_native_lock',{p_owner:ownerId,p_provider:provider});if(error)throw Error('storage');}
  };
  const prefix=body.provider.toUpperCase();
  const accounts=nativeAccounts({provider:body.provider,clientId:Deno.env.get(prefix+'_CLIENT_ID'),clientSecret:Deno.env.get(prefix+'_CLIENT_SECRET'),encryptionKey:Deno.env.get('NATIVE_LOCK_TOKEN_ENCRYPTION_KEY'),store});
  try{
   if(body.action==='native_status')return reply(await accounts.status(owner));
   if(body.action==='native_begin')return reply(await accounts.begin(owner,body.browser_binding));
   if(body.action==='native_complete')return reply(await accounts.complete(owner,body.browser_binding,body.callback_url));
   if(body.action==='native_disconnect')return reply(await accounts.disconnect(owner));
   const access=await accounts.access(owner);
   const inventory=await nativeInventory({provider:body.provider,accessToken:access.accessToken}).list();
   const {data:imported,error}=await admin.rpc('ts_import_native_inventory',{p_owner:owner,p_provider:body.provider,p_revision:access.revision,p_locks:inventory.locks});
   if(error)throw new NativeOAuthError('Inventory could not be saved. The account may have changed or a device may already use another provider. Recheck and retry.','needs_review');
   return reply({provider:body.provider,imported,ignored:inventory.ignored,mode:'native',liveValidated:false});
  }catch(e){return reply({error:e instanceof NativeOAuthError?e.message:'Manufacturer connection unavailable. Retry sign-in.',code:e instanceof NativeOAuthError?e.code:'unavailable'},e instanceof NativeOAuthError&&e.code==='ownership'?403:e instanceof NativeOAuthError&&e.code==='rate_limit'?429:e instanceof NativeOAuthError&&e.code==='refresh_pending'?409:502);}
 }
 if(body.action==='access_status'){
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const [receipts,activation]=await Promise.all([
   admin.from('ts_access_receipts').select('booking_id,lock_id,state,updated_at').eq('owner_id',owner),
   admin.from('ts_access_device_activation').select('provider,device_id').eq('owner_id',owner)
  ]);
  if(receipts.error||activation.error)return reply({error:'Guest access status is unavailable.'},503);
  return reply({receipts:receipts.data,activation:activation.data});
 }
 const apiKey=Deno.env.get('SEAM_API_KEY');
 if(body.action==='status'&&!apiKey)return reply({configured:false,ready:false,mode:null});
 if(!apiKey)return reply({error:'Seam is not configured. A server API key is required.',code:'not_configured'},503);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const seam=seamClient({apiKey});
 try{
  const status=await seam.status();
  if(body.action==='status')return reply(status);
  if(!status.ready)return reply({error:'The Seam workspace is suspended. Resolve its account status first.'},503);
  if(body.action==='seam_preflight'){
   if(typeof body.lock_id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.lock_id))return reply({error:'Choose a lock.'},400);
   const {data:lock,error}=await admin.from('ts_locks').select('id,provider,provider_device_id,capabilities').eq('id',body.lock_id).eq('owner_id',owner).maybeSingle();
   if(error)throw Error('storage');
   if(!lock||lock.provider!=='seam')return reply({error:'Lock unavailable.'},404);
   const {data:connections,error:connectionError}=await admin.from('ts_lock_connections').select('id').eq('owner_id',owner);
   if(connectionError)throw Error('storage');
   const access=seamAccess({client:seam,ownerId:owner,connectionIds:connections.map(c=>c.id)});
   const observation=await access.observe(lock.provider_device_id);
   const saved=await admin.from('ts_locks').update({online:observation.online,synced_at:observation.observed_at,capabilities:{...lock.capabilities,online_codes:observation.timed_codes,code_lengths:observation.code_lengths}}).eq('id',lock.id).eq('owner_id',owner).eq('provider_device_id',observation.device_id).select('id');
   if(saved.error||saved.data?.length!==1)throw Error('storage');
   return reply({verified:observation.timed_codes,message:observation.timed_codes?'Online connection and scheduled-code support verified. Assign this lock to its listing, then complete a keypad test before activation.':'This lock needs an online connection and verified scheduled-code support before guest access can be activated.'});
  }
  if(body.action==='connect'){
   const view=await seam.connect(owner);
   const {error}=await admin.from('ts_lock_connections').insert({id:view.id,owner_id:owner});
   if(error)throw Error('storage');
   return reply({connection_id:view.id,url:view.url});
  }
  if(body.action==='sync'||body.action==='resume'){
   if(typeof body.connection_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.connection_id))return reply({error:'Choose a connection.'},400);
   const {data:connection,error}=await admin.from('ts_lock_connections').select('id').eq('id',body.connection_id).eq('owner_id',owner).maybeSingle();
   if(error)throw Error('storage');if(!connection)return reply({error:'Connection unavailable.'},404);
   if(body.action==='resume')return reply(await seam.resume(owner,connection.id));
   const locks=await seam.inventory(owner,connection.id);
   for(const lock of locks){
    const {data:existing,error:readError}=await admin.from('ts_locks').select('id').eq('owner_id',owner).eq('provider','seam').eq('provider_device_id',lock.provider_device_id).maybeSingle();
    if(readError)throw Error('storage');
    const result=existing?await admin.from('ts_locks').update(lock).eq('id',existing.id).eq('owner_id',owner):await admin.from('ts_locks').insert({...lock,owner_id:owner});
    if(result.error)throw Error('storage');
   }
   return reply({imported:locks.length,mode:status.mode});
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){return reply({error:e instanceof SeamError?e.message:'Lock connection could not be saved. Retry the operation.',code:e instanceof SeamError?e.code:'unavailable'},e instanceof SeamError&&e.code==='pending'?409:502);}
});
