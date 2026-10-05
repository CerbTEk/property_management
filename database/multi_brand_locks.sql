alter table public.ts_locks add column provider text not null default 'ttlock' check(provider in ('ttlock','seam','nuki')),
 add column provider_device_id text check(length(provider_device_id) between 1 and 128),
 add column brand text not null default 'ttlock' check(brand in ('ttlock','august','yale','schlage','kwikset','igloohome','lockly','tedee','nuki','other')),
 add column capabilities jsonb not null default '{}', add column online boolean, add column synced_at timestamptz;
create unique index ts_locks_provider_device on public.ts_locks(owner_id,provider,provider_device_id);
-- Provider observations cannot be supplied or forged by browser clients.
revoke insert,update on public.ts_locks from authenticated;
grant insert(owner_id,name,provider_lock_id,gateway_id,enabled,provider,provider_device_id,brand) on public.ts_locks to authenticated;
grant update(name,provider_lock_id,gateway_id,enabled) on public.ts_locks to authenticated;
create table public.ts_lock_connections(
 id uuid primary key, owner_id uuid not null references auth.users(id),
 provider text not null default 'seam' check(provider='seam'),created_at timestamptz not null default now()
);
alter table public.ts_lock_connections enable row level security;
revoke all on public.ts_lock_connections from anon,authenticated;
grant select on public.ts_lock_connections to authenticated;
grant all on public.ts_lock_connections,public.ts_locks to service_role;
create policy ts_lock_connections_owner on public.ts_lock_connections to authenticated using((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_lock_connections as restrictive to authenticated using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create index on public.ts_lock_connections(owner_id);
