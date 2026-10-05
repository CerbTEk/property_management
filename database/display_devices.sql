create table public.ts_display_devices (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 property_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 120),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 revoked boolean not null default false,
 expires_at timestamptz not null default (now()+interval '90 days'),
 created_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id)
);
create index on public.ts_display_devices(owner_id);
alter table public.ts_display_devices enable row level security;
revoke all on public.ts_display_devices from anon,authenticated;
grant select,insert on public.ts_display_devices to authenticated;
grant update(revoked) on public.ts_display_devices to authenticated;
grant all on public.ts_display_devices to service_role;
create policy ts_device_select on public.ts_display_devices for select to authenticated using((select auth.uid())=owner_id);
create policy ts_device_insert on public.ts_display_devices for insert to authenticated with check((select auth.uid())=owner_id and expires_at>now() and expires_at<=now()+interval '90 days');
create policy ts_device_revoke on public.ts_display_devices for update to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id and revoked=true);
