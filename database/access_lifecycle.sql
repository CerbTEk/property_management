-- Durable invalidations, not permission to write to physical locks.
create schema if not exists treestand_private;
revoke all on schema treestand_private from public,anon,authenticated;
grant usage on schema treestand_private to service_role;

create table public.ts_access_work (
 owner_id uuid primary key references auth.users(id), revision bigint not null default 1 check(revision>0),
 next_run_at timestamptz not null default now(), changed_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, leased_revision bigint,
 check((lease_token is null and lease_until is null and leased_revision is null) or
       (lease_token is not null and lease_until is not null and leased_revision is not null))
);
create index ts_access_work_due on public.ts_access_work(next_run_at);
create table public.ts_access_receipts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 booking_id uuid not null, lock_id uuid not null, provider text not null,
 device_id text not null check(length(device_id) between 1 and 128),
 provider_code_id text check(length(provider_code_id) between 1 and 128),
 code_tag text not null check(code_tag ~ '^[a-f0-9]{64}$'),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 state text not null check(state in ('installed','uncertain','revoked')),
 updated_at timestamptz not null default now(),
 check(state<>'installed' or provider_code_id is not null)
);
-- Deliberately retain references when a booking/assignment disappears, for cleanup.
create index ts_access_receipts_owner on public.ts_access_receipts(owner_id,state);
alter table public.ts_access_work enable row level security;
alter table public.ts_access_receipts enable row level security;
revoke all on public.ts_access_work,public.ts_access_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.ts_access_work,public.ts_access_receipts to service_role;

-- This narrow trigger must enqueue under browser mutations without granting hosts
-- queue/receipt writes. It lives outside exposed schemas, validates the caller,
-- and stores only the owner ID and a monotonic revision, never guest data or PINs.
create function treestand_private.ts_access_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_owner uuid; v_uid uuid; v_role text;
begin
 v_owner := case when TG_OP='DELETE' then old.owner_id else new.owner_id end;
 if TG_OP='UPDATE' and old.owner_id is distinct from new.owner_id then
  raise exception 'Access ownership cannot be reassigned';
 end if;
 v_uid:=auth.uid(); v_role:=current_setting('role',true);
 if v_role not in ('service_role','postgres','supabase_admin') and
    not(v_role='none' and session_user in ('postgres','supabase_admin')) then
  if v_uid is null or v_uid<>v_owner or
     ((auth.jwt()->>'aal') is distinct from 'aal2' and v_uid<>'3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) then
   raise exception 'Access change not authorized';
  end if;
 end if;
 insert into public.ts_access_work as work(owner_id) values(v_owner)
 on conflict(owner_id) do update set revision=work.revision+1,
  next_run_at=least(work.next_run_at,clock_timestamp()),changed_at=clock_timestamp();
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function treestand_private.ts_access_changed() from public,anon,authenticated;

create trigger ts_access_changed after insert or update or delete on public.ts_reservations for each row execute function treestand_private.ts_access_changed();
create trigger ts_access_changed after insert or update or delete on public.ts_lock_assignments for each row execute function treestand_private.ts_access_changed();
create trigger ts_access_changed after insert or update or delete on public.ts_locks for each row execute function treestand_private.ts_access_changed();
create trigger ts_access_changed after insert or update or delete on public.ts_properties for each row execute function treestand_private.ts_access_changed();
create trigger ts_access_changed after insert or update or delete on public.ts_ttlock_accounts for each row execute function treestand_private.ts_access_changed();
create trigger ts_access_changed after insert or update or delete on public.ts_native_lock_accounts for each row execute function treestand_private.ts_access_changed();

create function public.ts_claim_access_work(p_limit integer default 10)
returns setof public.ts_access_work language sql security invoker set search_path='' as $$
 with due as (
  select owner_id from public.ts_access_work
  where next_run_at<=clock_timestamp() and (lease_until is null or lease_until<=clock_timestamp())
  order by next_run_at,owner_id limit greatest(1,least(coalesce(p_limit,10),100)) for update skip locked
 ) update public.ts_access_work as work set lease_token=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '120 seconds',leased_revision=work.revision
 from due where work.owner_id=due.owner_id returning work.*;
$$;
create function public.ts_finish_access_work(p_owner uuid,p_token uuid,p_revision bigint,p_next timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_next is null or p_next<clock_timestamp() then raise exception 'A future reconciliation time is required'; end if;
 update public.ts_access_work set next_run_at=p_next,lease_token=null,lease_until=null,leased_revision=null
 where owner_id=p_owner and lease_token=p_token and lease_until>clock_timestamp()
  and leased_revision=p_revision and revision=p_revision;
 return found;
end $$;
revoke all on function public.ts_claim_access_work(integer),public.ts_finish_access_work(uuid,uuid,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.ts_claim_access_work(integer),public.ts_finish_access_work(uuid,uuid,bigint,timestamptz) to service_role;

-- Seed existing hosts once; queue remains pending until an authorized worker exists.
insert into public.ts_access_work(owner_id)
select owner_id from public.ts_properties union select owner_id from public.ts_access_receipts
on conflict(owner_id) do nothing;
