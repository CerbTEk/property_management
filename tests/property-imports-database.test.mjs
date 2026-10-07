import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';import {randomUUID} from 'node:crypto';
test('listing imports atomically create/link without overwrites, preserve original receipts and enforce ownership/MFA',async()=>{
 const db=new PGlite({extensions:{btree_gist}}),a=randomUUID(),b=randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;insert into auth.users values('${a}'),('${b}');`);
 for(const f of ['schema','property_imports'])await db.exec(await readFile(new URL(`../database/${f}.sql`,import.meta.url),'utf8'));
 const login=async(id,aal='aal2')=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false);`);await login(a);
 const row={external_id:'L1',name:'First import',timezone:'America/New_York',currency:'USD',weekday_cents:5601,weekend_cents:7000,markup_percent:18.34,max_guests:2,min_stay:1,check_in:'15:00',check_out:'11:00',target_property:null};
 const save=async(rows=[row],source='uplisting')=>(await db.query('select ts_import_properties($1,$2) as result',[source,JSON.stringify(rows)])).rows[0].result;
 assert.deepEqual(await save(),{created:1,linked:0,skipped:0});const p=(await db.query('select * from ts_properties')).rows[0];assert.equal(p.weekday_cents,5601);
 assert.deepEqual(await save(),{created:0,linked:0,skipped:1});await db.query('update ts_properties set weekday_cents=6000 where id=$1',[p.id]);assert.deepEqual(await save(),{created:0,linked:0,skipped:1});assert.equal((await db.query('select weekday_cents from ts_properties')).rows[0].weekday_cents,6000);
 await assert.rejects(()=>save([{...row,weekday_cents:6000}]),/different saved details/);
 const second={...row,external_id:'L2',name:'Second import'};await assert.rejects(()=>save([second,{...second,external_id:'L3',name:'Third',timezone:'Not/AZone'}]),/timezone/);assert.equal((await db.query('select * from ts_properties')).rows.length,1);assert.equal((await db.query('select * from ts_property_imports')).rows.length,1);
 await assert.rejects(()=>save([second,second]),/Repeated/);await assert.rejects(()=>save([{...second,name:'First import'}]),/name already/);
 const manual=(await db.query(`insert into ts_properties(owner_id,name,timezone,weekday_cents,weekend_cents,markup_percent,max_guests,min_stay,check_in,check_out) values($1,'Manual','America/New_York',5601,7000,18.34,2,1,'15:00','11:00') returning id`,[a])).rows[0].id;
 const link={...row,external_id:'L4',name:'Manual',target_property:manual};await assert.rejects(()=>save([{...link,weekday_cents:6000}]),/must match/);assert.equal((await db.query('select weekday_cents from ts_properties where id=$1',[manual])).rows[0].weekday_cents,5601);
 assert.deepEqual(await save([link]),{created:0,linked:1,skipped:0});assert.equal((await db.query('select * from ts_properties')).rows.length,2);
 await assert.rejects(()=>save([{...link,external_id:'L5'}]),e=>e.code==='23505');
 for(const patch of [{currency:'EUR'},{markup_percent:1.001},{min_stay:366},{check_out:'24:00'},{weekday_cents:99},{target_property:17},{owner_id:b},{timezone:null}])await assert.rejects(()=>save([{...second,...patch}]));
 await assert.rejects(()=>db.query('update ts_property_imports set source=$1',['other']),e=>e.code==='42501');await db.exec('reset role');await assert.rejects(()=>db.query('delete from ts_property_imports'),/immutable/);
 await login(b);assert.equal((await db.query('select * from ts_property_imports')).rows.length,0);await assert.rejects(()=>save([link]),/owned existing/);
 await login(a,'aal1');assert.equal((await db.query('select * from ts_property_imports')).rows.length,0);await assert.rejects(()=>save(),/authentication required/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>save(),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from ts_property_imports'),e=>e.code==='42501');
 }finally{await db.close();}
});
