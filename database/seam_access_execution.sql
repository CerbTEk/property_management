alter table public.ts_access_receipts add column operation_started_at timestamptz not null default now();
create or replace function public.ts_begin_access_operation(p_owner uuid,p_token uuid,p_revision bigint,p_operation text,p_receipt uuid,p_grant jsonb)
returns setof public.ts_access_receipts language plpgsql security invoker set search_path='' as $$
declare work public.ts_access_work; receipt public.ts_access_receipts;
begin
 if p_operation not in ('create','update','revoke') or p_operation is null then raise exception 'Invalid access operation'; end if;
 select * into work from public.ts_access_work where owner_id=p_owner for update;
 if work.lease_token is distinct from p_token or work.leased_revision is distinct from p_revision
  or work.revision is distinct from p_revision or work.lease_until is null or work.lease_until<=clock_timestamp() then return; end if;
 if p_operation='create' then
  if p_receipt is not null or (p_grant->>'provider' is null or p_grant->>'provider' not in ('ttlock','seam')) then raise exception 'Invalid native grant'; end if;
  if not exists(select 1 from public.ts_reservations b join public.ts_locks l on l.owner_id=b.owner_id
    join public.ts_lock_assignments a on a.owner_id=b.owner_id and a.property_id=b.property_id and a.lock_id=l.id
    where b.owner_id=p_owner and b.id=(p_grant->>'booking_id')::uuid and l.id=(p_grant->>'lock_id')::uuid
     and b.status='confirmed' and b.kind<>'block' and l.enabled and l.provider=p_grant->>'provider'
     and case when l.provider='seam' then l.provider_device_id else l.provider_lock_id end=p_grant->>'device_id') then raise exception 'Access route unavailable'; end if;
  insert into public.ts_access_receipts(owner_id,booking_id,lock_id,provider,device_id,code_tag,starts_at,ends_at,state,operation,operation_token)
  values(p_owner,(p_grant->>'booking_id')::uuid,(p_grant->>'lock_id')::uuid,p_grant->>'provider',p_grant->>'device_id',p_grant->>'code_tag',
   (p_grant->>'starts_at')::timestamptz,(p_grant->>'ends_at')::timestamptz,'uncertain',p_operation,gen_random_uuid()) returning * into receipt;
 else
  select * into receipt from public.ts_access_receipts where owner_id=p_owner and id=p_receipt and state='installed' for update;
  if receipt.id is null then return; end if;
  if receipt.provider not in ('ttlock','seam') then raise exception 'Native provider unavailable'; end if;
  if p_operation='update' and (p_grant->>'provider' is distinct from receipt.provider or p_grant->>'code_tag' is distinct from receipt.code_tag or
    p_grant->>'device_id' is distinct from receipt.device_id or (p_grant->>'booking_id')::uuid is distinct from receipt.booking_id or
    (p_grant->>'lock_id')::uuid is distinct from receipt.lock_id) then raise exception 'Access identity changed'; end if;
  update public.ts_access_receipts set state='uncertain',operation_started_at=clock_timestamp(),operation=p_operation,operation_token=gen_random_uuid(),provider_acknowledged=false,
   starts_at=case when p_operation='update' then (p_grant->>'starts_at')::timestamptz else starts_at end,
   ends_at=case when p_operation='update' then (p_grant->>'ends_at')::timestamptz else ends_at end,updated_at=clock_timestamp()
  where id=receipt.id returning * into receipt;
 end if;
 return next receipt;
end $$;


-- Activation is service-managed following a model/keypad test, never inferred
-- from an imported lock. Removing an activation must follow receipt cleanup.
create table public.ts_access_device_activation (
 owner_id uuid not null references auth.users(id), provider text not null check(provider in ('seam','ttlock')),
 device_id text not null check(length(device_id) between 1 and 128), verified_at timestamptz not null default now(),
 primary key(owner_id,provider,device_id)
);
alter table public.ts_access_device_activation enable row level security;
revoke all on public.ts_access_device_activation from public,anon,authenticated;
grant select,insert,update,delete on public.ts_access_device_activation to service_role;
create trigger ts_access_changed after insert or update or delete on public.ts_access_device_activation for each row execute function treestand_private.ts_access_changed();
create trigger ts_access_changed after insert or update or delete on public.ts_lock_connections for each row execute function treestand_private.ts_access_changed();

create table public.ts_access_runner_config (
 id boolean primary key default true check(id), token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$')
);
alter table public.ts_access_runner_config enable row level security;
revoke all on public.ts_access_runner_config from public,anon,authenticated;
grant select on public.ts_access_runner_config to service_role;

-- A periodic provider audit can flag an installed receipt without claiming a
-- fresh physical operation or exposing its PIN to browser roles.
create function public.ts_review_access_receipt(p_owner uuid,p_token uuid,p_revision bigint,p_receipt uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ts_access_work where owner_id=p_owner for update;
 if not public.ts_access_work_current(p_owner,p_token,p_revision) then return false; end if;
 update public.ts_access_receipts set state='uncertain',operation='update',operation_token=gen_random_uuid(),provider_acknowledged=false,updated_at=clock_timestamp()
 where owner_id=p_owner and id=p_receipt and state='installed';
 return found;
end $$;
revoke all on function public.ts_review_access_receipt(uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.ts_review_access_receipt(uuid,uuid,bigint,uuid) to service_role;
