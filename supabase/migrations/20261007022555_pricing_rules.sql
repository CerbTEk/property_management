create table public.ts_pricing_rules (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid not null,
 revision integer not null default 1 check(revision>0),cleaning_cents integer not null default 0 check(cleaning_cents between 0 and 1000000),
 included_guests integer not null default 1 check(included_guests between 1 and 100),extra_guest_cents integer not null default 0 check(extra_guest_cents between 0 and 100000),
 weekly_bps integer not null default 0 check(weekly_bps between 0 and 10000),monthly_bps integer not null default 0 check(monthly_bps between 0 and 10000),
 last_minute_days integer not null default 0 check(last_minute_days between 0 and 365),last_minute_bps integer not null default 0 check(last_minute_bps between 0 and 10000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(property_id),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id)
);
create index ts_pricing_rules_owner on public.ts_pricing_rules(owner_id);
create index ts_pricing_rules_property_owner on public.ts_pricing_rules(property_id,owner_id);
alter table public.ts_pricing_rules enable row level security;
revoke all on public.ts_pricing_rules from public,anon,authenticated;
grant select,insert,update on public.ts_pricing_rules to authenticated;
grant all on public.ts_pricing_rules to service_role;
create policy ts_pricing_rules_owner on public.ts_pricing_rules to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_pricing_rules as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_pricing_rule_validation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.property_id<>old.property_id or new.id<>old.id) then raise exception 'Pricing rule ownership cannot change';end if;
 if tg_op='INSERT' then new.revision=1;new.created_at=clock_timestamp();else new.revision=old.revision+1;new.created_at=old.created_at;end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_pricing_rule_validation() from public,anon,authenticated;
create trigger ts_pricing_rule_validation before insert or update on public.ts_pricing_rules for each row execute function public.ts_pricing_rule_validation();
create function public.ts_save_pricing_rules(p_property uuid,p_expected integer,p_values jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare old public.ts_pricing_rules;result uuid;
begin
 perform 1 from public.ts_properties where id=p_property and owner_id=auth.uid() for update;if not found then raise exception 'Listing unavailable';end if;
 select * into old from public.ts_pricing_rules where property_id=p_property;
 if p_expected is null or p_expected<>coalesce(old.revision,0) then raise exception 'Rules changed. Refresh before saving';end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' then raise exception 'Enter valid rule values';end if;
 if (select count(*) from jsonb_object_keys(p_values))<>7 or not p_values ?& array['cleaning_cents','included_guests','extra_guest_cents','weekly_bps','monthly_bps','last_minute_days','last_minute_bps'] then raise exception 'Enter all rule values';end if;
 if exists(select 1 from jsonb_each(p_values) where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$') then raise exception 'Rule values must be whole non-negative units';end if;
 insert into public.ts_pricing_rules(owner_id,property_id,cleaning_cents,included_guests,extra_guest_cents,weekly_bps,monthly_bps,last_minute_days,last_minute_bps)
 values(auth.uid(),p_property,(p_values->>'cleaning_cents')::integer,(p_values->>'included_guests')::integer,(p_values->>'extra_guest_cents')::integer,(p_values->>'weekly_bps')::integer,(p_values->>'monthly_bps')::integer,(p_values->>'last_minute_days')::integer,(p_values->>'last_minute_bps')::integer)
 on conflict(property_id) do update set cleaning_cents=excluded.cleaning_cents,included_guests=excluded.included_guests,extra_guest_cents=excluded.extra_guest_cents,weekly_bps=excluded.weekly_bps,monthly_bps=excluded.monthly_bps,last_minute_days=excluded.last_minute_days,last_minute_bps=excluded.last_minute_bps returning id into result;
 return result;
end $$;
revoke all on function public.ts_save_pricing_rules(uuid,integer,jsonb) from public,anon;
grant execute on function public.ts_save_pricing_rules(uuid,integer,jsonb) to authenticated;
