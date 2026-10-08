import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {normalizeGuestPhone,profileBookings} from '../src/guest-profiles.mjs';
test('full phone normalization retains country code and never treats suffixes as identity',()=>{
 assert.equal(normalizeGuestPhone('(555) 555-0123'),'+15555550123');assert.equal(normalizeGuestPhone('+44 20 7946 0958'),'+442079460958');
 assert.equal(normalizeGuestPhone(''),null);for(const bad of ['0123','5555550123 ext 2','442079460958','+0123456789'])assert.throws(()=>normalizeGuestPhone(bad));
 assert.deepEqual(profileBookings({reservations:[{id:'old',owner_id:'a',arrival:'2026-01-01'},{id:'foreign',guest_id:'old',owner_id:'b'}]},{id:'old',owner_id:'a'},'a').map(b=>b.id),['old']);
});
test('guest profiles retain phones, ratings and notes; owner and MFA isolation apply to links and edits',async()=>{
 const db=new PGlite(),a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',p='10000000-0000-0000-0000-000000000001',old='20000000-0000-0000-0000-000000000001';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('aal',current_setting('test.aal',true))$$;
 grant usage on schema public,auth to authenticated,anon,service_role;
 create table ts_properties(id uuid primary key,owner_id uuid,unique(id,owner_id));insert into ts_properties values('${p}','${a}');
 create table ts_reservations(id uuid primary key default gen_random_uuid(),owner_id uuid,property_id uuid,guest text,arrival date,departure date,guests integer default 1,status text default 'confirmed',note text default '',kind text default 'booking',guest_phone_last4 text,import_messages_held boolean default false,unique(id,owner_id));
 insert into ts_reservations(id,owner_id,property_id,guest,arrival,departure) values('${old}','${a}','${p}','Old Guest','2026-01-01','2026-01-03');
 alter table ts_reservations enable row level security;create policy own on ts_reservations to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
 grant all on ts_reservations to authenticated;grant select,update on ts_properties to authenticated;
 create table ts_booking_imports(id uuid primary key default gen_random_uuid(),owner_id uuid,property_id uuid,reservation_id uuid,source text,external_id text,snapshot jsonb,created_at timestamptz default now());
 grant select,insert on ts_booking_imports to authenticated;
 create function ts_booking_import_guard() returns trigger language plpgsql as $$begin return new;end$$;
 create trigger ts_booking_import_guard before insert or update or delete on ts_booking_imports for each row execute function ts_booking_import_guard();`);
 await db.exec(await readFile(new URL('../database/guest_profiles.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select id from ts_guests')).rows[0].id,old);
 assert.equal((await db.query('select guest_id from ts_reservations')).rows[0].guest_id,null);
 await db.exec(`set role authenticated;set test.uid='${a}';set test.aal='aal2';`);
 await db.query('update ts_guests set phone=$1,rating=5,internal_notes=$2 where id=$3',['555-555-0123','Quiet guest; prefers extra pillows',old]);
 let saved=(await db.query('insert into ts_reservations(owner_id,property_id,guest,guest_phone,arrival,departure) values($1,$2,$3,$4,$5,$6) returning *',[a,p,'Old Guest','+1 (555) 555-0123','2026-10-10','2026-10-12'])).rows[0];
 assert.equal(saved.guest_id,old);assert.equal(saved.guest_phone,'+15555550123');assert.equal(saved.guest_phone_last4,'0123');
 assert.equal((await db.query('select internal_notes from ts_guests where id=$1',[old])).rows[0].internal_notes,'Quiet guest; prefers extra pillows');
 saved=(await db.query('insert into ts_reservations(owner_id,property_id,guest,guest_id,arrival,departure) values($1,$2,$3,$4,$5,$6) returning *',[a,p,'Old Guest',old,'2026-11-10','2026-11-12'])).rows[0];assert.equal(saved.guest_phone,'+15555550123');
 await assert.rejects(()=>db.query('update ts_guests set rating=6 where id=$1',[old]),e=>e.code==='23514');
 const imported={external_id:'B1',guest:'Imported Guest',arrival:'2026-12-01',departure:'2026-12-03',guests:1,status:'confirmed',note:'',guest_phone_last4:'0958',guest_phone:'+442079460958'};
 const outcome=(await db.query('select ts_import_bookings($1,$2,$3::jsonb) result',[p,'other',JSON.stringify([imported])])).rows[0].result;assert.equal(outcome.added,1);
 assert.equal((await db.query('select phone from ts_guests where name=$1',['Imported Guest'])).rows[0].phone,imported.guest_phone);
 assert.equal((await db.query('select ts_import_bookings($1,$2,$3::jsonb) result',[p,'other',JSON.stringify([imported])])).rows[0].result.skipped,1);
 const legacy={...imported,external_id:'B2',guest:'Legacy Import',arrival:'2027-01-01',departure:'2027-01-03',guest_phone_last4:null};delete legacy.guest_phone;
 await db.query('select ts_import_bookings($1,$2,$3::jsonb)',[p,'other',JSON.stringify([legacy])]);
 assert.equal((await db.query('select ts_import_bookings($1,$2,$3::jsonb) result',[p,'other',JSON.stringify([{...legacy,guest_phone:null}])])).rows[0].result.skipped,1);
 await db.exec("set test.aal='aal1'");assert.equal((await db.query('select * from ts_guests')).rows.length,0);
 await assert.rejects(()=>db.query('insert into ts_guests(owner_id,name) values($1,$2)',[a,'Denied']),e=>e.code==='42501');
 await db.exec(`set test.aal='aal2';set test.uid='${b}';`);assert.equal((await db.query('select * from ts_guests')).rows.length,0);
 assert.equal((await db.query('update ts_guests set internal_notes=$1 where id=$2 returning id',['Overwrite',old])).rows.length,0);
 await assert.rejects(()=>db.query('insert into ts_reservations(owner_id,guest,guest_id) values($1,$2,$3)',[b,'Foreign',old]),/owned guest/);
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from ts_guests'),e=>e.code==='42501');
 }finally{await db.close();}
});

