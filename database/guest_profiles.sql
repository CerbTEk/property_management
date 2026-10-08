create table public.ts_guests (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 100),
 phone text check(phone ~ '^\+[1-9][0-9]{6,14}$'),
 rating integer check(rating between 1 and 5),
 internal_notes text not null default '' check(length(internal_notes)<=10000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,owner_id), unique(owner_id,phone)
);
alter table public.ts_guests enable row level security;
revoke all on public.ts_guests from public,anon,authenticated;
grant select,insert,update on public.ts_guests to authenticated;
grant all on public.ts_guests to service_role;
create policy ts_guests_owner on public.ts_guests to authenticated
 using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_guests as restrictive to authenticated
 using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);

create function public.ts_normalize_guest_phone(value text) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare digits text;
begin
 if value is null or trim(value)='' then return null;end if;
 if value !~ '^\+?[0-9 ().-]+$' then raise exception 'Enter a phone number without an extension';end if;
 digits=regexp_replace(value,'[^0-9]','','g');
 if left(trim(value),1)<>'+' then
  if length(digits)=10 then digits='1'||digits;
  elsif not(length(digits)=11 and left(digits,1)='1') then raise exception 'Include + and the country code for international numbers';end if;
 end if;
 if digits !~ '^[1-9][0-9]{6,14}$' then raise exception 'Enter a complete phone number with country code';end if;
 return '+'||digits;
end $$;
revoke all on function public.ts_normalize_guest_phone(text) from public,anon;
grant execute on function public.ts_normalize_guest_phone(text) to authenticated,service_role;
create function public.ts_guest_profile_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.id<>old.id or new.owner_id<>old.owner_id) then raise exception 'Guest ownership cannot change';end if;
 new.name=trim(new.name);new.phone=public.ts_normalize_guest_phone(new.phone);
 if tg_op='UPDATE' then new.created_at=old.created_at;end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_guest_profile_guard() from public,anon,authenticated;
create trigger ts_guest_profile_guard before insert or update on public.ts_guests for each row execute function public.ts_guest_profile_guard();

alter table public.ts_reservations add column guest_id uuid, add column guest_phone text;
alter table public.ts_reservations add constraint ts_reservations_guest_owner foreign key(guest_id,owner_id) references public.ts_guests(id,owner_id);
alter table public.ts_reservations add constraint ts_reservations_guest_phone check(guest_phone ~ '^\+[1-9][0-9]{6,14}$');
create index ts_reservations_guest_owner on public.ts_reservations(guest_id,owner_id) where guest_id is not null;
-- Legacy profile IDs equal booking IDs. No booking UPDATEs are required, so
-- backfill cannot replay operational triggers or guest messages.
insert into public.ts_guests(id,owner_id,name)
 select id,owner_id,guest from public.ts_reservations where kind='booking';

create function public.ts_booking_guest_profile() returns trigger language plpgsql security invoker set search_path='' as $$
declare profile public.ts_guests;phone_value text;chosen uuid;
begin
 if new.kind='block' then new.guest_id=null;new.guest_phone=null;return new;end if;
 phone_value=public.ts_normalize_guest_phone(new.guest_phone);
 chosen=new.guest_id;
 if chosen is not null then
  select * into profile from public.ts_guests where id=chosen and owner_id=new.owner_id;
  if profile.id is null then raise exception 'Choose an owned guest profile';end if;
  -- An explicitly selected profile retains its history and host notes.
  if phone_value is not null and profile.phone is distinct from phone_value then
   update public.ts_guests set phone=phone_value where id=profile.id and owner_id=new.owner_id returning * into profile;
  end if;
 end if;
 if chosen is null then
  if phone_value is not null then
   insert into public.ts_guests(owner_id,name,phone) values(new.owner_id,new.guest,phone_value)
    on conflict(owner_id,phone) do update set phone=excluded.phone returning * into profile;
  else
   insert into public.ts_guests(owner_id,name) values(new.owner_id,new.guest) returning * into profile;
  end if;
 end if;
 new.guest_id=profile.id;new.guest_phone=coalesce(phone_value,profile.phone);
 if new.guest_phone is not null then new.guest_phone_last4=right(new.guest_phone,4);end if;
 return new;
end $$;
revoke all on function public.ts_booking_guest_profile() from public,anon,authenticated;
create trigger ts_booking_guest_profile before insert or update of guest,guest_id,guest_phone,guest_phone_last4 on public.ts_reservations for each row execute function public.ts_booking_guest_profile();

