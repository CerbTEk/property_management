create table public.ts_financial_imports (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid not null,
 reservation_id uuid not null,financial_id uuid not null references public.ts_booking_financials(id),
 source text not null check(source in ('uplisting','airbnb','other')),external_id text not null check(length(external_id) between 1 and 128 and external_id=trim(external_id)),
 snapshot jsonb not null,created_at timestamptz not null default now(),unique(owner_id,source,external_id),unique(financial_id),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),foreign key(reservation_id,owner_id) references public.ts_reservations(id,owner_id)
);
create index ts_financial_imports_property_owner on public.ts_financial_imports(property_id,owner_id);
create index ts_financial_imports_reservation_owner on public.ts_financial_imports(reservation_id,owner_id);
alter table public.ts_financial_imports enable row level security;
revoke all on public.ts_financial_imports from public,anon,authenticated;
grant select,insert on public.ts_financial_imports to authenticated;
grant all on public.ts_financial_imports to service_role;
create policy ts_financial_imports_owner on public.ts_financial_imports to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_financial_imports as restrictive to authenticated
 using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_financial_import_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Financial import receipts are immutable';end if;
 if not exists(select 1 from public.ts_booking_financials f join public.ts_reservations b on b.id=f.reservation_id and b.owner_id=f.owner_id
  join public.ts_booking_imports i on i.reservation_id=b.id and i.owner_id=b.owner_id
  where f.id=new.financial_id and f.owner_id=new.owner_id and f.reservation_id=new.reservation_id and f.property_id=new.property_id and i.source=new.source and i.external_id=new.external_id
   and jsonb_build_object('external_id',new.external_id,'guest',b.guest,'arrival',f.arrival::text,'departure',f.departure::text,'guests',f.guests,'currency',f.currency,'amounts',jsonb_build_object('accommodation_cents',f.accommodation_cents,'discount_cents',f.discount_cents,'cleaning_cents',f.cleaning_cents,'extra_guest_cents',f.extra_guest_cents,'other_fee_cents',f.other_fee_cents,'tax_cents',f.tax_cents,'channel_fee_cents',f.channel_fee_cents))=new.snapshot) then raise exception 'Receipt must match the owned imported booking charges';end if;
 new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_financial_import_guard() from public,anon,authenticated;
create trigger ts_financial_import_guard before insert or update or delete on public.ts_financial_imports for each row execute function public.ts_financial_import_guard();
create function public.ts_import_financials(p_property uuid,p_source text,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;amounts jsonb;prior public.ts_financial_imports;b public.ts_reservations;f uuid;seen text[]='{}';added integer=0;skipped integer=0;uid uuid=auth.uid();
begin
 if p_source is null or p_source not in ('uplisting','airbnb','other') then raise exception 'Choose an import source';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Import 1 to 200 charge records';end if;
 perform 1 from public.ts_properties where id=p_property and owner_id=uid for update;if not found then raise exception 'Choose an owned listing';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r))<>7 or not(r ?& array['external_id','guest','arrival','departure','guests','currency','amounts']) then raise exception 'Use the supported charge import fields';end if;
  if jsonb_typeof(r->'external_id') is distinct from 'string' or length(r->>'external_id') not between 1 and 128 or r->>'external_id'<>trim(r->>'external_id')
   or jsonb_typeof(r->'guest') is distinct from 'string' or length(trim(r->>'guest')) not between 1 and 100
   or jsonb_typeof(r->'currency') is distinct from 'string' or r->>'currency'<>'USD'
   or jsonb_typeof(r->'arrival') is distinct from 'string' or r->>'arrival' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(r->'departure') is distinct from 'string' or r->>'departure' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(r->'guests') is distinct from 'number' or r->>'guests' !~ '^[0-9]+$' or (r->>'guests')::integer not between 1 and 100 then raise exception 'Invalid charge import booking details';end if;
  if (r->>'arrival')::date::text<>r->>'arrival' or (r->>'departure')::date::text<>r->>'departure' or (r->>'departure')::date<=(r->>'arrival')::date then raise exception 'Use valid stay dates';end if;
  amounts=r->'amounts';
  if jsonb_typeof(amounts) is distinct from 'object' or (select count(*) from jsonb_object_keys(amounts))<>7 or not(amounts ?& array['accommodation_cents','discount_cents','cleaning_cents','extra_guest_cents','other_fee_cents','tax_cents','channel_fee_cents']) then raise exception 'Enter all seven amounts, including explicit zeros';end if;
  if exists(select 1 from jsonb_each(amounts) where jsonb_typeof(value) is distinct from 'number' or value::text !~ '^[0-9]+$' or value::numeric not between 0 and 1000000000) then raise exception 'Use whole non-negative cents within charge limits';end if;
  if (amounts->>'discount_cents')::bigint>(amounts->>'accommodation_cents')::bigint or (amounts->>'channel_fee_cents')::bigint>(amounts->>'accommodation_cents')::bigint-(amounts->>'discount_cents')::bigint+(amounts->>'cleaning_cents')::bigint+(amounts->>'extra_guest_cents')::bigint+(amounts->>'other_fee_cents')::bigint+(amounts->>'tax_cents')::bigint then raise exception 'Discount or host channel fees exceed booking charges';end if;
  if r->>'external_id'=any(seen) then raise exception 'Repeated original booking ID';end if;seen=array_append(seen,r->>'external_id');
  select booking.* into b from public.ts_reservations booking join public.ts_booking_imports i on i.reservation_id=booking.id and i.owner_id=booking.owner_id
   where i.owner_id=uid and i.source=p_source and i.external_id=r->>'external_id' and i.property_id=p_property and booking.property_id=p_property for update of booking;
  if b.id is null or b.kind='block' then raise exception 'Import this booking into the selected listing first';end if;
  select * into prior from public.ts_financial_imports where owner_id=uid and source=p_source and external_id=r->>'external_id';
  if prior.id is not null then
   if prior.snapshot<>r or prior.property_id<>p_property or prior.reservation_id<>b.id then raise exception 'Original ID already has different imported charges';end if;
   skipped=skipped+1;continue;
  end if;
  if b.status<>'confirmed' then raise exception 'Cancelled bookings need a separate settlement review';end if;
  if b.guest<>r->>'guest' or b.arrival::text<>r->>'arrival' or b.departure::text<>r->>'departure' or b.guests<>(r->>'guests')::integer then raise exception 'Guest or stay details changed; review before importing charges';end if;
  if exists(select 1 from public.ts_booking_financials where reservation_id=b.id) then raise exception 'Booking already has charge history; review Booking amounts';end if;
  f=public.ts_save_booking_financials(b.id,0,b.property_id,b.arrival,b.departure,b.guests,amounts,'Imported '||p_source||' charges for original booking '||(r->>'external_id'));
  insert into public.ts_financial_imports(owner_id,property_id,reservation_id,financial_id,source,external_id,snapshot) values(uid,b.property_id,b.id,f,p_source,r->>'external_id',r);
  added=added+1;
 end loop;
 return jsonb_build_object('added',added,'skipped',skipped);
end $$;
revoke all on function public.ts_import_financials(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ts_import_financials(uuid,text,jsonb) to authenticated;
