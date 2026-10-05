create table public.ts_guest_displays (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 property_id uuid not null unique,
 title text not null default 'Welcome, {{guest}}' check(length(title) between 1 and 120),
 welcome text not null default '' check(length(welcome)<=2000),
 guidebook text not null default '' check(length(guidebook)<=10000),
 recommendations text not null default '' check(length(recommendations)<=4000),
 contact text not null default '' check(length(contact)<=500),
 created_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id)
);
create index on public.ts_guest_displays(owner_id);
alter table public.ts_guest_displays enable row level security;
revoke all on public.ts_guest_displays from anon,authenticated;
grant select,insert,update on public.ts_guest_displays to authenticated;
create policy ts_displays_owner on public.ts_guest_displays to authenticated
 using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
