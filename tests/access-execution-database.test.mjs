import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('provider checkpoints are owner/lease fenced, durable before writes and inaccessible to hosts',async()=>{
 const db=new PGlite(),owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',p='00000000-0000-0000-0000-000000000003',b='00000000-0000-0000-0000-000000000004',l='00000000-0000-0000-0000-000000000005';
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql as $$select null::uuid$$;create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;grant usage on schema public,auth to service_role,authenticated,anon;`);
 for(const name of ['properties','reservations','locks','lock_assignments','ttlock_accounts','native_lock_accounts','lock_connections'])await db.exec(`create table ts_${name}(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid,lock_id uuid,status text,kind text,provider text,provider_lock_id text,provider_device_id text,enabled boolean default true);grant all on ts_${name} to service_role;`);
 await db.exec(await readFile(new URL('../database/access_lifecycle.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/access_execution.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../database/seam_access_execution.sql',import.meta.url),'utf8'));
 await db.exec(`set role service_role;insert into ts_properties(id,owner_id) values('${p}','${owner}');insert into ts_reservations(id,owner_id,property_id,status,kind) values('${b}','${owner}','${p}','confirmed','booking');insert into ts_locks(id,owner_id,provider,provider_lock_id) values('${l}','${owner}','ttlock','123');insert into ts_lock_assignments(owner_id,property_id,lock_id) values('${owner}','${p}','${l}');`);
 const claim=async()=>(await db.query('select * from ts_claim_access_work(10)')).rows[0];let job=await claim();
 const grant={booking_id:b,lock_id:l,provider:'ttlock',device_id:'123',code_tag:'a'.repeat(64),starts_at:'2026-10-07T19:00:00Z',ends_at:'2026-10-09T15:00:00Z'};
 const begin=async(op,id,g=grant)=>(await db.query('select * from ts_begin_access_operation($1,$2,$3,$4,$5,$6)',[owner,job.lease_token,job.leased_revision,op,id,JSON.stringify(g)])).rows[0];
 const r=await begin('create',null);assert.equal(r.state,'uncertain');assert.equal(r.provider_acknowledged,false);assert.equal(r.provider_code_id,null);
 await assert.rejects(()=>begin('create',null),e=>e.code==='23505');
 const ack=async(row,token=job.lease_token)=>(await db.query('select ts_ack_access_operation($1,$2,$3,$4,$5,$6) as ok',[owner,token,job.leased_revision,row.id,row.operation_token,'456'])).rows[0].ok;
 const settle=async(row,state)=>(await db.query('select ts_settle_access_operation($1,$2,$3,$4,$5,$6,$7) as ok',[owner,job.lease_token,job.leased_revision,row.id,row.operation_token,state,'456'])).rows[0].ok;
 assert.equal(await settle(r,'revoked'),false);assert.equal(await ack(r),true);assert.equal(await settle(r,'installed'),true);
 const updated=await begin('update',r.id,{...grant,ends_at:'2026-10-10T15:00:00Z'});assert.equal(updated.state,'uncertain');assert.notEqual(updated.operation_token,r.operation_token);assert.equal(await ack(r),false);
 // A booking edit after the provider checkpoint makes all old acknowledgements stale.
 await db.query("update ts_reservations set status='cancelled' where id=$1",[b]);assert.equal(await ack(updated),false);assert.equal(await settle(updated,'installed'),false);
 await db.query("update ts_access_work set lease_until=clock_timestamp()-interval '1 second' where owner_id=$1",[owner]);job=await claim();
 assert.equal(await settle(updated,'installed'),true);const revoked=await begin('revoke',r.id,null);assert.equal(await settle(revoked,'revoked'),false);assert.equal(await ack(revoked),true);assert.equal(await settle(revoked,'revoked'),true);
 // Foreign routes and receipts cannot be substituted under another owner's lease.
 await db.query("update ts_reservations set status='confirmed' where id=$1",[b]);
 await db.query("update ts_access_work set lease_until=clock_timestamp()-interval '1 second' where owner_id=$1",[owner]);job=await claim();
 await assert.rejects(()=>begin('create',null,{...grant,booking_id:other}),/route unavailable/);
 // The same fencing applies to Seam IDs; a native ID cannot masquerade as Seam.
 await db.query("update ts_locks set provider='seam',provider_device_id=$1 where id=$2",['00000000-0000-0000-0000-000000000010',l]);
 await db.query("update ts_access_work set lease_until=clock_timestamp()-interval '1 second' where owner_id=$1",[owner]);job=await claim();
 await assert.rejects(()=>begin('create',null,grant),/route unavailable/);
 const seam=await begin('create',null,{...grant,provider:'seam',device_id:'00000000-0000-0000-0000-000000000010'});
 assert.equal(seam.provider,'seam');assert.ok(seam.operation_started_at);
 await db.exec('set role authenticated');await assert.rejects(()=>begin('create',null),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from ts_access_receipts'),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from ts_access_device_activation'),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from ts_access_runner_config'),e=>e.code==='42501');
 await db.exec('set role anon');await assert.rejects(()=>db.query('select ts_access_work_current($1,$2,$3)',[owner,job.lease_token,job.leased_revision]),e=>e.code==='42501');
 await db.close();
});
