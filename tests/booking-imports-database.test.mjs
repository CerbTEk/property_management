import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';import {randomUUID} from 'node:crypto';
test('booking import batches are atomic, retry safe, immutable, owner isolated and MFA protected',async()=>{
 const db=new PGlite({extensions:{btree_gist}}),a=randomUUID(),b=randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;insert into auth.users values('${a}'),('${b}');`);
 for(const file of ['schema','calendar_controls','guest_phone_code','turnover_tasks','turnover_checklists','message_schedules','booking_imports'])await db.exec(await readFile(new URL(`../database/${file}.sql`,import.meta.url),'utf8'));
 await db.exec(`create policy test_mfa on ts_properties as restrictive to authenticated using((select auth.jwt()->>'aal')='aal2') with check((select auth.jwt()->>'aal')='aal2');`);
 const login=async(id,aal='aal2')=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false);`);
 await login(a);const p=(await db.query(`insert into ts_properties(owner_id,name,weekday_cents,weekend_cents) values($1,'Import test',5600,7000) returning id`,[a])).rows[0].id;
 const row={external_id:'A1',guest:'Test guest',arrival:'2026-11-01',departure:'2026-11-03',guests:2,status:'confirmed',note:'',guest_phone_last4:'0123'};
 const save=async(rows=[row],source='uplisting',property=p)=>(await db.query('select ts_import_bookings($1,$2,$3) as result',[property,source,JSON.stringify(rows)])).rows[0].result;
 await db.query(`insert into ts_message_rules(owner_id,property_id,name,body,event) values($1,$2,'Confirmation','Hello {{guest}}','confirmation')`,[a,p]);
 assert.deepEqual(await save(),{added:1,skipped:0});assert.equal((await db.query('select state from ts_message_queue')).rows[0].state,'suppressed');
 await db.query(`insert into ts_message_rules(owner_id,property_id,name,body,event) values($1,$2,'Later rule','Hello {{guest}}','check_in')`,[a,p]);assert.ok((await db.query('select state from ts_message_queue')).rows.every(r=>r.state==='suppressed'));assert.equal((await db.query('select * from ts_operations_tasks')).rows.length,2);
 assert.deepEqual(await save(),{added:0,skipped:1});await assert.rejects(()=>save([{...row,guest:'Changed'}]),/different details/);
 await db.query(`update ts_reservations set status='cancelled'`);assert.deepEqual(await save(),{added:0,skipped:1});assert.equal((await db.query('select status from ts_reservations')).rows[0].status,'cancelled');
 const second={...row,external_id:'A2',guest:'Second',arrival:'2026-11-04',departure:'2026-11-06'};
 await assert.rejects(()=>save([second,{...second,external_id:'A3',guest:'Overlap'}]),e=>e.code==='23P01');assert.equal((await db.query('select * from ts_booking_imports')).rows.length,1);assert.equal((await db.query('select * from ts_reservations')).rows.length,1);assert.equal((await db.query('select * from ts_operations_tasks')).rows.length,2);
 await assert.rejects(()=>save([{...row,external_id:'A4'}]),/Possible existing booking/);await assert.rejects(()=>save([second,second]),/Duplicate original/);
 for(const patch of [{guests:1.5},{arrival:'2026-02-30'},{departure:'2026-11-01'},{guest_phone_last4:'123'},{status:'pending'},{owner_id:b},{note:null}])await assert.rejects(()=>save([{...second,...patch}]));
 assert.deepEqual(await save([{...second,status:'cancelled'}]),{added:1,skipped:0});assert.equal((await db.query('select * from ts_operations_tasks')).rows.length,2);
 await assert.rejects(()=>db.query('update ts_booking_imports set source=$1',['other']),e=>e.code==='42501');
 await db.exec('reset role');await assert.rejects(()=>db.query('delete from ts_booking_imports'),/immutable/);
 await login(b);assert.equal((await db.query('select * from ts_booking_imports')).rows.length,0);await assert.rejects(()=>save(),/owned listing/);
 await login(a,'aal1');assert.equal((await db.query('select * from ts_booking_imports')).rows.length,0);await assert.rejects(()=>save(),/owned listing/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>save(),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from ts_booking_imports'),e=>e.code==='42501');
 }finally{await db.close();}
});
