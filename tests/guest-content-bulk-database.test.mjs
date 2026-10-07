import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';import {displaySnapshot} from '../src/guest-content.mjs';
test('bulk content applies atomically, preserves local fields, rejects stale previews and respects RLS/MFA',async()=>{
 const db=new PGlite({extensions:{btree_gist}}),owner=randomUUID(),foreign=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated;insert into auth.users values('${owner}'),('${foreign}');`);
 for(const name of ['schema','guest_experience','display_personalization','display_music'])await db.exec(await readFile(new URL(`../database/${name}.sql`,import.meta.url),'utf8'));
 await db.exec((await readFile(new URL('../database/display_media.sql',import.meta.url),'utf8')).split('create table public.ts_display_images')[0]);
 for(const table of ['ts_properties','ts_guest_displays'])await db.exec(`create policy test_mfa on public.${table} as restrictive to authenticated using((select auth.jwt()->>'aal')='aal2') with check((select auth.jwt()->>'aal')='aal2');`);
 await db.exec(await readFile(new URL('../database/guest_content_bulk.sql',import.meta.url),'utf8'));
 const property=async(who,name)=>(await db.query('insert into ts_properties(owner_id,name,weekday_cents,weekend_cents) values($1,$2,5600,7000) returning id',[who,name])).rows[0].id;
 const s=await property(owner,'Source'),a=await property(owner,'Target'),n=await property(owner,'New'),x=await property(foreign,'Foreign');
 await db.query("insert into ts_guest_displays(owner_id,property_id,house_rules,contact,guidebook,music_volume) values($1,$2,'Quiet after 10','Host','Shared guide',25),($1,$3,'Local rules','','Local guide',5)",[owner,s,a]);
 const login=async(id,aal='aal2')=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claims','{"aal":"${aal}"}',false);`);
 await login(owner);const row=async id=>(await db.query('select * from ts_guest_displays where property_id=$1',[id])).rows[0];
 const apply=async(targets,fields=['house_rules'],mode='replace',empty=false,source)=>(await db.query('select ts_apply_guest_content($1,$2,$3,$4,$5,$6) result',[s,JSON.stringify(source??displaySnapshot(await row(s))),JSON.stringify(targets),fields,mode,empty])).rows[0].result;
 const targets=async(...ids)=>Promise.all(ids.map(async id=>({id,expected:(await row(id))?displaySnapshot(await row(id)):null})));
 assert.deepEqual(await apply(await targets(a,n)),{changed:2,unchanged:0});assert.equal((await row(a)).guidebook,'Local guide');assert.equal((await row(a)).music_volume,5);assert.equal((await row(n)).music_volume,15);
 assert.deepEqual(await apply(await targets(a,n)),{changed:0,unchanged:2});assert.deepEqual(await apply(await targets(a),['guidebook','contact'],'empty'),{changed:1,unchanged:0});assert.equal((await row(a)).guidebook,'Local guide');assert.equal((await row(a)).contact,'Host');
 const stale=await targets(a,n);await db.query("update ts_guest_displays set contact='Changed' where property_id=$1",[n]);await assert.rejects(()=>apply(stale,['guidebook']),/Destination changed/);assert.equal((await row(a)).guidebook,'Local guide');
 const missing=await property(owner,'Missing');await assert.rejects(()=>apply([{id:missing,expected:null},...stale],['guidebook']),/Destination changed/);assert.equal(await row(missing),undefined);
 const oldSource=displaySnapshot(await row(s));await db.query("update ts_guest_displays set house_rules='New rules' where property_id=$1",[s]);await assert.rejects(async()=>apply(await targets(a),['house_rules'],'replace',false,oldSource),/Source content changed/);
 await db.query("update ts_guest_displays set guidebook='' where property_id=$1",[s]);await assert.rejects(async()=>apply(await targets(a),['guidebook']),/blank/);await apply(await targets(a),['guidebook'],'replace',true);assert.equal((await row(a)).guidebook,'');
 await assert.rejects(()=>apply([{id:x,expected:null}]),/owned/);await assert.rejects(async()=>apply(await targets(s)),/different destination/);await assert.rejects(async()=>apply([...await targets(a),...await targets(a)]),/duplicates/);
 for(const fields of [['owner_id'],['house_rules','house_rules'],[],[null]])await assert.rejects(async()=>apply(await targets(a),fields));await assert.rejects(async()=>apply(await targets(a),['music_volume'],'empty'),/text only/);
 await login(foreign);await assert.rejects(()=>apply([{id:x,expected:null}],['house_rules'],'replace',false,oldSource),/owned/);
 await login(owner,'aal1');await assert.rejects(()=>apply([{id:a,expected:null}],['house_rules'],'replace',false,oldSource),/authentication/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>apply([{id:a,expected:null}],['house_rules'],'replace',false,oldSource),e=>e.code==='42501');
 }finally{await db.close();}
});
