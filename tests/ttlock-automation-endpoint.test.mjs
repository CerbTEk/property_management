import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const owner='3f03551d-89de-4214-aa7a-db7a86fe1735',revision='00000000-0000-0000-0000-000000000001';
const raw=await readFile(new URL('../supabase/functions/smart-lock-connect/index.ts',import.meta.url),'utf8');
// Isolate the actual Deno route with synthetic clients; never call a provider.
const source=raw.replace(/^import .*;\n/gm,'').replace(/:unknown/g,'').replace(/(Deno\.env\.get\('[A-Z_]+'\))!/g,'$1');
function fixture({userId=owner,aal='aal2',ready=true,rpcError=null}={}){
 let handler,calls=[];
 const account={automation_enabled:false,automation_revision:revision,automation_updated_at:null,sealed_tokens:'never expose',provider_uid:'private'};
 const chain={select(){return this;},eq(){return this;},async maybeSingle(){return {data:account,error:null};}};
 const admin={from(){return chain;},async rpc(name,args){calls.push({name,args});return {data:rpcError?null:[{automation_enabled:args.p_enabled,automation_revision:revision,automation_updated_at:null}],error:rpcError};}};
 const client={auth:{async getUser(){return {data:{user:userId?{id:userId}:null},error:null};},async getClaims(){return {data:{claims:{sub:userId,aal}},error:null};}}};
 const Deno={env:{get:name=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',SUPABASE_ANON_KEY:'synthetic-public'}[name])},serve:fn=>{handler=fn;}};
 new Function('Deno','createClient','ttlockAccounts','TTLockError',source)(Deno,(_url,key)=>key==='synthetic-service'?admin:client,()=>({status:async()=>({ready,configured:ready,connected:ready})}),class extends Error{});
 const request=async(body,authorization='Bearer synthetic')=>{const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
 return {request,calls};
}
test('TTLock automation endpoint binds toggles to verified identity and validates boolean/version',async()=>{
 const f=fixture(),base={action:'ttlock_automation',enabled:true,expected_revision:revision};
 assert.equal((await f.request(base,null)).status,401);
 for(const changed of [{enabled:'true'},{enabled:null},{expected_revision:'bad'},{expected_revision:null}])assert.equal((await f.request({...base,...changed})).status,400);
 assert.equal(f.calls.length,0);
 const response=await f.request({...base,owner_id:'other-host'});assert.equal(response.status,200);
 assert.deepEqual(f.calls,[{name:'ts_set_ttlock_automation',args:{p_owner:owner,p_enabled:true,p_expected_revision:revision}}]);
 assert.equal(JSON.stringify(response).includes('never expose'),false);
});
test('automation endpoint rejects missing identity and weak assurance; connected configuration gates enabling',async()=>{
 const base={action:'ttlock_automation',enabled:true,expected_revision:revision};
 for(const opts of [{userId:null},{userId:'00000000-0000-0000-0000-000000000002',aal:'aal1'}]){
  const f=fixture(opts);assert.ok([401,403].includes((await f.request(base)).status));assert.equal(f.calls.length,0);
 }
 const f=fixture({ready:false});assert.equal((await f.request(base)).status,409);assert.equal(f.calls.length,0);
 assert.equal((await f.request({...base,enabled:false})).status,200);assert.equal(f.calls[0].args.p_enabled,false);
 const conflict=fixture({rpcError:{code:'40001'}});assert.equal((await conflict.request(base)).status,409);
});
test('TTLock status exposes only safe automation metadata',async()=>{
 const f=fixture(),response=await f.request({action:'ttlock_status'});
 assert.equal(response.status,200);assert.equal(response.body.automation_enabled,false);assert.equal(response.body.automation_revision,revision);
 assert.equal(JSON.stringify(response.body).includes('never expose'),false);assert.equal('provider_uid' in response.body,false);
});
