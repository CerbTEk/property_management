import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('native database grants are service-only, rate-limited, expiring and single-use',async()=>{
 const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',hash='a'.repeat(64),binding='b'.repeat(64);
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261006120856_native_lock_accounts.sql',import.meta.url),'utf8'));
 await db.exec('set role service_role');
 const begin=async(owner=a)=>db.query("select ts_begin_native_lock($1,'tedee',$2,$3,'synthetic-cipher',now()+interval '10 minutes') as revision",[owner,hash,binding]);
 const revision=(await begin()).rows[0].revision;assert.ok(revision);assert.equal((await begin()).rows[0].revision,null);
 const consume=async(owner=a,bind=binding)=>db.query("select * from ts_consume_native_lock($1,'tedee',$2,$3)",[owner,hash,bind]);
 assert.equal((await consume(b)).rows.length,0);assert.equal((await consume(a,'c'.repeat(64))).rows.length,0);
 const outcomes=await Promise.all([consume(),consume()]);assert.equal(outcomes.reduce((sum,r)=>sum+r.rows.length,0),1);
 await db.query("update ts_native_lock_accounts set last_attempt_at=null where owner_id=$1",[a]);await begin();
 await db.query("update ts_native_lock_authorizations set expires_at=now()-interval '1 second'");assert.equal((await consume()).rows.length,0);
 await db.query("select ts_disconnect_native_lock($1,'tedee')",[a]);assert.equal((await db.query('select * from ts_native_lock_authorizations')).rows.length,0);
 assert.equal((await db.query('select revision from ts_native_lock_accounts')).rows[0].revision===revision,false);
 for(const role of ['anon','authenticated']){
  await db.exec('reset role;set role '+role);
  for(const table of ['ts_native_lock_accounts','ts_native_lock_authorizations'])await assert.rejects(()=>db.query('select * from '+table),e=>e.code==='42501');
  await assert.rejects(()=>consume(),e=>e.code==='42501');await assert.rejects(()=>begin(),e=>e.code==='42501');await assert.rejects(()=>db.query("select ts_disconnect_native_lock($1,'tedee')",[a]),e=>e.code==='42501');
 }
 await db.close();
});
