create table public.ts_transaction_imports (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid not null,
 booking_id uuid not null,transaction_id uuid not null references public.ts_booking_transactions(id),
 source text not null check(source in ('uplisting','airbnb','other')),external_id text not null check(length(external_id) between 1 and 128 and external_id=trim(external_id)),
 snapshot jsonb not null,created_at timestamptz not null default now(),unique(owner_id,source,external_id),unique(transaction_id),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),foreign key(booking_id,owner_id) references public.ts_reservations(id,owner_id)
);
create index ts_transaction_imports_property_owner on public.ts_transaction_imports(property_id,owner_id);
create index ts_transaction_imports_booking_owner on public.ts_transaction_imports(booking_id,owner_id);
alter table public.ts_transaction_imports enable row level security;
revoke all on public.ts_transaction_imports from public,anon,authenticated;
grant select,insert on public.ts_transaction_imports to authenticated;
grant all on public.ts_transaction_imports to service_role;
create policy ts_transaction_imports_owner on public.ts_transaction_imports to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_transaction_imports as restrictive to authenticated
 using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_transaction_import_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Transaction import receipts are immutable';end if;
 if not exists(select 1 from public.ts_booking_transactions t join public.ts_reservations b on b.id=t.booking_id and b.owner_id=t.owner_id
  join public.ts_booking_imports i on i.reservation_id=b.id and i.owner_id=b.owner_id
  where t.id=new.transaction_id and t.owner_id=new.owner_id and t.booking_id=new.booking_id and b.property_id=new.property_id and i.property_id=new.property_id and i.source=new.source
   and t.kind in ('payment','refund') and t.evidence='host_recorded'
   and jsonb_build_object('transaction_id',new.external_id,'booking_id',i.external_id,'guest',b.guest,'arrival',b.arrival::text,'departure',b.departure::text,'guests',b.guests,'kind',t.kind,'amount_cents',t.amount_cents,'currency',t.currency,'occurred_on',t.occurred_on::text,'method',t.method,'reference',t.reference,'parent_transaction_id',case when t.kind='payment' then '' else (select parent.external_id from public.ts_transaction_imports parent where parent.transaction_id=t.related_id and parent.owner_id=new.owner_id and parent.source=new.source and parent.booking_id=new.booking_id) end)=new.snapshot
 ) then raise exception 'Receipt must match the owned imported transaction and payment link';end if;
 new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_transaction_import_guard() from public,anon,authenticated;
