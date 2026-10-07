import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';import {randomUUID} from 'node:crypto';
test('financial imports atomically attach first charges, preserve newer history on retry and enforce identity, ownership and MFA',async()=>{
 const db=new PGlite({extensions:{btree_gist}}),a=randomUUID(),b=randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;insert into auth.users values('${a}'),('${b}');`);
 for(const file of ['schema','calendar_controls','guest_phone_code','turnover_tasks','turnover_checklists','message_schedules','booking_imports','booking_financials','financial_imports'])await db.exec(await readFile(new URL(`../database/${file}.sql`,import.meta.url),'utf8'));
 const login=async(id,aal='aal2')=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false);`);await login(a);
 const p=(await db.query(`insert into ts_properties(owner_id,name,weekday_cents,weekend_cents) values($1,'Financial import',5600,7000) returning id`,[a])).rows[0].id;
 const book={external_id:'B1',guest:'Guest',arrival:'2026-11-01',departure:'2026-11-03',guests:2,status:'confirmed',note:'',guest_phone_last4:null},second={...book,external_id:'B2',arrival:'2026-11-04',departure:'2026-11-06'};
 await db.query('select ts_import_bookings($1,$2,$3)',[p,'uplisting',JSON.stringify([book,second])]);
 const amounts={accommodation_cents:20001,discount_cents:1000,cleaning_cents:2000,extra_guest_cents:500,other_fee_cents:0,tax_cents:1500,channel_fee_cents:900};
 const row={external_id:'B1',guest:'Guest',arrival:book.arrival,departure:book.departure,guests:2,currency:'USD',amounts};
 const save=async(rows=[row],property=p,source='uplisting')=>(await db.query('select ts_import_financials($1,$2,$3) as result',[property,source,JSON.stringify(rows)])).rows[0].result;
 assert.deepEqual(await save(),{added:1,skipped:0});const first=(await db.query('select * from ts_booking_financials')).rows[0];assert.equal(Number(first.total_cents),23001);assert.match(first.note,/Imported uplisting/);
 assert.deepEqual(await save(),{added:0,skipped:1});await db.query('select ts_save_booking_financials($1,$2,$3,$4,$5,$6,$7,$8)',[first.reservation_id,1,p,book.arrival,book.departure,2,JSON.stringify({...amounts,accommodation_cents:25000}),'Reviewed later charge']);
 await db.query("update ts_reservations set status='cancelled',guest='Later guest' where id=$1",[first.reservation_id]);assert.deepEqual(await save(),{added:0,skipped:1});assert.equal((await db.query('select * from ts_booking_financials')).rows.length,2);
 await assert.rejects(()=>save([{...row,amounts:{...amounts,tax_cents:0}}]),/different imported/);
 const next={...row,external_id:'B2',arrival:second.arrival,departure:second.departure};await assert.rejects(()=>save([next,{...row,external_id:'MISSING'}]),/Import this booking/);assert.equal((await db.query('select * from ts_booking_financials')).rows.length,2);assert.equal((await db.query('select * from ts_financial_imports')).rows.length,1);
 for(const patch of [{guest:'Wrong'},{guests:1},{departure:'2026-11-07'},{currency:'EUR'},{amounts:{...amounts,discount_cents:30000}},{amounts:{...amounts,tax_cents:1.5}},{amounts:{...amounts,tax_cents:null}},{amounts:{...amounts,extra:'bad'}},{owner_id:b}])await assert.rejects(()=>save([{...next,...patch}]));
 await assert.rejects(()=>save([next,next]),/Repeated/);assert.equal((await db.query('select * from ts_financial_imports')).rows.length,1);
 const secondBooking=(await db.query('select reservation_id from ts_booking_imports where external_id=$1',['B2'])).rows[0].reservation_id;
 await db.query("update ts_reservations set status='cancelled' where id=$1",[secondBooking]);await assert.rejects(()=>save([next]),/settlement review/);
 await db.query("update ts_reservations set status='confirmed' where id=$1",[secondBooking]);await db.query('select ts_save_booking_financials($1,$2,$3,$4,$5,$6,$7,$8)',[secondBooking,0,p,second.arrival,second.departure,2,JSON.stringify(amounts),'Existing manual charges']);await assert.rejects(()=>save([next]),/already has charge history/);
 await assert.rejects(()=>db.query('update ts_financial_imports set source=$1',['other']),e=>e.code==='42501');await db.exec('reset role');await assert.rejects(()=>db.query('delete from ts_financial_imports'),/immutable/);
 await login(b);assert.equal((await db.query('select * from ts_financial_imports')).rows.length,0);await assert.rejects(()=>save(),/owned listing/);
 await login(a,'aal1');assert.equal((await db.query('select * from ts_financial_imports')).rows.length,0);await assert.rejects(()=>save());
 await db.exec('reset role;set role anon');await assert.rejects(()=>save(),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from ts_financial_imports'),e=>e.code==='42501');
 }finally{await db.close();}
});
