import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {seamClient,SeamError} from '../../../server/seam.mjs';
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
 if(Number(req.headers.get('content-length'))>2048)return reply({error:'Request too large.'},413);
 let body;try{const raw=await req.text();if(raw.length>2048)return reply({error:'Request too large.'},413);body=JSON.parse(raw);}catch{return reply({error:'Invalid request.'},400);}
 const apiKey=Deno.env.get('SEAM_API_KEY');
 if(body.action==='status')return reply({configured:Boolean(apiKey)});
 if(!apiKey)return reply({error:'Seam is not configured. A server API key is required.',code:'not_configured'},503);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const seam=seamClient({apiKey});
 try{
  if(body.action==='connect'){
   const view=await seam.connect(owner);
   const {error}=await admin.from('ts_lock_connections').insert({id:view.id,owner_id:owner});
   if(error)throw Error('storage');
   return reply({connection_id:view.id,url:view.url});
  }
  if(body.action==='sync'){
   if(typeof body.connection_id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.connection_id))return reply({error:'Choose a connection.'},400);
   const {data:connection,error}=await admin.from('ts_lock_connections').select('id').eq('id',body.connection_id).eq('owner_id',owner).maybeSingle();
   if(error)throw Error('storage');if(!connection)return reply({error:'Connection unavailable.'},404);
   const locks=await seam.inventory(owner,connection.id);
   for(const lock of locks){
    const {data:existing,error:readError}=await admin.from('ts_locks').select('id').eq('owner_id',owner).eq('provider','seam').eq('provider_device_id',lock.provider_device_id).maybeSingle();
    if(readError)throw Error('storage');
    const result=existing?await admin.from('ts_locks').update(lock).eq('id',existing.id).eq('owner_id',owner):await admin.from('ts_locks').insert({...lock,owner_id:owner});
    if(result.error)throw Error('storage');
   }
   return reply({imported:locks.length});
  }
  return reply({error:'Unknown action.'},400);
 }catch(e){return reply({error:e instanceof SeamError?e.message:'Lock connection could not be saved. Retry the operation.',code:e instanceof SeamError?e.code:'unavailable'},e instanceof SeamError&&e.code==='pending'?409:502);}
});
