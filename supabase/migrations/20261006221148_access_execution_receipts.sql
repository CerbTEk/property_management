-- Provider write checkpoints. No browser role can read or mutate these records.
alter table public.ts_access_receipts
 add column operation text check(operation in ('create','update','revoke')),
 add column operation_token uuid,
 add column provider_acknowledged boolean not null default false;
create unique index ts_access_receipts_active_route on public.ts_access_receipts(owner_id,booking_id,lock_id) where state<>'revoked';

create function public.ts_access_work_current(p_owner uuid,p_token uuid,p_revision bigint)
returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from public.ts_access_work where owner_id=p_owner and lease_token=p_token
  and leased_revision=p_revision and revision=p_revision and lease_until>clock_timestamp());
$$;

create function public.ts_begin_access_operation(p_owner uuid,p_token uuid,p_revision bigint,p_operation text,p_receipt uuid,p_grant jsonb)
returns setof public.ts_access_receipts language plpgsql security invoker set search_path='' as $$
declare work public.ts_access_work; receipt public.ts_access_receipts;
begin
 if p_operation not in ('create','update','revoke') or p_operation is null then raise exception 'Invalid access operation'; end if;
 select * into work from public.ts_access_work where owner_id=p_owner for update;
 if work.lease_token is distinct from p_token or work.leased_revision is distinct from p_revision
  or work.revision is distinct from p_revision or work.lease_until is null or work.lease_until<=clock_timestamp() then return; end if;
 if p_operation='create' then
  if p_receipt is not null or p_grant->>'provider' is distinct from 'ttlock' then raise exception 'Invalid native grant'; end if;
  if not exists(select 1 from public.ts_reservations b join public.ts_locks l on l.owner_id=b.owner_id
    join public.ts_lock_assignments a on a.owner_id=b.owner_id and a.property_id=b.property_id and a.lock_id=l.id
    where b.owner_id=p_owner and b.id=(p_grant->>'booking_id')::uuid and l.id=(p_grant->>'lock_id')::uuid
     and b.status='confirmed' and b.kind<>'block' and l.enabled and l.provider='ttlock'
     and l.provider_lock_id=p_grant->>'device_id') then raise exception 'Access route unavailable'; end if;
  insert into public.ts_access_receipts(owner_id,booking_id,lock_id,provider,device_id,code_tag,starts_at,ends_at,state,operation,operation_token)
  values(p_owner,(p_grant->>'booking_id')::uuid,(p_grant->>'lock_id')::uuid,'ttlock',p_grant->>'device_id',p_grant->>'code_tag',
   (p_grant->>'starts_at')::timestamptz,(p_grant->>'ends_at')::timestamptz,'uncertain',p_operation,gen_random_uuid()) returning * into receipt;
 else
  select * into receipt from public.ts_access_receipts where owner_id=p_owner and id=p_receipt and state='installed' for update;
  if receipt.id is null then return; end if;
  if receipt.provider<>'ttlock' then raise exception 'Native provider unavailable'; end if;
  if p_operation='update' and (p_grant->>'code_tag' is distinct from receipt.code_tag or
    p_grant->>'device_id' is distinct from receipt.device_id or (p_grant->>'booking_id')::uuid is distinct from receipt.booking_id or
    (p_grant->>'lock_id')::uuid is distinct from receipt.lock_id) then raise exception 'Access identity changed'; end if;
  update public.ts_access_receipts set state='uncertain',operation=p_operation,operation_token=gen_random_uuid(),provider_acknowledged=false,
   starts_at=case when p_operation='update' then (p_grant->>'starts_at')::timestamptz else starts_at end,
   ends_at=case when p_operation='update' then (p_grant->>'ends_at')::timestamptz else ends_at end,updated_at=clock_timestamp()
  where id=receipt.id returning * into receipt;
 end if;
 return next receipt;
end $$;

create function public.ts_ack_access_operation(p_owner uuid,p_token uuid,p_revision bigint,p_receipt uuid,p_operation_token uuid,p_provider_code_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ts_access_work where owner_id=p_owner for update;
 if not public.ts_access_work_current(p_owner,p_token,p_revision) then return false; end if;
 update public.ts_access_receipts set provider_acknowledged=true,provider_code_id=p_provider_code_id,updated_at=clock_timestamp()
 where owner_id=p_owner and id=p_receipt and operation_token=p_operation_token and state='uncertain';
 return found;
end $$;

create function public.ts_settle_access_operation(p_owner uuid,p_token uuid,p_revision bigint,p_receipt uuid,p_operation_token uuid,p_state text,p_provider_code_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_state not in ('installed','revoked') or p_state is null then raise exception 'Invalid access outcome'; end if;
 perform 1 from public.ts_access_work where owner_id=p_owner for update;
 if not public.ts_access_work_current(p_owner,p_token,p_revision) then return false; end if;
 update public.ts_access_receipts set state=p_state,provider_code_id=p_provider_code_id,updated_at=clock_timestamp()
 where owner_id=p_owner and id=p_receipt and operation_token=p_operation_token and state='uncertain'
  and (p_state='installed' or (operation='revoke' and provider_acknowledged));
 return found;
end $$;

revoke all on function public.ts_access_work_current(uuid,uuid,bigint),public.ts_begin_access_operation(uuid,uuid,bigint,text,uuid,jsonb),public.ts_ack_access_operation(uuid,uuid,bigint,uuid,uuid,text),public.ts_settle_access_operation(uuid,uuid,bigint,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ts_access_work_current(uuid,uuid,bigint),public.ts_begin_access_operation(uuid,uuid,bigint,text,uuid,jsonb),public.ts_ack_access_operation(uuid,uuid,bigint,uuid,uuid,text),public.ts_settle_access_operation(uuid,uuid,bigint,uuid,uuid,text,text) to service_role;
