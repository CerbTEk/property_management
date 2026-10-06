-- Native imports are separate from the optional connector. Browser insertions
-- cannot claim a native source, and imported observations remain server-only.
alter table public.ts_locks drop constraint ts_locks_provider_check;
alter table public.ts_locks add constraint ts_locks_provider_check check(provider in ('ttlock','seam','nuki','tedee','igloohome'));
create policy ts_native_server_import on public.ts_locks as restrictive for insert to authenticated with check(provider not in ('tedee','igloohome'));
alter table public.ts_native_lock_accounts add column refresh_until timestamptz,add column refresh_failed boolean not null default false,add column last_synced_at timestamptz,add column imported_count integer not null default 0;
create function public.ts_claim_native_refresh(p_owner uuid,p_provider text,p_revision uuid)
returns setof public.ts_native_lock_accounts language sql security invoker set search_path='' as $$
 update public.ts_native_lock_accounts set revision=gen_random_uuid(),refresh_until=clock_timestamp()+interval '60 seconds'
 where owner_id=p_owner and provider=p_provider and revision=p_revision and status='connected' and not refresh_failed and (refresh_until is null or refresh_until<clock_timestamp())
 returning *;
$$;
create function public.ts_save_native_account(p_owner uuid,p_provider text,p_revision uuid,p_sealed text,p_expires timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.ts_native_lock_accounts set sealed_tokens=p_sealed,expires_at=p_expires,status='connected',refresh_until=null,refresh_failed=false,last_synced_at=null,imported_count=0,revision=gen_random_uuid(),updated_at=clock_timestamp()
 where owner_id=p_owner and provider=p_provider and revision=p_revision;
 if not found then return false; end if;
 update public.ts_locks set capabilities='{}',online=null,synced_at=null where owner_id=p_owner and provider=p_provider;
 return true;
end;
$$;
create function public.ts_import_native_inventory(p_owner uuid,p_provider text,p_revision uuid,p_locks jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb; imported integer:=0;
begin
 if p_provider is null or p_locks is null or p_provider not in ('tedee','igloohome') or jsonb_typeof(p_locks)<>'array' or jsonb_array_length(p_locks)>2000 then raise exception 'Invalid inventory'; end if;
 perform 1 from public.ts_native_lock_accounts where owner_id=p_owner and provider=p_provider and revision=p_revision and status='connected' and not refresh_failed and refresh_until is null for update;
 if not found then raise exception 'Connection changed'; end if;
 -- Every sync is an atomic snapshot. Removed devices retain assignments but
 -- lose observations; a failed sync never leaves a partial imported set.
 update public.ts_locks set online=null,capabilities='{}',synced_at=null where owner_id=p_owner and provider=p_provider;
 for item in select value from jsonb_array_elements(p_locks) loop
  if (item->>'provider') is distinct from p_provider or (item->>'brand') is distinct from p_provider or item->>'provider_device_id' is null or item->>'provider_device_id' !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'Invalid device'; end if;
  if exists(select 1 from public.ts_locks where owner_id=p_owner and brand=p_provider and provider<>p_provider and provider_device_id=item->>'provider_device_id') then raise exception 'Device already uses another provider'; end if;
  insert into public.ts_locks(owner_id,provider,brand,provider_device_id,name,online,capabilities,synced_at)
  values(p_owner,p_provider,p_provider,item->>'provider_device_id',item->>'name',(item->>'online')::boolean,'{}',(item->>'synced_at')::timestamptz)
  on conflict(owner_id,provider,provider_device_id) do update set online=excluded.online,capabilities='{}',synced_at=excluded.synced_at;
  imported:=imported+1;
 end loop;
 update public.ts_native_lock_accounts set last_synced_at=clock_timestamp(),imported_count=imported where owner_id=p_owner and provider=p_provider;
 return imported;
end;
$$;
-- Disconnect invalidates pending work, wipes tokens, and clears observations.
create or replace function public.ts_disconnect_native_lock(p_owner uuid,p_provider text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.ts_native_lock_accounts set status='disconnected',sealed_tokens=null,expires_at=null,revision=gen_random_uuid(),updated_at=clock_timestamp(),refresh_until=null,refresh_failed=false,last_synced_at=null,imported_count=0 where owner_id=p_owner and provider=p_provider;
 delete from public.ts_native_lock_authorizations where owner_id=p_owner and provider=p_provider;
 update public.ts_locks set online=null,capabilities='{}',synced_at=null where owner_id=p_owner and provider=p_provider;
end;
$$;
revoke all on function public.ts_claim_native_refresh(uuid,text,uuid),public.ts_save_native_account(uuid,text,uuid,text,timestamptz),public.ts_import_native_inventory(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ts_claim_native_refresh(uuid,text,uuid),public.ts_save_native_account(uuid,text,uuid,text,timestamptz),public.ts_import_native_inventory(uuid,text,uuid,jsonb) to service_role;
