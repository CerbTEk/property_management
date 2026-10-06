-- Native authorization secrets are service-only. Host status comes from the
-- authenticated connector; no browser can read ciphertext or consume a grant.
create table public.ts_native_lock_accounts(
 owner_id uuid not null references auth.users(id),
 provider text not null check(provider in ('tedee','igloohome')),
 status text not null default 'disconnected' check(status in ('connected','disconnected')),
 sealed_tokens text,expires_at timestamptz,revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),last_attempt_at timestamptz,
 primary key(owner_id,provider),
 check(status<>'connected' or (sealed_tokens is not null and expires_at is not null))
);
create table public.ts_native_lock_authorizations(
 owner_id uuid not null,provider text not null,
 state_hash text not null check(state_hash ~ '^[a-f0-9]{64}$'),
 binding_hash text not null check(binding_hash ~ '^[a-f0-9]{64}$'),
 sealed_transaction text not null,account_revision uuid not null,expires_at timestamptz not null,
 primary key(owner_id,provider),
 foreign key(owner_id,provider) references public.ts_native_lock_accounts(owner_id,provider) on delete cascade
);
alter table public.ts_native_lock_accounts enable row level security;
alter table public.ts_native_lock_authorizations enable row level security;
revoke all on public.ts_native_lock_accounts,public.ts_native_lock_authorizations from public,anon,authenticated;
grant select,insert,update,delete on public.ts_native_lock_accounts,public.ts_native_lock_authorizations to service_role;
create policy native_service_only on public.ts_native_lock_accounts to service_role using(true) with check(true);
create policy native_service_only on public.ts_native_lock_authorizations to service_role using(true) with check(true);
create function public.ts_begin_native_lock(p_owner uuid,p_provider text,p_state text,p_binding text,p_sealed text,p_expires timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare rev uuid;
begin
 if p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '10 minutes 5 seconds' then raise exception 'Invalid expiration'; end if;
 insert into public.ts_native_lock_accounts as a(owner_id,provider,last_attempt_at)
 values(p_owner,p_provider,clock_timestamp())
 on conflict(owner_id,provider) do update set last_attempt_at=clock_timestamp(),revision=gen_random_uuid()
 where a.last_attempt_at is null or a.last_attempt_at<clock_timestamp()-interval '15 seconds'
 returning a.revision into rev;
 if rev is null then return null; end if;
 insert into public.ts_native_lock_authorizations(owner_id,provider,state_hash,binding_hash,sealed_transaction,account_revision,expires_at)
 values(p_owner,p_provider,p_state,p_binding,p_sealed,rev,p_expires)
 on conflict(owner_id,provider) do update set state_hash=excluded.state_hash,binding_hash=excluded.binding_hash,sealed_transaction=excluded.sealed_transaction,account_revision=excluded.account_revision,expires_at=excluded.expires_at;
 return rev;
end;
$$;
create function public.ts_consume_native_lock(p_owner uuid,p_provider text,p_state text,p_binding text)
returns setof public.ts_native_lock_authorizations language sql security invoker set search_path='' as $$
 delete from public.ts_native_lock_authorizations
 where owner_id=p_owner and provider=p_provider and state_hash=p_state and binding_hash=p_binding and expires_at>clock_timestamp()
 returning *;
$$;
create function public.ts_disconnect_native_lock(p_owner uuid,p_provider text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 update public.ts_native_lock_accounts set status='disconnected',sealed_tokens=null,expires_at=null,revision=gen_random_uuid(),updated_at=clock_timestamp()
 where owner_id=p_owner and provider=p_provider;
 delete from public.ts_native_lock_authorizations where owner_id=p_owner and provider=p_provider;
end;
$$;
revoke all on function public.ts_begin_native_lock(uuid,text,text,text,text,timestamptz),public.ts_consume_native_lock(uuid,text,text,text),public.ts_disconnect_native_lock(uuid,text) from public,anon,authenticated;
grant execute on function public.ts_begin_native_lock(uuid,text,text,text,text,timestamptz),public.ts_consume_native_lock(uuid,text,text,text),public.ts_disconnect_native_lock(uuid,text) to service_role;
