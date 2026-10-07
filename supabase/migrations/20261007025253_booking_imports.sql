alter table public.ts_reservations add column import_messages_held boolean not null default false;
-- CSV imports retain immutable original identifiers and snapshots; bookings remain editable.
create table public.ts_booking_imports (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 property_id uuid not null, reservation_id uuid not null,
 source text not null check(source in ('uplisting','airbnb','other')),
 external_id text not null check(length(external_id) between 1 and 128 and external_id=trim(external_id)),
 snapshot jsonb not null, created_at timestamptz not null default now(),
 unique(owner_id,source,external_id), unique(reservation_id),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 foreign key(reservation_id,owner_id) references public.ts_reservations(id,owner_id)
);
create index ts_booking_imports_property_owner on public.ts_booking_imports(property_id,owner_id);
create index ts_booking_imports_reservation_owner on public.ts_booking_imports(reservation_id,owner_id);
alter table public.ts_booking_imports enable row level security;
revoke all on public.ts_booking_imports from public,anon,authenticated;
grant select,insert on public.ts_booking_imports to authenticated;
grant all on public.ts_booking_imports to service_role;
create policy ts_booking_imports_owner on public.ts_booking_imports to authenticated
 using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_booking_imports as restrictive to authenticated
 using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_booking_import_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Import receipts are immutable';end if;
 if not exists(select 1 from public.ts_reservations b where b.id=new.reservation_id and b.owner_id=new.owner_id and b.property_id=new.property_id and b.kind='booking'
  and jsonb_build_object('external_id',new.external_id,'guest',b.guest,'arrival',b.arrival::text,'departure',b.departure::text,'guests',b.guests,'status',b.status,'note',b.note,'guest_phone_last4',b.guest_phone_last4)=new.snapshot) then
  raise exception 'Import receipt must match the owned booking';end if;
 new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_booking_import_guard() from public,anon,authenticated;
create trigger ts_booking_import_guard before insert or update or delete on public.ts_booking_imports for each row execute function public.ts_booking_import_guard();
create function public.ts_import_bookings(p_property uuid,p_source text,p_rows jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare p public.ts_properties;r jsonb;prior public.ts_booking_imports;bid uuid;added integer=0;skipped integer=0;seen text[]='{}';a date;d date;
begin
 if p_source is null or p_source not in ('uplisting','airbnb','other') then raise exception 'Choose an import source';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Import 1 to 200 rows at a time';end if;
 select * into p from public.ts_properties where id=p_property and owner_id=(select auth.uid()) for update;
 if p.id is null then raise exception 'Choose an owned listing';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r))<>8
   or not(r ?& array['external_id','guest','arrival','departure','guests','status','note','guest_phone_last4']) then raise exception 'Use the supported import fields';end if;
  if jsonb_typeof(r->'external_id') is distinct from 'string' or length(r->>'external_id') not between 1 and 128 or r->>'external_id'<>trim(r->>'external_id')
   or jsonb_typeof(r->'guest') is distinct from 'string' or length(trim(r->>'guest')) not between 1 and 100
   or jsonb_typeof(r->'note') is distinct from 'string' or length(r->>'note')>2000
   or jsonb_typeof(r->'guests') is distinct from 'number' or r->>'guests' !~ '^[0-9]+$' or (r->>'guests')::integer not between 1 and 100
   or jsonb_typeof(r->'status') is distinct from 'string' or r->>'status' not in ('confirmed','cancelled')
   or jsonb_typeof(r->'arrival') is distinct from 'string' or r->>'arrival' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(r->'departure') is distinct from 'string' or r->>'departure' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or (r->'guest_phone_last4'<>'null'::jsonb and (jsonb_typeof(r->'guest_phone_last4') is distinct from 'string' or r->>'guest_phone_last4' !~ '^[0-9]{4}$')) then raise exception 'Invalid booking import values';end if;
  a=(r->>'arrival')::date;d=(r->>'departure')::date;
  if a::text<>r->>'arrival' or d::text<>r->>'departure' or d-a not between 1 and 365 then raise exception 'Use valid stays of 1 to 365 nights';end if;
  if r->>'external_id'=any(seen) then raise exception 'Duplicate original booking ID in this file';end if;
  seen=array_append(seen,r->>'external_id');
  select * into prior from public.ts_booking_imports where owner_id=p.owner_id and source=p_source and external_id=r->>'external_id';
  if prior.id is not null then
   if prior.property_id<>p.id or prior.snapshot<>r then raise exception 'Original booking ID already imported with different details; review the booking';end if;
   skipped=skipped+1;continue;
  end if;
  if exists(select 1 from public.ts_reservations b where b.owner_id=p.owner_id and b.property_id=p.id and b.kind='booking' and lower(trim(b.guest))=lower(trim(r->>'guest')) and b.arrival=a and b.departure=d) then raise exception 'Possible existing booking; review before importing';end if;
  insert into public.ts_reservations(owner_id,property_id,guest,arrival,departure,guests,status,note,guest_phone_last4,import_messages_held)
   values(p.owner_id,p.id,r->>'guest',a,d,(r->>'guests')::integer,r->>'status',r->>'note',r->>'guest_phone_last4',true) returning id into bid;
  insert into public.ts_booking_imports(owner_id,property_id,reservation_id,source,external_id,snapshot)
   values(p.owner_id,p.id,bid,p_source,r->>'external_id',r);
  added=added+1;
 end loop;
 return jsonb_build_object('added',added,'skipped',skipped);
end $$;
revoke all on function public.ts_import_bookings(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ts_import_bookings(uuid,text,jsonb) to authenticated;

-- Hold imported drafts, including rules created later; never replay confirmation sends.
create function public.ts_import_message_hold() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.state in ('planned','needs_review') and exists(select 1 from public.ts_reservations where id=new.booking_id and owner_id=new.owner_id and import_messages_held) then
  new.state='suppressed';new.reason='Imported booking: message delivery requires a separate review';
 end if;
 return new;
end $$;
revoke all on function public.ts_import_message_hold() from public,anon,authenticated;
create trigger ts_message_import_hold before insert or update on public.ts_message_queue for each row execute function public.ts_import_message_hold();
