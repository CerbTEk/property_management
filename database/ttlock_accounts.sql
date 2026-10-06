-- Passwords are never persisted. Ciphertext is service-only; hosts read connection status.
create table public.ts_ttlock_accounts(
 owner_id uuid primary key references auth.users(id),provider_uid text,
 status text not null default 'disconnected' check(status in ('connected','disconnected')),
 sealed_tokens text,expires_at timestamptz,revision uuid not null default gen_random_uuid(),
 connected_at timestamptz not null default now(),updated_at timestamptz not null default now(),last_attempt_at timestamptz,
 check(status<>'connected' or (provider_uid is not null and sealed_tokens is not null and expires_at is not null))
);
alter table public.ts_ttlock_accounts enable row level security;
revoke all on public.ts_ttlock_accounts from anon,authenticated;
grant select(owner_id,status,expires_at,connected_at,updated_at) on public.ts_ttlock_accounts to authenticated;
grant select,insert,update on public.ts_ttlock_accounts to service_role;
create policy ts_ttlock_accounts_owner on public.ts_ttlock_accounts to authenticated using((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_ttlock_accounts as restrictive to authenticated using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
-- Rate-limit account sign-in and rotate the revision before any provider call.
-- Invoker privileges, service-only execution, no RLS bypass for browser callers.
create function public.ts_claim_ttlock_connect(p_owner uuid)
returns table(owner_id uuid,revision uuid) language sql security invoker set search_path='' as $$
 insert into public.ts_ttlock_accounts as account(owner_id,last_attempt_at)
 values(p_owner,clock_timestamp())
 on conflict(owner_id) do update set last_attempt_at=clock_timestamp(),revision=gen_random_uuid()
 where account.last_attempt_at is null or account.last_attempt_at<clock_timestamp()-interval '15 seconds'
 returning account.owner_id,account.revision;
$$;
revoke all on function public.ts_claim_ttlock_connect(uuid) from public,anon,authenticated;
grant execute on function public.ts_claim_ttlock_connect(uuid) to service_role;
