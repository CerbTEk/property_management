-- Stripe IDs and subscription states are server-owned, never browser-editable.
create table public.ts_stripe_accounts (
 owner_id uuid not null references auth.users(id), livemode boolean not null,
 account_id text check(account_id ~ '^acct_[A-Za-z0-9]+$'), contact_email text not null,
 creation_key uuid not null default gen_random_uuid(), created_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz,
 checkout_key uuid, checkout_started_at timestamptz, checkout_id text, checkout_interval text,
 updated_at timestamptz not null default now(), primary key(owner_id,livemode), unique(account_id,livemode)
);
create table public.ts_stripe_subscriptions (
 subscription_id text primary key, owner_id uuid not null, livemode boolean not null,
 status text not null, price_id text not null, current_period_end timestamptz,
 cancel_at_period_end boolean not null default false, checked_at timestamptz not null default now(),
 foreign key(owner_id,livemode) references public.ts_stripe_accounts(owner_id,livemode)
);
create index ts_stripe_subscriptions_owner on public.ts_stripe_subscriptions(owner_id,livemode);
create table public.ts_stripe_events (
 event_id text primary key, livemode boolean not null, event_type text not null,
 processed_at timestamptz not null default now()
);
alter table public.ts_stripe_accounts enable row level security;
alter table public.ts_stripe_subscriptions enable row level security;
alter table public.ts_stripe_events enable row level security;
revoke all on public.ts_stripe_accounts,public.ts_stripe_subscriptions,public.ts_stripe_events from public,anon,authenticated;
grant select,insert,update on public.ts_stripe_accounts,public.ts_stripe_subscriptions,public.ts_stripe_events to service_role;
-- Serialize account creation, checkout and webhook reconciliation per host/mode.
create function public.ts_claim_stripe_operation(p_owner uuid,p_live boolean,p_email text)
returns setof public.ts_stripe_accounts language sql security invoker set search_path='' as $$
 insert into public.ts_stripe_accounts as a(owner_id,livemode,contact_email,lease_token,lease_until)
 values(p_owner,p_live,p_email,gen_random_uuid(),clock_timestamp()+interval '120 seconds')
 on conflict(owner_id,livemode) do update set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds'
 where a.lease_until is null or a.lease_until<clock_timestamp()
 returning a.*;
$$;
revoke all on function public.ts_claim_stripe_operation(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.ts_claim_stripe_operation(uuid,boolean,text) to service_role;
-- Validate the lease while holding the row lock; never race an expired worker.
create function public.ts_save_stripe_subscription(p_owner uuid,p_live boolean,p_lease uuid,p_snapshot jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ts_stripe_accounts where owner_id=p_owner and livemode=p_live and lease_token=p_lease and lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 insert into public.ts_stripe_subscriptions(subscription_id,owner_id,livemode,status,price_id,current_period_end,cancel_at_period_end)
 values(p_snapshot->>'subscription_id',p_owner,p_live,p_snapshot->>'status',p_snapshot->>'price_id',(p_snapshot->>'current_period_end')::timestamptz,(p_snapshot->>'cancel_at_period_end')::boolean)
 on conflict(subscription_id) do update set status=excluded.status,price_id=excluded.price_id,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,checked_at=clock_timestamp()
 where public.ts_stripe_subscriptions.owner_id=p_owner and public.ts_stripe_subscriptions.livemode=p_live;
 return found;
end $$;
revoke all on function public.ts_save_stripe_subscription(uuid,boolean,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ts_save_stripe_subscription(uuid,boolean,uuid,jsonb) to service_role;
