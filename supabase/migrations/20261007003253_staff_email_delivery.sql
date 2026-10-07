create table treestand_staff.email_jobs (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),kind text not null check(kind in ('invite','task')),reference_id uuid not null,
 recipient text not null,recipient_user uuid references auth.users(id),subject text not null,body text not null,source_revision timestamptz,
 state text not null default 'ready' check(state in ('ready','sending','accepted','delivered','bounced','complained','unknown','failed','cancelled')),
 provider_id text,lease uuid,lease_until timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp(),
 dedupe_key text not null unique
);
create index ts_staff_email_owner on treestand_staff.email_jobs(owner_id);
create index ts_staff_email_user on treestand_staff.email_jobs(recipient_user);
create unique index ts_staff_email_provider on treestand_staff.email_jobs(provider_id) where provider_id is not null;
create table treestand_staff.email_events(event_id text primary key,provider_id text not null,kind text not null check(kind in ('delivered','bounced','complained')),created_at timestamptz not null default now());
create index ts_staff_email_event_provider on treestand_staff.email_events(provider_id);
create table treestand_staff.email_suppressions(recipient text primary key,created_at timestamptz not null default now());
alter table treestand_staff.email_jobs enable row level security;
alter table treestand_staff.email_events enable row level security;
alter table treestand_staff.email_suppressions enable row level security;
revoke all on treestand_staff.email_jobs,treestand_staff.email_events,treestand_staff.email_suppressions from public,anon,authenticated;
create function public.ts_prepare_staff_email(p_kind text,p_reference uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(false);i public.ts_staff_invites;t public.ts_operations_tasks;email_target text;recipient_user uuid;subject text;body text;revision timestamptz;key text;j uuid;begin
 if p_kind='invite' then
  select * into i from public.ts_staff_invites where id=p_reference and owner_id=u and state='pending' and expires_at>now();
  if i.id is null or not exists(select 1 from public.ts_operations_people where id=i.person_id and owner_id=u and active) then raise exception 'Pending invitation unavailable';end if;
  email_target=i.email;subject='Your Treestand Manager staff invitation';body='You have been invited to help with property work in Treestand Manager. Sign in with this email address, verify your email and set up your authenticator, then accept your invitation. Accept before the expiry shown in your staff workspace. Staff workspace: https://treestand-manager.webflow.io/staff/';key='invite:'||i.id;
 elsif p_kind='task' then
  select * into t from public.ts_operations_tasks where id=p_reference and owner_id=u and status in ('open','in_progress');
  if t.id is null or exists(select 1 from public.ts_reservations where id=t.booking_id and owner_id=u and status='cancelled') then raise exception 'Open task unavailable';end if;
  select lower(a.email),a.id into email_target,recipient_user from treestand_staff.memberships m join public.ts_operations_people p on p.id=m.person_id and p.owner_id=m.owner_id and p.active join auth.users a on a.id=m.user_id and a.email_confirmed_at is not null join treestand_staff.preferences prefs on prefs.user_id=a.id and prefs.email_requested where m.person_id=t.assignee_id and m.owner_id=u and m.active;
  if email_target is null then raise exception 'Assigned staff must accept access and request email reminders first';end if;
  subject='Assigned property work reminder';body='You have open property work in Treestand Manager. Due date: '||t.due_day||'. Sign in to review current instructions: https://treestand-manager.webflow.io/staff/';revision=t.updated_at;key='task:'||t.id||':'||extract(epoch from t.updated_at)::text;
 else raise exception 'Choose an invitation or task reminder';end if;
 if exists(select 1 from treestand_staff.email_suppressions s where s.recipient=email_target) then raise exception 'Email delivery is suppressed for this recipient';end if;
 insert into treestand_staff.email_jobs(owner_id,kind,reference_id,recipient,recipient_user,subject,body,source_revision,dedupe_key) values(u,p_kind,p_reference,email_target,recipient_user,subject,body,revision,key)
 on conflict(dedupe_key) do nothing;
 select id into j from treestand_staff.email_jobs where dedupe_key=key and owner_id=u;return j;end $$;
revoke all on function public.ts_prepare_staff_email(text,uuid) from public,anon,authenticated;
grant execute on function public.ts_prepare_staff_email(text,uuid) to authenticated;
create function public.ts_claim_staff_email(p_job uuid,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j treestand_staff.email_jobs;valid boolean=true;token uuid;begin
 select * into j from treestand_staff.email_jobs where id=p_job and owner_id=p_owner for update;
 if j.id is null then raise exception 'Email unavailable';end if;
 if j.state='sending' and j.lease_until<=now() then update treestand_staff.email_jobs set state='unknown',updated_at=clock_timestamp() where id=j.id;j.state='unknown';end if;
 if j.state<>'ready' then return jsonb_build_object('state',j.state);end if;
 if j.kind='invite' then valid=exists(select 1 from public.ts_staff_invites i join public.ts_operations_people p on p.id=i.person_id and p.owner_id=i.owner_id and p.active where i.id=j.reference_id and i.owner_id=j.owner_id and i.state='pending' and i.expires_at>now() and i.email=j.recipient);
 else valid=exists(select 1 from public.ts_operations_tasks t join treestand_staff.memberships m on m.person_id=t.assignee_id and m.owner_id=t.owner_id and m.user_id=j.recipient_user and m.active join public.ts_operations_people p on p.id=m.person_id and p.owner_id=m.owner_id and p.active join auth.users a on a.id=m.user_id and a.email_confirmed_at is not null and lower(a.email)=j.recipient join treestand_staff.preferences prefs on prefs.user_id=m.user_id and prefs.email_requested where t.id=j.reference_id and t.owner_id=j.owner_id and t.updated_at=j.source_revision and t.status in ('open','in_progress') and not exists(select 1 from public.ts_reservations b where b.id=t.booking_id and b.owner_id=t.owner_id and b.status='cancelled'));end if;
 if not valid or exists(select 1 from treestand_staff.email_suppressions s where s.recipient=j.recipient) then update treestand_staff.email_jobs set state='cancelled',updated_at=clock_timestamp() where id=j.id;return jsonb_build_object('state','cancelled');end if;
 token=gen_random_uuid();update treestand_staff.email_jobs set state='sending',lease=token,lease_until=now()+interval '120 seconds',updated_at=clock_timestamp() where id=j.id;
 return jsonb_build_object('state','sending','lease',token,'to',j.recipient,'subject',j.subject,'text',j.body);end $$;
revoke all on function public.ts_claim_staff_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ts_claim_staff_email(uuid,uuid) to service_role;
create function public.ts_finish_staff_email(p_job uuid,p_lease uuid,p_state text,p_provider text) returns void language plpgsql security definer set search_path='' as $$
declare n integer;receipt text;begin
 if p_state not in ('accepted','unknown','failed') then raise exception 'Invalid email result';end if;
 if p_state='accepted' and (p_provider is null or length(p_provider) not between 1 and 200) then raise exception 'Provider acknowledgment missing';end if;
 select kind into receipt from treestand_staff.email_events where provider_id=p_provider order by case kind when 'complained' then 3 when 'bounced' then 2 else 1 end desc limit 1;
 update treestand_staff.email_jobs set state=case when p_state='accepted' then coalesce(receipt,p_state) else p_state end,provider_id=p_provider,updated_at=clock_timestamp() where id=p_job and lease=p_lease and state='sending';get diagnostics n=row_count;if n<>1 then raise exception 'Email lease changed';end if;
 if receipt in ('bounced','complained') then insert into treestand_staff.email_suppressions(recipient) select recipient from treestand_staff.email_jobs where id=p_job on conflict do nothing;end if;
end $$;
revoke all on function public.ts_finish_staff_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ts_finish_staff_email(uuid,uuid,text,text) to service_role;
create function public.ts_staff_email_event(p_event text,p_provider text,p_kind text) returns void language plpgsql security definer set search_path='' as $$begin
 if length(p_event) not between 1 and 200 or length(p_provider) not between 1 and 200 or p_kind not in ('delivered','bounced','complained') then raise exception 'Invalid receipt';end if;
 insert into treestand_staff.email_events(event_id,provider_id,kind) values(p_event,p_provider,p_kind) on conflict do nothing;
 update treestand_staff.email_jobs set state=case when state='complained' or p_kind='complained' then 'complained' when state='bounced' or p_kind='bounced' then 'bounced' else 'delivered' end,updated_at=clock_timestamp() where provider_id=p_provider;
 if p_kind in ('bounced','complained') then insert into treestand_staff.email_suppressions(recipient) select recipient from treestand_staff.email_jobs where provider_id=p_provider on conflict do nothing;end if;
end $$;
revoke all on function public.ts_staff_email_event(text,text,text) from public,anon,authenticated;
grant execute on function public.ts_staff_email_event(text,text,text) to service_role;
