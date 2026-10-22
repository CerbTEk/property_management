import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('TTLock automation is explicit service-only consent, version-fenced and invalidated by connection changes',async()=>{
 const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
   grant usage on schema public,auth to authenticated,service_role,anon;`);
  await db.exec(await readFile(new URL('../database/ttlock_accounts.sql',import.meta.url),'utf8'));
  for(const table of ['properties','reservations','locks','lock_assignments','native_lock_accounts'])await db.exec(`create table public.ts_${table}(owner_id uuid not null references auth.users(id));`);
  await db.exec(await readFile(new URL('../database/access_lifecycle.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../database/ttlock_automation.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  await db.query("insert into ts_ttlock_accounts(owner_id,status,provider_uid,sealed_tokens,expires_at) values($1,'connected','100','synthetic',now()+interval '1 hour'),($2,'disconnected',null,null,null)",[a,b]);
  const row=async(owner=a)=>(await db.query('select automation_enabled,automation_revision,automation_updated_at from ts_ttlock_accounts where owner_id=$1',[owner])).rows[0];
  const revision=async()=>(await db.query('select revision from ts_access_work where owner_id=$1',[a])).rows[0].revision;
  const toggle=async(enabled,expected,owner=a)=>(await db.query('select * from ts_set_ttlock_automation($1,$2,$3)',[owner,enabled,expected])).rows[0];
  const initial=await row();assert.equal(initial.automation_enabled,false);assert.equal(initial.automation_updated_at,null);
  const workBefore=await revision(),enabled=await toggle(true,initial.automation_revision);
  assert.equal(enabled.automation_enabled,true);assert.notEqual(enabled.automation_revision,initial.automation_revision);assert.ok(enabled.automation_updated_at);assert.equal(await revision(),workBefore+1);
  await assert.rejects(()=>toggle(false,initial.automation_revision),e=>e.code==='40001');
  const idempotent=await toggle(true,enabled.automation_revision);assert.deepEqual(idempotent,enabled);assert.equal(await revision(),workBefore+1);
  assert.equal((await row(b)).automation_enabled,false);
  await assert.rejects(async()=>toggle(true,(await row(b)).automation_revision,b),/Connect/);
  await assert.rejects(()=>toggle(null,enabled.automation_revision),/Complete/);
  await assert.rejects(()=>toggle(true,null),/Complete/);
  // Token rotation is not a new consent and must preserve the consent version.
  await db.query("update ts_ttlock_accounts set sealed_tokens='new synthetic',revision=gen_random_uuid() where owner_id=$1",[a]);
  assert.deepEqual(await row(),enabled);
  await db.query("update ts_ttlock_accounts set status='disconnected',sealed_tokens=null,expires_at=null where owner_id=$1",[a]);
  const disconnected=await row();assert.equal(disconnected.automation_enabled,false);assert.notEqual(disconnected.automation_revision,enabled.automation_revision);
  await db.query("update ts_ttlock_accounts set status='connected',sealed_tokens='synthetic',expires_at=now()+interval '1 hour' where owner_id=$1",[a]);
  assert.equal((await row()).automation_enabled,false);
  const reenabled=await toggle(true,(await row()).automation_revision);
  await db.query("update ts_ttlock_accounts set provider_uid='200' where owner_id=$1",[a]);
  assert.equal((await row()).automation_enabled,false);assert.notEqual((await row()).automation_revision,reenabled.automation_revision);
  // Pausing also invalidates the queued snapshot, even while a worker owns a lease.
  const active=await toggle(true,(await row()).automation_revision);
  const claim=(await db.query('select * from ts_claim_access_work(5)')).rows.find(r=>r.owner_id===a);
  const paused=await toggle(false,active.automation_revision);assert.equal(paused.automation_enabled,false);
  const done=(await db.query("select ts_finish_access_work($1,$2,$3,clock_timestamp()+interval '15 minutes') as done",[a,claim.lease_token,claim.leased_revision])).rows[0].done;assert.equal(done,false);
  for(const role of ['anon','authenticated']){
   await db.exec('reset role;set role '+role);
   await assert.rejects(()=>toggle(true,paused.automation_revision),e=>e.code==='42501');
   await assert.rejects(()=>db.query('update ts_ttlock_accounts set automation_enabled=true where owner_id=$1',[a]),e=>e.code==='42501');
   await assert.rejects(()=>row(),e=>e.code==='42501');
  }
 }finally{await db.close();}
});
