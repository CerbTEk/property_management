create table public.ts_property_imports (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid not null,
 source text not null check(source in ('uplisting','airbnb','other')),external_id text not null check(length(external_id) between 1 and 128 and external_id=trim(external_id)),
 snapshot jsonb not null,created_at timestamptz not null default now(),unique(owner_id,source,external_id),unique(property_id,source),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id)
);
create index ts_property_imports_property_owner on public.ts_property_imports(property_id,owner_id);
alter table public.ts_property_imports enable row level security;
revoke all on public.ts_property_imports from public,anon,authenticated;
grant select,insert on public.ts_property_imports to authenticated;
grant all on public.ts_property_imports to service_role;
create policy ts_property_imports_owner on public.ts_property_imports to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_property_imports as restrictive to authenticated
 using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_property_import_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then raise exception 'Listing import receipts are immutable';end if;
 if not exists(select 1 from public.ts_properties p where p.id=new.property_id and p.owner_id=new.owner_id
  and jsonb_build_object('external_id',new.external_id,'name',p.name,'timezone',p.timezone,'currency','USD','weekday_cents',p.weekday_cents,'weekend_cents',p.weekend_cents,'markup_percent',p.markup_percent,'max_guests',p.max_guests,'min_stay',p.min_stay,'check_in',left(p.check_in::text,5),'check_out',left(p.check_out::text,5))=new.snapshot
  and extract(second from p.check_in)=0 and extract(second from p.check_out)=0) then raise exception 'Receipt must match the owned listing';end if;
 new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_property_import_guard() from public,anon,authenticated;
create trigger ts_property_import_guard before insert or update or delete on public.ts_property_imports for each row execute function public.ts_property_import_guard();
create function public.ts_import_properties(p_source text,p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;s jsonb;k text;prior public.ts_property_imports;p public.ts_properties;pid uuid;created integer=0;linked integer=0;skipped integer=0;seen text[]='{}';uid uuid=auth.uid();
begin
 if uid is null or ((auth.jwt()->>'aal') is distinct from 'aal2' and uid<>'3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) then raise exception 'Host authentication required';end if;
 if p_source is null or p_source not in ('uplisting','airbnb','other') then raise exception 'Choose an import source';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 50 then raise exception 'Import 1 to 50 listings';end if;
 -- Serialize this owner's import batches, including new listings without IDs yet.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,712));
 for r in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(r) is distinct from 'object' or (select count(*) from jsonb_object_keys(r))<>12 or not(r ?& array['external_id','name','timezone','currency','weekday_cents','weekend_cents','markup_percent','max_guests','min_stay','check_in','check_out','target_property']) then raise exception 'Use the supported listing import fields';end if;
  foreach k in array array['external_id','name','timezone','currency','check_in','check_out'] loop
   if jsonb_typeof(r->k) is distinct from 'string' then raise exception 'Listing text fields cannot be empty or null';end if;
  end loop;
  if length(r->>'external_id') not between 1 and 128 or r->>'external_id'<>trim(r->>'external_id') or length(trim(r->>'name')) not between 1 and 120
   or r->>'currency'<>'USD' or not exists(select 1 from pg_timezone_names where name=r->>'timezone')
   or r->>'check_in' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or r->>'check_out' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid listing ID, name, currency, timezone or time';end if;
  foreach k in array array['weekday_cents','weekend_cents','max_guests','min_stay'] loop
   if jsonb_typeof(r->k) is distinct from 'number' or r->>k !~ '^[0-9]+$' then raise exception 'Use whole numeric listing units';end if;
  end loop;
  if (r->>'weekday_cents')::integer not between 100 and 1000000 or (r->>'weekend_cents')::integer not between 100 and 1000000
   or (r->>'max_guests')::integer not between 1 and 100 or (r->>'min_stay')::integer not between 1 and 365
   or jsonb_typeof(r->'markup_percent') is distinct from 'number' or (r->>'markup_percent')::numeric not between 0 and 100 or round((r->>'markup_percent')::numeric,2)<>(r->>'markup_percent')::numeric then raise exception 'Listing amounts or limits are out of range';end if;
  if r->'target_property'<>'null'::jsonb and jsonb_typeof(r->'target_property') is distinct from 'string' then raise exception 'Choose an existing listing or create a new one';end if;
  if r->>'external_id'=any(seen) then raise exception 'Repeated original listing ID';end if;seen=array_append(seen,r->>'external_id');
  s=r-'target_property';
  select * into prior from public.ts_property_imports where owner_id=uid and source=p_source and external_id=r->>'external_id';
  if prior.id is not null then
   if prior.snapshot<>s or (r->>'target_property' is not null and (r->>'target_property')::uuid<>prior.property_id) then raise exception 'Original listing ID already has different saved details';end if;
   skipped=skipped+1;continue;
  end if;
  if r->>'target_property' is not null then
   pid=(r->>'target_property')::uuid;
   select * into p from public.ts_properties where id=pid and owner_id=uid for update;
   if p.id is null then raise exception 'Choose an owned existing listing';end if;
   -- Receipt trigger verifies every setting without changing this listing.
   linked=linked+1;
  else
   if exists(select 1 from public.ts_properties where owner_id=uid and lower(trim(name))=lower(trim(r->>'name'))) then raise exception 'Listing name already exists; link the matching listing';end if;
   insert into public.ts_properties(owner_id,name,timezone,weekday_cents,weekend_cents,markup_percent,max_guests,min_stay,check_in,check_out)
    values(uid,r->>'name',r->>'timezone',(r->>'weekday_cents')::integer,(r->>'weekend_cents')::integer,(r->>'markup_percent')::numeric,(r->>'max_guests')::integer,(r->>'min_stay')::integer,(r->>'check_in')::time,(r->>'check_out')::time) returning id into pid;
   created=created+1;
  end if;
  insert into public.ts_property_imports(owner_id,property_id,source,external_id,snapshot) values(uid,pid,p_source,r->>'external_id',s);
 end loop;
 return jsonb_build_object('created',created,'linked',linked,'skipped',skipped);
end $$;
revoke all on function public.ts_import_properties(text,jsonb) from public,anon,authenticated;
grant execute on function public.ts_import_properties(text,jsonb) to authenticated;
