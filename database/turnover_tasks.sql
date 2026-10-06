-- Host-owned operations. Completion records work, never guest departure or lock state.
alter table public.ts_reservations add constraint ts_reservations_id_owner_unique unique(id,owner_id);
create table public.ts_operations_tasks (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 property_id uuid not null,
 booking_id uuid,
 kind text not null check(kind in ('cleaning','inspection','maintenance')),
 title text not null check(length(trim(title)) between 1 and 120),
 due_day date not null,
 status text not null default 'open' check(status in ('open','in_progress','done','dismissed')),
 note text not null default '' check(length(note)<=2000),
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 foreign key(booking_id,owner_id) references public.ts_reservations(id,owner_id)
);
create index ts_operations_owner_due on public.ts_operations_tasks(owner_id,due_day);
create index ts_operations_property on public.ts_operations_tasks(property_id,owner_id);
create unique index ts_operations_booking_kind on public.ts_operations_tasks(booking_id,kind) where booking_id is not null;
alter table public.ts_operations_tasks enable row level security;
revoke all on public.ts_operations_tasks from public,anon,authenticated;
grant select,insert,update on public.ts_operations_tasks to authenticated;
grant all on public.ts_operations_tasks to service_role;
create policy ts_operations_owner on public.ts_operations_tasks to authenticated
 using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_operations_tasks as restrictive for all to authenticated
 using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);

create function public.ts_validate_operations_task() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare b public.ts_reservations;
begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.booking_id is distinct from old.booking_id or new.kind<>old.kind) then
  raise exception 'Task ownership, booking and type cannot be changed';
 end if;
 if new.booking_id is not null then
  select * into b from public.ts_reservations where id=new.booking_id and owner_id=new.owner_id for share;
  if b.id is null or b.kind='block' then raise exception 'Choose an owned guest booking'; end if;
  if tg_op='INSERT' and b.status<>'confirmed' then raise exception 'Choose a confirmed booking'; end if;
  -- Historical completed/dismissed records keep their original listing and due day.
  if new.status in ('open','in_progress') then new.property_id=b.property_id;new.due_day=b.departure; end if;
 end if;
 if new.status='done' then
  if tg_op='UPDATE' and old.status='done' then new.completed_at=old.completed_at;
  else new.completed_at=clock_timestamp(); end if;
 else new.completed_at=null; end if;
 new.updated_at=clock_timestamp();
 return new;
end $$;
revoke all on function public.ts_validate_operations_task() from public,anon,authenticated;
create trigger ts_operations_validation before insert or update on public.ts_operations_tasks
 for each row execute function public.ts_validate_operations_task();

create function public.ts_sync_checkout_tasks() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.departure is distinct from old.departure or new.property_id is distinct from old.property_id then
  update public.ts_operations_tasks set property_id=new.property_id,due_day=new.departure
   where booking_id=new.id and owner_id=new.owner_id and status in ('open','in_progress');
 end if;
 return new;
end $$;
revoke all on function public.ts_sync_checkout_tasks() from public,anon,authenticated;
create trigger ts_checkout_task_sync after update on public.ts_reservations
 for each row execute function public.ts_sync_checkout_tasks();

create function public.ts_prepare_checkout_tasks(p_booking uuid) returns integer
 language plpgsql security invoker set search_path='' as $$
declare b public.ts_reservations;n integer;
begin
 select * into b from public.ts_reservations where id=p_booking and owner_id=(select auth.uid()) for update;
 if b.id is null or b.status<>'confirmed' or b.kind='block' then raise exception 'Choose an owned confirmed guest booking'; end if;
 insert into public.ts_operations_tasks(owner_id,property_id,booking_id,kind,title,due_day)
 values(b.owner_id,b.property_id,b.id,'cleaning','Clean and reset the property',b.departure),
       (b.owner_id,b.property_id,b.id,'inspection','Inspect the property after checkout',b.departure)
 on conflict(booking_id,kind) where booking_id is not null do nothing;
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.ts_prepare_checkout_tasks(uuid) from public,anon,authenticated;
grant execute on function public.ts_prepare_checkout_tasks(uuid) to authenticated;
