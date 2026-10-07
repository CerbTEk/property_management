-- Reusable property checklists. Task snapshots keep labels and completion history.
create table public.ts_turnover_templates (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 property_id uuid not null,kind text not null check(kind in ('cleaning','inspection')),
 items jsonb not null default '[]',created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),unique(property_id,kind)
);
create index ts_turnover_templates_owner on public.ts_turnover_templates(owner_id);
alter table public.ts_turnover_templates enable row level security;
revoke all on public.ts_turnover_templates from public,anon,authenticated;
grant select,insert,update on public.ts_turnover_templates to authenticated;
grant all on public.ts_turnover_templates to service_role;
create policy ts_turnover_owner on public.ts_turnover_templates to authenticated
 using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_turnover_templates as restrictive to authenticated
 using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_validate_turnover_template() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb;
begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.property_id<>old.property_id or new.kind<>old.kind) then raise exception 'Checklist ownership, listing and type cannot change';end if;
 if jsonb_typeof(new.items)<>'array' or jsonb_array_length(new.items)>30 then raise exception 'Use up to 30 checklist items';end if;
 for item in select value from jsonb_array_elements(new.items) loop
  if jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 1 and 160 then raise exception 'Checklist items must contain 1 to 160 characters';end if;
 end loop;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_validate_turnover_template() from public,anon,authenticated;
create trigger ts_turnover_template_validation before insert or update on public.ts_turnover_templates for each row execute function public.ts_validate_turnover_template();
alter table public.ts_operations_tasks add column checklist jsonb not null default '[]';
create function public.ts_task_checklist() returns trigger language plpgsql security invoker set search_path='' as $$
declare labels jsonb;item jsonb;i integer;
begin
 if tg_op='INSERT' then
  select items into labels from public.ts_turnover_templates where owner_id=new.owner_id and property_id=new.property_id and kind=new.kind;
  if labels is null then
   labels=case new.kind when 'cleaning' then '["Replace linens and towels","Clean bathroom and kitchen","Remove trash and reset supplies"]'::jsonb
   when 'inspection' then '["Inspect for damage","Check lights and essential equipment","Confirm the room is ready"]'::jsonb else '[]'::jsonb end;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('label',value#>>'{}','done',false) order by ord),'[]'::jsonb) into new.checklist from jsonb_array_elements(labels) with ordinality as e(value,ord);
 else
  if jsonb_typeof(new.checklist)<>'array' or jsonb_array_length(new.checklist)<>jsonb_array_length(old.checklist) then raise exception 'Task checklist structure cannot change';end if;
  for i in 0..jsonb_array_length(new.checklist)-1 loop
   item=new.checklist->i;
   if jsonb_typeof(item)<>'object' or item->'label' is distinct from old.checklist->i->'label' or jsonb_typeof(item->'done') is distinct from 'boolean' or item - 'label' - 'done'<>'{}'::jsonb then raise exception 'Only checklist completion can change';end if;
  end loop;
 end if;
 if new.status='done' and exists(select 1 from jsonb_array_elements(new.checklist) e where e->>'done'<>'true') then raise exception 'Complete every checklist item before completing the task';end if;
 return new;
end $$;
revoke all on function public.ts_task_checklist() from public,anon,authenticated;
create trigger ts_task_checklist_validation before insert or update on public.ts_operations_tasks for each row execute function public.ts_task_checklist();
create function public.ts_auto_checkout_tasks() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='confirmed' and new.kind<>'block' then
  insert into public.ts_operations_tasks(owner_id,property_id,booking_id,kind,title,due_day)
  values(new.owner_id,new.property_id,new.id,'cleaning','Clean and reset the property',new.departure),
  (new.owner_id,new.property_id,new.id,'inspection','Inspect the property after checkout',new.departure)
  on conflict(booking_id,kind) where booking_id is not null do nothing;
 end if;
 return new;
end $$;
revoke all on function public.ts_auto_checkout_tasks() from public,anon,authenticated;
create trigger ts_auto_checkout_tasks after insert or update on public.ts_reservations for each row execute function public.ts_auto_checkout_tasks();
-- No backfill: hosts explicitly prepare tasks for existing stays.
