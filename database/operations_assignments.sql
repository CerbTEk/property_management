-- Assignment records are host-owned roster entries, not login invitations.
create table public.ts_operations_people (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 100),
 role text not null default 'cleaner' check(role in ('cleaner','inspector','maintenance','assistant')),
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp(),unique(id,owner_id)
);
create index ts_operations_people_owner on public.ts_operations_people(owner_id);
create table public.ts_operations_defaults (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid not null,
 kind text not null check(kind in ('cleaning','inspection')),assignee_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp(),unique(property_id,kind),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),foreign key(assignee_id,owner_id) references public.ts_operations_people(id,owner_id)
);
create index ts_operations_defaults_property_owner on public.ts_operations_defaults(property_id,owner_id);
create index ts_operations_defaults_assignee_owner on public.ts_operations_defaults(assignee_id,owner_id);
create index ts_operations_defaults_owner on public.ts_operations_defaults(owner_id);
alter table public.ts_operations_tasks add column assignee_id uuid;
alter table public.ts_operations_tasks add column assignee_name text not null default '';
alter table public.ts_operations_tasks add constraint ts_operations_assignee_owner foreign key(assignee_id,owner_id) references public.ts_operations_people(id,owner_id);
create index ts_operations_tasks_assignee_owner on public.ts_operations_tasks(assignee_id,owner_id);
alter table public.ts_operations_people enable row level security;
alter table public.ts_operations_defaults enable row level security;
revoke all on public.ts_operations_people,public.ts_operations_defaults from public,anon,authenticated;
grant select,insert,update on public.ts_operations_people,public.ts_operations_defaults to authenticated;
grant all on public.ts_operations_people,public.ts_operations_defaults to service_role;
create policy ts_operations_people_owner on public.ts_operations_people to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_operations_defaults_owner on public.ts_operations_defaults to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_operations_people as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create policy ts_host_mfa on public.ts_operations_defaults as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_operations_roster_validation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.owner_id<>old.owner_id then raise exception 'Roster ownership cannot change';end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_operations_roster_validation() from public,anon,authenticated;
create trigger ts_operations_roster_validation before insert or update on public.ts_operations_people for each row execute function public.ts_operations_roster_validation();
create function public.ts_operations_default_validation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.property_id<>old.property_id or new.kind<>old.kind) then raise exception 'Default ownership, listing and type cannot change';end if;
 if new.assignee_id is not null and not exists(select 1 from public.ts_operations_people where id=new.assignee_id and owner_id=new.owner_id and active) then raise exception 'Choose an active person in your roster';end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_operations_default_validation() from public,anon,authenticated;
create trigger ts_operations_default_validation before insert or update on public.ts_operations_defaults for each row execute function public.ts_operations_default_validation();
create function public.ts_operations_assignment_validation() returns trigger language plpgsql security invoker set search_path='' as $$
declare person public.ts_operations_people;changed boolean;
begin
 if tg_op='INSERT' then
  if new.assignee_id is null then
   select d.assignee_id into new.assignee_id from public.ts_operations_defaults d join public.ts_operations_people p on p.id=d.assignee_id and p.owner_id=d.owner_id and p.active where d.property_id=new.property_id and d.owner_id=new.owner_id and d.kind=new.kind;
  end if;
  changed=true;
 else
  changed=new.assignee_id is distinct from old.assignee_id;
  if changed and old.status in ('done','dismissed') then raise exception 'Reopen the task before changing its assignment';end if;
  if not changed then new.assignee_name=old.assignee_name;end if;
 end if;
 if changed then
  if new.assignee_id is null then new.assignee_name='';
  else
   select * into person from public.ts_operations_people where id=new.assignee_id and owner_id=new.owner_id and active for share;
   if person.id is null then raise exception 'Choose an active person in your roster';end if;
   new.assignee_name=person.name;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.ts_operations_assignment_validation() from public,anon,authenticated;
create trigger ts_task_assignment_validation before insert or update on public.ts_operations_tasks for each row execute function public.ts_operations_assignment_validation();