-- New imports retain full contact details; legacy receipts remain immutable.
create or replace function public.ts_booking_import_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Import receipts are immutable';end if;
 if not exists(select 1 from public.ts_reservations b where b.id=new.reservation_id and b.owner_id=new.owner_id and b.property_id=new.property_id and b.kind='booking'
  and (jsonb_build_object('external_id',new.external_id,'guest',b.guest,'arrival',b.arrival::text,'departure',b.departure::text,'guests',b.guests,'status',b.status,'note',b.note,'guest_phone_last4',b.guest_phone_last4)||case when new.snapshot ? 'guest_phone' then jsonb_build_object('guest_phone',b.guest_phone) else '{}'::jsonb end)=new.snapshot) then
  raise exception 'Import receipt must match the owned booking';end if;
 new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_booking_import_guard() from public,anon,authenticated;
create or replace function public.ts_import_bookings(p_property uuid,p_source text,p_rows jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare p public.ts_properties;r jsonb;prior public.ts_booking_imports;bid uuid;added integer=0;skipped integer=0;seen text[]='{}';a date;d date;
begin
 if p_source is null or p_source not in ('uplisting','airbnb','other') then raise exception 'Choose an import source';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Import 1 to 200 rows at a time';end if;
 select * into p from public.ts_properties where id=p_property and owner_id=(select auth.uid()) for update;
 if p.id is null then raise exception 'Choose an owned listing';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r)) not in (8,9) or ((select count(*) from jsonb_object_keys(r))=9 and not (r ? 'guest_phone'))
   or not(r ?& array['external_id','guest','arrival','departure','guests','status','note','guest_phone_last4']) then raise exception 'Use the supported import fields';end if;
  if jsonb_typeof(r->'external_id') is distinct from 'string' or length(r->>'external_id') not between 1 and 128 or r->>'external_id'<>trim(r->>'external_id')
   or jsonb_typeof(r->'guest') is distinct from 'string' or length(trim(r->>'guest')) not between 1 and 100
   or jsonb_typeof(r->'note') is distinct from 'string' or length(r->>'note')>2000
   or jsonb_typeof(r->'guests') is distinct from 'number' or r->>'guests' !~ '^[0-9]+$' or (r->>'guests')::integer not between 1 and 100
   or jsonb_typeof(r->'status') is distinct from 'string' or r->>'status' not in ('confirmed','cancelled')
   or jsonb_typeof(r->'arrival') is distinct from 'string' or r->>'arrival' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(r->'departure') is distinct from 'string' or r->>'departure' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or (r->'guest_phone_last4'<>'null'::jsonb and (jsonb_typeof(r->'guest_phone_last4') is distinct from 'string' or r->>'guest_phone_last4' !~ '^[0-9]{4}$')) then raise exception 'Invalid booking import values';end if;
  if r ? 'guest_phone' and (jsonb_typeof(r->'guest_phone') not in ('string','null') or public.ts_normalize_guest_phone(r->>'guest_phone') is distinct from r->>'guest_phone') then raise exception 'Use a complete normalized guest phone number';end if;
  a=(r->>'arrival')::date;d=(r->>'departure')::date;
  if a::text<>r->>'arrival' or d::text<>r->>'departure' or d-a not between 1 and 365 then raise exception 'Use valid stays of 1 to 365 nights';end if;
  if r->>'external_id'=any(seen) then raise exception 'Duplicate original booking ID in this file';end if;
  seen=array_append(seen,r->>'external_id');
  select * into prior from public.ts_booking_imports where owner_id=p.owner_id and source=p_source and external_id=r->>'external_id';
  if prior.id is not null then
   if prior.property_id<>p.id or (prior.snapshot-'guest_phone')<>(r-'guest_phone') or (prior.snapshot ? 'guest_phone' and prior.snapshot->'guest_phone' is distinct from r->'guest_phone') then raise exception 'Original booking ID already imported with different details; review the booking';end if;
   skipped=skipped+1;continue;
  end if;
  if exists(select 1 from public.ts_reservations b where b.owner_id=p.owner_id and b.property_id=p.id and b.kind='booking' and lower(trim(b.guest))=lower(trim(r->>'guest')) and b.arrival=a and b.departure=d) then raise exception 'Possible existing booking; review before importing';end if;
  insert into public.ts_reservations(owner_id,property_id,guest,arrival,departure,guests,status,note,guest_phone_last4,guest_phone,import_messages_held)
   values(p.owner_id,p.id,r->>'guest',a,d,(r->>'guests')::integer,r->>'status',r->>'note',r->>'guest_phone_last4',r->>'guest_phone',true) returning id into bid;
  insert into public.ts_booking_imports(owner_id,property_id,reservation_id,source,external_id,snapshot)
   values(p.owner_id,p.id,bid,p_source,r->>'external_id',r);
  added=added+1;
 end loop;
 return jsonb_build_object('added',added,'skipped',skipped);
end $$;
revoke all on function public.ts_import_bookings(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ts_import_bookings(uuid,text,jsonb) to authenticated;