create trigger ts_transaction_import_guard before insert or update or delete on public.ts_transaction_imports for each row execute function public.ts_transaction_import_guard();
create function public.ts_import_transactions(p_property uuid,p_source text,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;k text;b public.ts_reservations;prior public.ts_transaction_imports;parent public.ts_booking_transactions;tid uuid;related uuid;seq integer;added integer=0;skipped integer=0;seen text[]='{}';uid uuid=auth.uid();phase text;
begin
 if p_source is null or p_source not in ('uplisting','airbnb','other') then raise exception 'Choose an import source';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Import 1 to 200 transactions';end if;
 perform 1 from public.ts_properties where id=p_property and owner_id=uid for update;if not found then raise exception 'Choose an owned listing';end if;
 -- Validate the entire payload, including repeated original IDs, before dependency ordering.
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r))<>13 or not(r ?& array['transaction_id','booking_id','guest','arrival','departure','guests','kind','amount_cents','currency','occurred_on','method','reference','parent_transaction_id']) then raise exception 'Use supported transaction import fields';end if;
  foreach k in array array['transaction_id','booking_id','guest','arrival','departure','kind','currency','occurred_on','method','reference','parent_transaction_id'] loop
   if jsonb_typeof(r->k) is distinct from 'string' then raise exception 'Transaction text fields cannot be null';end if;
  end loop;
  if length(r->>'transaction_id') not between 1 and 128 or r->>'transaction_id'<>trim(r->>'transaction_id') or length(r->>'booking_id') not between 1 and 128
   or length(trim(r->>'guest')) not between 1 and 100 or r->>'currency'<>'USD' or r->>'kind' not in ('payment','refund') or r->>'method' not in ('channel','bank','cash','other')
   or length(trim(r->>'reference')) not between 1 and 160 or r->>'reference'<>trim(r->>'reference') or length(r->>'parent_transaction_id')>128
   or (r->>'kind'='payment' and r->>'parent_transaction_id'<>'') or (r->>'kind'='refund' and r->>'parent_transaction_id'='')
   or jsonb_typeof(r->'guests') is distinct from 'number' or r->>'guests' !~ '^[0-9]+$' or (r->>'guests')::integer not between 1 and 100
   or jsonb_typeof(r->'amount_cents') is distinct from 'number' or r->>'amount_cents' !~ '^[0-9]+$' or (r->>'amount_cents')::bigint not between 1 and 1000000000 then raise exception 'Invalid transaction import values';end if;
  foreach k in array array['arrival','departure','occurred_on'] loop
   if r->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (r->>k)::date::text<>r->>k then raise exception 'Use valid YYYY-MM-DD dates';end if;
  end loop;
  if (r->>'departure')::date<=(r->>'arrival')::date or (r->>'occurred_on')::date>(clock_timestamp() at time zone 'UTC')::date then raise exception 'Use valid stay dates and completed transactions';end if;
  if r->>'transaction_id'=any(seen) then raise exception 'Repeated original transaction ID';end if;seen=array_append(seen,r->>'transaction_id');
 end loop;
 -- Payments precede refunds, independent of CSV row order. The transaction is atomic.
 foreach phase in array array['payment','refund'] loop
  for r in select value from jsonb_array_elements(p_rows) where value->>'kind'=phase loop
   select booking.* into b from public.ts_reservations booking join public.ts_booking_imports i on i.reservation_id=booking.id and i.owner_id=booking.owner_id
    where i.owner_id=uid and i.source=p_source and i.external_id=r->>'booking_id' and i.property_id=p_property and booking.property_id=p_property for update of booking;
   if b.id is null or b.kind='block' then raise exception 'Import this reservation into the selected listing first';end if;
   select * into prior from public.ts_transaction_imports where owner_id=uid and source=p_source and external_id=r->>'transaction_id';
   if prior.id is not null then
    if prior.snapshot<>r or prior.property_id<>p_property or prior.booking_id<>b.id then raise exception 'Original transaction ID already has different saved details';end if;
    skipped=skipped+1;continue;
   end if;
   if b.guest<>r->>'guest' or b.arrival::text<>r->>'arrival' or b.departure::text<>r->>'departure' or b.guests<>(r->>'guests')::integer then raise exception 'Guest or stay details changed; review the booking';end if;
   if exists(select 1 from public.ts_booking_transactions t where t.booking_id=b.id and not exists(select 1 from public.ts_transaction_imports i where i.transaction_id=t.id and i.owner_id=uid)) then raise exception 'Booking has manual transaction history; reconcile before import';end if;
   if exists(select 1 from public.ts_booking_transactions where booking_id=b.id and kind=phase and lower(trim(reference))=lower(r->>'reference')) then raise exception 'Transaction reference already exists; review the ledger';end if;
   related=null;
   if phase='refund' then
    select t.* into parent from public.ts_booking_transactions t join public.ts_transaction_imports i on i.transaction_id=t.id and i.owner_id=t.owner_id
     where i.owner_id=uid and i.source=p_source and i.external_id=r->>'parent_transaction_id' and i.booking_id=b.id and t.booking_id=b.id and t.kind='payment';
    if parent.id is null then raise exception 'Refund needs an imported payment from the same booking';end if;
    if (r->>'occurred_on')::date<parent.occurred_on then raise exception 'Refund date precedes payment';end if;
    related=parent.id;
   end if;
   select coalesce(max(sequence),0) into seq from public.ts_booking_transactions where booking_id=b.id;
   tid=public.ts_record_booking_transaction(b.id,seq,gen_random_uuid(),phase,(r->>'amount_cents')::bigint,related,r->>'method',(r->>'occurred_on')::date,r->>'reference','Imported '||p_source||' completed transaction '||(r->>'transaction_id')||'; host-recorded export evidence');
   insert into public.ts_transaction_imports(owner_id,property_id,booking_id,transaction_id,source,external_id,snapshot) values(uid,b.property_id,b.id,tid,p_source,r->>'transaction_id',r);
   added=added+1;
  end loop;
 end loop;
 return jsonb_build_object('added',added,'skipped',skipped);
end $$;
revoke all on function public.ts_import_transactions(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.ts_import_transactions(uuid,text,jsonb) to authenticated;
