import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('photo edits queue fenced conversions, deletion withdraws video, and clients cannot forge output',async()=>{
 const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',p='10000000-0000-0000-0000-000000000001',photo=`${p}/20000000-0000-0000-0000-000000000001.jpg`;
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table ts_properties(id uuid primary key,owner_id uuid,unique(id,owner_id));insert into ts_properties values('${p}','${a}');
 create table ts_guest_displays(property_id uuid primary key,owner_id uuid,slideshow_seconds integer default 20);
 create table ts_display_images(id uuid primary key default gen_random_uuid(),property_id uuid,owner_id uuid,object_path text,position integer,caption text default '');
 alter table ts_display_images enable row level security;
 create policy photos_owner on ts_display_images to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
 grant all on ts_display_images to authenticated;grant all on ts_guest_displays to authenticated;
 create schema storage;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 await db.exec(await readFile(new URL('../database/display_video.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated;set test.uid='${a}';set test.aal='aal2';`);
 await db.query('insert into ts_display_images(property_id,owner_id,object_path,position) values($1,$2,$3,0)',[p,a,photo]);
 let row=(await db.query('select * from ts_display_videos')).rows[0];assert.equal(row.requested_version,1);assert.equal(row.state,'pending');
 await db.query("update ts_display_images set caption='Garden'");assert.equal((await db.query('select requested_version from ts_display_videos')).rows[0].requested_version,1);
 await assert.rejects(()=>db.query("update ts_display_videos set state='ready'"),e=>e.code==='42501');
 await db.exec(`set test.uid='${b}';`);assert.equal((await db.query('select * from ts_display_videos')).rows.length,0);
 await assert.rejects(()=>db.query('select * from ts_display_video_cleanup'),e=>e.code==='42501');
 await db.exec('reset role');const lease='30000000-0000-0000-0000-000000000001',video=`${p}/${lease}.mp4`;
 await db.query("update ts_display_videos set state='running',lease_id=$1,lease_until=now()+interval '20 minutes',object_path=$2",[lease,video]);
 await db.exec(`set role authenticated;set test.uid='${a}';`);
 await db.query('update ts_display_images set position=1');row=(await db.query('select * from ts_display_videos')).rows[0];assert.equal(row.requested_version,2);assert.equal(row.lease_id,null);assert.equal(row.object_path,video);
 await db.exec('reset role');assert.equal((await db.query("update ts_display_videos set state='ready' where lease_id=$1 and requested_version=1 returning property_id",[lease])).rows.length,0);
 await db.exec(`set role authenticated;set test.uid='${a}';`);await db.query('delete from ts_display_images');row=(await db.query('select * from ts_display_videos')).rows[0];assert.equal(row.object_path,null);assert.equal(row.requested_version,3);
 await db.exec('reset role');assert.equal((await db.query('select object_path from ts_display_video_cleanup')).rows[0].object_path,video);
 await db.exec(`set role authenticated;set test.uid='${a}';`);
 await db.query('insert into ts_guest_displays(property_id,owner_id,slideshow_seconds) values($1,$2,30)',[p,a]);assert.equal((await db.query('select requested_version from ts_display_videos')).rows[0].requested_version,4);
 }finally{await db.close();}
});

