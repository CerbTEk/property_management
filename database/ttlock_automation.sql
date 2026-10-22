-- Explicit per-host consent for assignment-based TTLock booking-code automation.
-- Apply after ttlock_accounts.sql and access_lifecycle.sql. No host is enabled here.
alter table public.ts_ttlock_accounts
 add column automation_enabled boolean not null default false,
 add column automation_revision uuid not null default gen_random_uuid(),
 add column automation_updated_at timestamptz,
 add constraint ts_ttlock_automation_connected check (not automation_enabled or status='connected');
-- Existing account RLS and column grants are unchanged. Browser callers cannot
-- update consent directly or execute the service-only compare-and-set below.
create function treestand_private.ts_ttlock_automation_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.owner_id is distinct from new.owner_id then
  raise exception 'Connection ownership cannot be reassigned';
 end if;
 if old.status is distinct from new.status or old.provider_uid is distinct from new.provider_uid then
  new.automation_enabled := false;
  new.automation_revision := gen_random_uuid();
  new.automation_updated_at := clock_timestamp();
 elsif old.automation_enabled is distinct from new.automation_enabled then
  new.automation_revision := gen_random_uuid();
  new.automation_updated_at := clock_timestamp();
 end if;
 return new;
end $$;
revoke all on function treestand_private.ts_ttlock_automation_guard() from public,anon,authenticated;
grant execute on function treestand_private.ts_ttlock_automation_guard() to service_role;
create trigger ts_ttlock_automation_guard before update on public.ts_ttlock_accounts
 for each row execute function treestand_private.ts_ttlock_automation_guard();

create function public.ts_set_ttlock_automation(p_owner uuid,p_enabled boolean,p_expected_revision uuid)
returns table(automation_enabled boolean,automation_revision uuid,automation_updated_at timestamptz)
language plpgsql security invoker set search_path='' as $$
declare account public.ts_ttlock_accounts%rowtype;
begin
 if p_owner is null or p_enabled is null or p_expected_revision is null then
  raise exception 'Complete automation settings are required';
 end if;
 select * into account from public.ts_ttlock_accounts where owner_id=p_owner for update;
 if not found then raise exception 'Connect your TTLock account first'; end if;
 if account.automation_revision<>p_expected_revision then
  raise exception 'Automation settings changed. Refresh and try again' using errcode='40001';
 end if;
 if p_enabled and account.status<>'connected' then
  raise exception 'Connect your TTLock account first';
 end if;
 if account.automation_enabled is distinct from p_enabled then
  update public.ts_ttlock_accounts set automation_enabled=p_enabled where owner_id=p_owner;
 end if;
 -- The existing ts_access_changed AFTER trigger queues changed consent and
 -- increments the work revision, invalidating any in-flight booking snapshot.
 return query select a.automation_enabled,a.automation_revision,a.automation_updated_at
  from public.ts_ttlock_accounts a where a.owner_id=p_owner;
end $$;
revoke all on function public.ts_set_ttlock_automation(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.ts_set_ttlock_automation(uuid,boolean,uuid) to service_role;
