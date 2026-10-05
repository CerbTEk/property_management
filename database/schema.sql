-- Dedicated Treestand project only. No existing Kairo/ForgeCIF tables are used.
create extension if not exists btree_gist;
create table public.ts_properties (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 120), timezone text not null default 'America/New_York',
 weekday_cents integer not null check(weekday_cents between 100 and 1000000), weekend_cents integer not null check(weekend_cents between 100 and 1000000),
 markup_percent numeric(6,2) not null default 0 check(markup_percent between 0 and 100),
 max_guests integer not null default 2 check(max_guests between 1 and 100), min_stay integer not null default 1 check(min_stay between 1 and 365),
 check_in time not null default '15:00', check_out time not null default '11:00', created_at timestamptz not null default now(),
 unique(id,owner_id)
);
create table public.ts_reservations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), property_id uuid not null,
 guest text not null check(length(trim(guest)) between 1 and 100), arrival date not null, departure date not null,
 guests integer not null check(guests between 1 and 100), status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 note text not null default '' check(length(note)<=2000), source text not null default 'manual' check(source='manual'), created_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id), check(departure>arrival),
 exclude using gist(property_id with =, daterange(arrival,departure,'[)') with &&) where (status='confirmed')
);
create table public.ts_rates (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), property_id uuid not null,
 day date not null, amount_cents integer not null check(amount_cents between 100 and 1000000), created_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id), unique(property_id,day)
);
create table public.ts_message_templates (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 120), body text not null check(length(body) between 1 and 4000), created_at timestamptz not null default now()
);
create index on public.ts_properties(owner_id);
create index on public.ts_reservations(owner_id,arrival);
create index on public.ts_rates(owner_id);
create index on public.ts_message_templates(owner_id);
create function public.ts_check_reservation() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.ts_properties;
begin
 if new.status='cancelled' then return new; end if;
 select * into p from public.ts_properties where id=new.property_id and owner_id=new.owner_id;
 if p.id is null then raise exception 'Listing unavailable'; end if;
 if new.guests>p.max_guests then raise exception 'Maximum occupancy exceeded'; end if;
 if new.departure-new.arrival<p.min_stay then raise exception 'Minimum stay not met'; end if;
 return new;
end $$;
revoke all on function public.ts_check_reservation() from public,anon,authenticated;
create trigger ts_reservation_validation before insert or update on public.ts_reservations for each row execute function public.ts_check_reservation();
alter table public.ts_properties enable row level security;
alter table public.ts_reservations enable row level security;
alter table public.ts_rates enable row level security;
alter table public.ts_message_templates enable row level security;
revoke all on public.ts_properties,public.ts_reservations,public.ts_rates,public.ts_message_templates from anon,authenticated;
grant select,insert,update on public.ts_properties,public.ts_reservations,public.ts_rates,public.ts_message_templates to authenticated;
create policy ts_properties_owner on public.ts_properties to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_reservations_owner on public.ts_reservations to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_rates_owner on public.ts_rates to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_templates_owner on public.ts_message_templates to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
