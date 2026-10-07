create schema if not exists treestand_staff;
revoke all on schema treestand_staff from public,anon,authenticated;
create table public.ts_staff_invites (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),person_id uuid not null,
 email text not null check(length(email)<=254 and email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 state text not null default 'pending' check(state in ('pending','accepted','revoked')),
 expires_at timestamptz not null default now()+interval '7 days',accepted_user uuid references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp(),
 unique(id,owner_id),foreign key(person_id,owner_id) references public.ts_operations_people(id,owner_id)
);
create index ts_staff_invites_owner on public.ts_staff_invites(owner_id);
create index ts_staff_invites_person on public.ts_staff_invites(person_id,owner_id);
create index ts_staff_invites_email on public.ts_staff_invites(email,state);
create index ts_staff_invites_accepted_user on public.ts_staff_invites(accepted_user);
create unique index ts_staff_invites_pending_person on public.ts_staff_invites(person_id) where state='pending';
alter table public.ts_staff_invites enable row level security;
revoke all on public.ts_staff_invites from public,anon,authenticated;
grant select on public.ts_staff_invites to authenticated;
grant all on public.ts_staff_invites to service_role;
create policy ts_staff_invites_owner on public.ts_staff_invites to authenticated using((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_staff_invites as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create table treestand_staff.memberships (
 person_id uuid primary key,owner_id uuid not null,user_id uuid not null references auth.users(id),invite_id uuid not null,
 active boolean not null default true,created_at timestamptz not null default now(),
 foreign key(person_id,owner_id) references public.ts_operations_people(id,owner_id),foreign key(invite_id,owner_id) references public.ts_staff_invites(id,owner_id)
);
create index ts_staff_membership_user on treestand_staff.memberships(user_id,active);
create index ts_staff_membership_owner on treestand_staff.memberships(owner_id);
create index ts_staff_membership_person_owner on treestand_staff.memberships(person_id,owner_id);
create index ts_staff_membership_invite_owner on treestand_staff.memberships(invite_id,owner_id);
create table treestand_staff.preferences (
 user_id uuid primary key references auth.users(id),in_app boolean not null default true,email_requested boolean not null default false,updated_at timestamptz not null default clock_timestamp()
);
create table treestand_staff.reads (
 user_id uuid not null references auth.users(id),task_id uuid not null references public.ts_operations_tasks(id),revision timestamptz not null,read_at timestamptz not null default now(),primary key(user_id,task_id)
);
create index ts_staff_reads_task on treestand_staff.reads(task_id);
create table treestand_staff.activity (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),owner_id uuid not null references auth.users(id),task_id uuid not null references public.ts_operations_tasks(id),action text not null,created_at timestamptz not null default clock_timestamp()
);
create index ts_staff_activity_user on treestand_staff.activity(user_id);
create index ts_staff_activity_owner on treestand_staff.activity(owner_id);
create index ts_staff_activity_task on treestand_staff.activity(task_id);
alter table treestand_staff.memberships enable row level security;
alter table treestand_staff.preferences enable row level security;
alter table treestand_staff.reads enable row level security;
alter table treestand_staff.activity enable row level security;
revoke all on all tables in schema treestand_staff from public,anon,authenticated;
alter table public.ts_operations_tasks add column worker_note text not null default '' check(length(worker_note)<=2000);

create function treestand_staff.require_identity(p_staff boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid=auth.uid();begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Sign in with a verified email address';end if;
 if auth.jwt()->>'aal'<>'aal2' or auth.jwt()->>'aal' is null then
  if p_staff or u<>'3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid then raise exception 'Authenticator verification is required';end if;
 end if;
 return u;end $$;
revoke all on function treestand_staff.require_identity(boolean) from public,anon,authenticated;
create function public.ts_invite_staff(p_person uuid,p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(false);i uuid;begin
 if not exists(select 1 from public.ts_operations_people where id=p_person and owner_id=u and active) then raise exception 'Choose an active person in your roster';end if;
 if exists(select 1 from treestand_staff.memberships where person_id=p_person and active) then raise exception 'Revoke the existing staff access before inviting again';end if;
 update public.ts_staff_invites set state='revoked',updated_at=clock_timestamp() where person_id=p_person and owner_id=u and state='pending';
 insert into public.ts_staff_invites(owner_id,person_id,email) values(u,p_person,lower(trim(p_email))) returning id into i;return i;end $$;
revoke all on function public.ts_invite_staff(uuid,text) from public,anon,authenticated;
grant execute on function public.ts_invite_staff(uuid,text) to authenticated;
create function public.ts_revoke_staff(p_invite uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(false);begin
 if not exists(select 1 from public.ts_staff_invites where id=p_invite and owner_id=u for update) then raise exception 'Invitation unavailable';end if;
 update public.ts_staff_invites set state='revoked',updated_at=clock_timestamp() where id=p_invite and owner_id=u;
 update treestand_staff.memberships set active=false where invite_id=p_invite and owner_id=u;
end $$;
revoke all on function public.ts_revoke_staff(uuid) from public,anon,authenticated;
grant execute on function public.ts_revoke_staff(uuid) to authenticated;
create function public.ts_staff_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(true);email_address text;invites jsonb;tasks jsonb;prefs jsonb;begin
 select lower(email) into email_address from auth.users where id=u;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'role',p.role,'expires_at',i.expires_at) order by i.created_at),'[]'::jsonb) into invites
 from public.ts_staff_invites i join public.ts_operations_people p on p.id=i.person_id and p.owner_id=i.owner_id and p.active
 where i.email=email_address and i.state='pending' and i.expires_at>now() and i.owner_id<>u;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'kind',t.kind,'property_name',p.name,'timezone',p.timezone,'due_day',t.due_day,'status',t.status,'checklist',t.checklist,'note',t.note,'worker_note',t.worker_note,'updated_at',t.updated_at,'completed_at',t.completed_at,'cancelled',b.status='cancelled','unread',coalesce(r.revision<>t.updated_at,true)) order by t.due_day),'[]'::jsonb) into tasks
 from public.ts_operations_tasks t join treestand_staff.memberships m on m.person_id=t.assignee_id and m.owner_id=t.owner_id and m.user_id=u and m.active
 join public.ts_operations_people people on people.id=m.person_id and people.owner_id=m.owner_id and people.active
 join public.ts_properties p on p.id=t.property_id and p.owner_id=t.owner_id
 left join public.ts_reservations b on b.id=t.booking_id and b.owner_id=t.owner_id
 left join treestand_staff.reads r on r.task_id=t.id and r.user_id=u;
 select jsonb_build_object('in_app',in_app,'email_requested',email_requested) into prefs from treestand_staff.preferences where user_id=u;
 return jsonb_build_object('invitations',invites,'tasks',tasks,'preferences',coalesce(prefs,'{"in_app":true,"email_requested":false}'::jsonb),'email_delivery','setup_required');end $$;
