import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {ttlockAccounts} from '../../../server/ttlock-auth.mjs';
import {ttlockAccess} from '../../../server/ttlock-access.mjs';
import {accessPlanningStore} from '../../../server/access-worker.mjs';
import {accessExecutionStore} from '../../../server/access-execution.mjs';
import {accessRunner} from '../../../server/ttlock-runner.mjs';

import {seamClient} from '../../../server/seam.mjs';
import {seamAccess} from '../../../server/seam-access.mjs';

// Internal worker only; never accept a host JWT or an owner/device/PIN in the body.
Deno.serve(async req=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 const expected=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const supplied=req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!expected||!supplied)return reply({error:'Internal worker authentication required.'},401);
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(expected),digest(supplied)]);let difference=0;
 for(let i=0;i<a.length;i++)difference|=a[i]^b[i];
 const db=createClient(Deno.env.get('SUPABASE_URL')!,expected,{auth:{persistSession:false}});
 if(difference){
  const {data,error}=await db.from('ts_access_runner_config').select('token_hash').eq('id',true).maybeSingle();
  const suppliedHash=Array.from(b,n=>n.toString(16).padStart(2,'0')).join('');
  if(error||!data||data.token_hash!==suppliedHash)return reply({error:'Internal worker authentication required.'},401);
 }
 const raw=(await req.text()).trim();
 if(raw&&raw!=='{}')return reply({error:'This worker does not accept caller-selected jobs.'},400);
 const envFingerprint=Deno.env.get('TREESTAND_ACCESS_FINGERPRINT_KEY');
 const storedFingerprint=envFingerprint?{data:envFingerprint,error:null}:await db.rpc('ts_access_fingerprint_key');
 const fingerprintKey=storedFingerprint.error?null:storedFingerprint.data;
 if(!fingerprintKey)return reply({error:'Access verification configuration is incomplete.'},503);
 const {data:activation,error:activationError}=await db.from('ts_access_device_activation').select('owner_id,provider,device_id');
 if(activationError)return reply({error:'Access activation is unavailable.'},503);
 const providers={};
 const seamKey=Deno.env.get('SEAM_API_KEY');
 if(seamKey){
  const client=seamClient({apiKey:seamKey});
  providers.seam={approvedDevices:activation.filter(a=>a.provider==='seam').map(a=>a.owner_id+':'+a.device_id),providerForOwner:async owner=>{
   const {data,error}=await db.from('ts_lock_connections').select('id').eq('owner_id',owner);
   if(error)throw Error('Connection storage unavailable.');
   return seamAccess({client,ownerId:owner,connectionIds:data.map(c=>c.id),fingerprintKey});
  }};
 }
 const enabled=Deno.env.get('TTLOCK_AUTOMATION_ENABLED')==='true';
 const approvedDevices=(Deno.env.get('TTLOCK_AUTOMATION_TEST_DEVICES')||'').split(',').map(s=>s.trim()).filter(s=>/^[a-f0-9-]{36}:[1-9][0-9]{0,14}$/i.test(s));
 const clientId=Deno.env.get('TTLOCK_CLIENT_ID'),clientSecret=Deno.env.get('TTLOCK_CLIENT_SECRET'),encryptionKey=Deno.env.get('TTLOCK_TOKEN_ENCRYPTION_KEY');
 const accountStore={
  async read(owner){const {data,error}=await db.from('ts_ttlock_accounts').select('*').eq('owner_id',owner).maybeSingle();if(error)throw Error('storage');return data;},
  async save(owner,revision,values){const {data,error}=await db.from('ts_ttlock_accounts').update({...values,revision:crypto.randomUUID(),updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('revision',revision).select('owner_id');if(error)throw Error('storage');return data?.length===1;}
 };
 const accounts=ttlockAccounts({clientId,clientSecret,encryptionKey,store:accountStore});
 const planningStore=accessPlanningStore(db),executionStore=accessExecutionStore(db,planningStore);
 const providerForOwner=async owner=>ttlockAccess({clientId,accessToken:await accounts.accessToken(owner),ownerId:owner,fingerprintKey});
 if(enabled&&clientId&&clientSecret&&encryptionKey)providers.ttlock={providerForOwner,approvedDevices};
 try{return reply(await accessRunner({planningStore,executionStore,providers,fingerprintKey,enabled:true})());}
 catch{return reply({error:'Access runner is temporarily unavailable.'},503);}
});
