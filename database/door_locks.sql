-- Manual inventory and routing only. No passcodes or provider credentials stored here.
create table public.ts_locks (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 120),
 provider_lock_id text check(provider_lock_id ~ '^[1-9][0-9]{0,14}$'),
 gateway_id text check(gateway_id ~ '^[1-9][0-9]{0,14}$'),
 enabled boolean not null default true, created_at timestamptz not null default now(),
 unique(id,owner_id), unique(owner_id,provider_lock_id)
);
create table public.ts_lock_assignments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 property_id uuid not null, lock_id uuid not null,
 purpose text not null check(purpose in ('room','entrance')), created_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 foreign key(lock_id,owner_id) references public.ts_locks(id,owner_id), unique(owner_id,property_id,lock_id)
);
create index on public.ts_locks(owner_id);
create index on public.ts_lock_assignments(owner_id);
create index on public.ts_lock_assignments(lock_id,owner_id);
alter table public.ts_locks enable row level security;
alter table public.ts_lock_assignments enable row level security;
revoke all on public.ts_locks,public.ts_lock_assignments from anon,authenticated;
grant select,insert,update on public.ts_locks to authenticated;
grant select,insert,delete on public.ts_lock_assignments to authenticated;
create policy ts_locks_owner on public.ts_locks to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy ts_lock_assignments_owner on public.ts_lock_assignments to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_locks as restrictive to authenticated using ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create policy ts_host_mfa on public.ts_lock_assignments as restrictive to authenticated using ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