revoke all on function public.ts_staff_workspace() from public,anon,authenticated;
grant execute on function public.ts_staff_workspace() to authenticated;
create function public.ts_accept_staff(p_invite uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(true);email_address text;i public.ts_staff_invites;begin
 select lower(email) into email_address from auth.users where id=u;
 select * into i from public.ts_staff_invites where id=p_invite and email=email_address and state='pending' and expires_at>now() and owner_id<>u for update;
 if i.id is null or not exists(select 1 from public.ts_operations_people where id=i.person_id and owner_id=i.owner_id and active for share) then raise exception 'Invitation unavailable or expired';end if;
 if exists(select 1 from treestand_staff.memberships where person_id=i.person_id and active) then raise exception 'This roster entry already has staff access';end if;
 insert into treestand_staff.memberships(person_id,owner_id,user_id,invite_id) values(i.person_id,i.owner_id,u,i.id)
 on conflict(person_id) do update set user_id=excluded.user_id,invite_id=excluded.invite_id,active=true,created_at=now();
 update public.ts_staff_invites set state='accepted',accepted_user=u,updated_at=clock_timestamp() where id=i.id;
end $$;
revoke all on function public.ts_accept_staff(uuid) from public,anon,authenticated;
grant execute on function public.ts_accept_staff(uuid) to authenticated;
create function public.ts_staff_update_task(p_task uuid,p_expected timestamptz,p_status text,p_checklist jsonb,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(true);t public.ts_operations_tasks;begin
 -- Lock membership/person before task so revocation cannot race an authorized update.
 perform 1 from treestand_staff.memberships m join public.ts_operations_people people on people.id=m.person_id and people.owner_id=m.owner_id
 join public.ts_operations_tasks task on task.assignee_id=m.person_id and task.owner_id=m.owner_id
 where task.id=p_task and m.user_id=u and m.active and people.active for share of m,people;
 if not found then raise exception 'Assigned task unavailable';end if;
 select * into t from public.ts_operations_tasks where id=p_task for update;
 if t.updated_at is distinct from p_expected then raise exception 'Task changed. Refresh before updating';end if;
 if not exists(select 1 from treestand_staff.memberships where person_id=t.assignee_id and owner_id=t.owner_id and user_id=u and active) then raise exception 'Assigned task unavailable';end if;
 if t.status not in ('open','in_progress') or p_status not in ('open','in_progress','done') then raise exception 'Only open work can be updated by staff';end if;
 if exists(select 1 from public.ts_reservations where id=t.booking_id and owner_id=t.owner_id and status='cancelled') then raise exception 'Booking cancelled. Ask the host to review this work';end if;
 update public.ts_operations_tasks set status=p_status,checklist=p_checklist,worker_note=p_note where id=t.id;
 insert into treestand_staff.activity(user_id,owner_id,task_id,action) values(u,t.owner_id,t.id,p_status);
 insert into treestand_staff.reads(user_id,task_id,revision) select u,id,updated_at from public.ts_operations_tasks where id=t.id
 on conflict(user_id,task_id) do update set revision=excluded.revision,read_at=now();
end $$;
revoke all on function public.ts_staff_update_task(uuid,timestamptz,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.ts_staff_update_task(uuid,timestamptz,text,jsonb,text) to authenticated;
create function public.ts_staff_mark_read(p_task uuid,p_expected timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(true);begin
 if not exists(select 1 from public.ts_operations_tasks t join treestand_staff.memberships m on m.person_id=t.assignee_id and m.owner_id=t.owner_id and m.user_id=u and m.active join public.ts_operations_people p on p.id=m.person_id and p.owner_id=m.owner_id and p.active where t.id=p_task and t.updated_at=p_expected) then raise exception 'Assigned task changed or unavailable';end if;
 insert into treestand_staff.reads(user_id,task_id,revision) values(u,p_task,p_expected) on conflict(user_id,task_id) do update set revision=excluded.revision,read_at=now();end $$;
revoke all on function public.ts_staff_mark_read(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.ts_staff_mark_read(uuid,timestamptz) to authenticated;
create function public.ts_staff_preferences(p_in_app boolean,p_email boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid=treestand_staff.require_identity(true);begin
 insert into treestand_staff.preferences(user_id,in_app,email_requested) values(u,p_in_app,p_email) on conflict(user_id) do update set in_app=excluded.in_app,email_requested=excluded.email_requested,updated_at=clock_timestamp();end $$;
revoke all on function public.ts_staff_preferences(boolean,boolean) from public,anon,authenticated;
grant execute on function public.ts_staff_preferences(boolean,boolean) to authenticated;
