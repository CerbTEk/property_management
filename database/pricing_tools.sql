-- Atomic pricing edits under the caller's ownership and MFA policies.
alter table public.ts_properties add column market text not null default '' check(length(market)<=160);
alter table public.ts_properties add column accommodation_type text not null default 'unspecified' check(accommodation_type in ('unspecified','private_room','entire_place','shared_room','hotel'));
grant delete on public.ts_rates to authenticated;
create table public.ts_market_comparables (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), property_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 120), market text not null check(length(trim(market)) between 1 and 160),
 accommodation_type text not null check(accommodation_type in ('private_room','entire_place','shared_room','hotel')),
 source_url text not null check(length(source_url)<=2000 and source_url ~ '^https://[^[:space:]]+$'),
 arrival date not null, departure date not null, guests integer not null check(guests between 1 and 100),
 nightly_cents integer not null check(nightly_cents between 100 and 1000000), observed_on date not null check(observed_on<=current_date),
 created_at timestamptz not null default now(), foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 check(departure>arrival and departure-arrival<=365), unique(property_id,source_url,arrival,departure,guests)
);
create index ts_market_comparables_owner_property on public.ts_market_comparables(owner_id,property_id);
alter table public.ts_market_comparables enable row level security;
revoke all on public.ts_market_comparables from anon,authenticated;
grant select,insert,update,delete on public.ts_market_comparables to authenticated;
create policy ts_market_comparables_owner on public.ts_market_comparables to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_market_comparables_mfa on public.ts_market_comparables as restrictive for all to authenticated
 using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_edit_rates(p_property uuid,p_start date,p_end date,p_weekdays integer[],p_mode text,p_value numeric,p_floor integer,p_ceiling integer,p_expected jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare p public.ts_properties; d date; old_rate integer; new_rate integer; changed integer:=0;
begin
 select * into p from public.ts_properties where id=p_property and owner_id=(select auth.uid()) for update;
 if p.id is null then raise exception 'Listing unavailable'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>365 then raise exception 'Select up to 366 dates, including the last night'; end if;
 if p_weekdays is null or cardinality(p_weekdays)=0 or cardinality(p_weekdays)>7 or exists(select 1 from unnest(p_weekdays) w where w is null or w<0 or w>6) then raise exception 'Choose valid weekdays'; end if;
 if p_mode is null or p_mode not in ('set','percent','clear') then raise exception 'Invalid price action'; end if;
 if p_floor is null or p_ceiling is null or p_floor<100 or p_ceiling>1000000 or p_floor>p_ceiling then raise exception 'Invalid price limits'; end if;
 if p_mode<>'clear' and (p_value is null or p_value::text in ('NaN','Infinity','-Infinity')) then raise exception 'Invalid price value'; end if;
 if p_mode='percent' and (p_value<-99 or p_value>100) then raise exception 'Adjustment must be between -99%% and 100%%'; end if;
 if p_mode='set' and (p_value<>round(p_value) or p_value<100 or p_value>1000000) then raise exception 'Rate must be between $1 and $10,000'; end if;
 if p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Preview prices before saving'; end if;
 for d in select p_start+i from generate_series(0,p_end-p_start) i where extract(dow from p_start+i)::integer=any(p_weekdays) loop
  select amount_cents into old_rate from public.ts_rates where property_id=p.id and day=d for update;
  old_rate:=coalesce(old_rate,case when extract(dow from d) in (5,6) then p.weekend_cents else p.weekday_cents end);
  if (p_expected->>d::text)::integer is distinct from old_rate then raise exception 'Prices changed. Preview again before saving'; end if;
  new_rate:=case p_mode when 'set' then p_value::integer when 'percent' then round(old_rate*(1+p_value/100))::integer else null end;
  if p_mode<>'clear' and (new_rate<p_floor or new_rate>p_ceiling) then raise exception 'A price falls outside your limits. Adjust the limits or price and preview again'; end if;
  if p_mode='clear' then delete from public.ts_rates where property_id=p.id and day=d;
  else insert into public.ts_rates(owner_id,property_id,day,amount_cents) values(p.owner_id,p.id,d,new_rate) on conflict(property_id,day) do update set amount_cents=excluded.amount_cents; end if;
  changed:=changed+1;
 end loop;
 if changed=0 or changed<>(select count(*) from jsonb_object_keys(p_expected)) then raise exception 'Date selection changed. Preview again'; end if;
 return changed;
end $$;
revoke all on function public.ts_edit_rates(uuid,date,date,integer[],text,numeric,integer,integer,jsonb) from public,anon;
grant execute on function public.ts_edit_rates(uuid,date,date,integer[],text,numeric,integer,integer,jsonb) to authenticated;
