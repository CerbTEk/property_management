import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('access queue captures changes and denies browser writes; leases fence edits and expired workers',async()=>{
 const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 grant usage on schema public,auth to authenticated,service_role,anon;`);
 for(const table of ['properties','reservations','locks','lock_assignments','ttlock_accounts','native_lock_accounts']){
  await db.exec(`create table public.ts_${table}(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),fixture text);grant select,insert,update,delete on public.ts_${table} to service_role,authenticated;`);
 }
 await db.exec(await readFile(new URL('../database/access_lifecycle.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated;set test.uid='${a}';set test.aal='aal2';insert into ts_reservations(owner_id) values('${a}')`);
 await assert.rejects(()=>db.query('select * from ts_access_work'),e=>e.code==='42501');
 await assert.rejects(()=>db.query('select * from ts_access_receipts'),e=>e.code==='42501');
 await assert.rejects(()=>db.query('select * from ts_claim_access_work(10)'),e=>e.code==='42501');
 await assert.rejects(()=>db.query('insert into ts_access_work(owner_id) values($1)',[b]),e=>e.code==='42501');
 await assert.rejects(()=>db.query('insert into ts_locks(owner_id) values($1)',[b]),/not authorized/);
 await db.exec('set test.aal=aal1');await assert.rejects(()=>db.query('insert into ts_locks(owner_id) values($1)',[a]),/not authorized/);
 await db.exec('set role service_role');
 const claim=async()=>(await db.query('select * from ts_claim_access_work(10)')).rows;
 const first=(await claim())[0];assert.equal((await claim()).length,0);assert.equal(first.revision,1);
 const finish=async row=>(await db.query("select ts_finish_access_work($1,$2,$3,clock_timestamp()+interval '15 minutes') as done",[a,row.lease_token,row.leased_revision])).rows[0].done;
 // Mutation during a worker run invalidates its completion, without losing the new event.
 await db.query('update ts_reservations set fixture=$1 where owner_id=$2',['changed',a]);assert.equal(await finish(first),false);
 await db.query("update ts_access_work set lease_until=clock_timestamp()-interval '1 second' where owner_id=$1",[a]);
 const fresh=(await claim())[0];assert.equal(fresh.revision,2);assert.notEqual(fresh.lease_token,first.lease_token);assert.equal(await finish(first),false);assert.equal(await finish(fresh),true);assert.equal((await claim()).length,0);
 for(const table of ['properties','locks','lock_assignments','ttlock_accounts','native_lock_accounts'])await db.query(`insert into ts_${table}(owner_id) values($1)`,[a]);
 await db.query('delete from ts_lock_assignments where owner_id=$1',[a]);
 assert.equal((await db.query('select revision from ts_access_work where owner_id=$1',[a])).rows[0].revision,8);
 const due=(await claim())[0];await db.query("update ts_access_work set lease_until=clock_timestamp()-interval '1 second' where owner_id=$1",[a]);assert.equal(await finish(due),false);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from ts_access_work'),e=>e.code==='42501');
 await db.close();
});
