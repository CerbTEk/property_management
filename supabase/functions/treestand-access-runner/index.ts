import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {ttlockAccounts} from '../../../server/ttlock-auth.mjs';
import {ttlockAccess} from '../../../server/ttlock-access.mjs';
import {accessPlanningStore} from '../../../server/access-worker.mjs';
import {accessExecutionStore} from '../../../server/access-execution.mjs';
import {ttlockRunner} from '../../../server/ttlock-runner.mjs';

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
 if(difference)return reply({error:'Internal worker authentication required.'},401);
 if((await req.text()).trim())return reply({error:'This worker does not accept caller-selected jobs.'},400);
 const enabled=Deno.env.get('TTLOCK_AUTOMATION_ENABLED')==='true';
 if(!enabled)return reply({state:'disabled',processed:0});
 const approvedDevices=(Deno.env.get('TTLOCK_AUTOMATION_TEST_DEVICES')||'').split(',').map(s=>s.trim()).filter(s=>/^[a-f0-9-]{36}:[1-9][0-9]{0,14}$/i.test(s));
 if(!approvedDevices.length)return reply({error:'No physical test devices have been configured.'},503);
 const clientId=Deno.env.get('TTLOCK_CLIENT_ID'),clientSecret=Deno.env.get('TTLOCK_CLIENT_SECRET'),encryptionKey=Deno.env.get('TTLOCK_TOKEN_ENCRYPTION_KEY'),fingerprintKey=Deno.env.get('TREESTAND_ACCESS_FINGERPRINT_KEY');
 if(!clientId||!clientSecret||!encryptionKey||!fingerprintKey)return reply({error:'Native access configuration is incomplete.'},503);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,expected,{auth:{persistSession:false}});
 const accountStore={
  async read(owner){const {data,error}=await db.from('ts_ttlock_accounts').select('*').eq('owner_id',owner).maybeSingle();if(error)throw Error('storage');return data;},
  async save(owner,revision,values){const {data,error}=await db.from('ts_ttlock_accounts').update({...values,revision:crypto.randomUUID(),updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('revision',revision).select('owner_id');if(error)throw Error('storage');return data?.length===1;}
 };
 const accounts=ttlockAccounts({clientId,clientSecret,encryptionKey,store:accountStore});
 const planningStore=accessPlanningStore(db),executionStore=accessExecutionStore(db,planningStore);
 const providerForOwner=async owner=>ttlockAccess({clientId,accessToken:await accounts.accessToken(owner),ownerId:owner,fingerprintKey});
 try{return reply(await ttlockRunner({planningStore,executionStore,providerForOwner,fingerprintKey,enabled,approvedDevices})());}
 catch{return reply({error:'Native access runner is temporarily unavailable.'},503);}
});
