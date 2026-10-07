alter table public.ts_message_templates add column archived boolean not null default false;
alter table public.ts_message_templates add column updated_at timestamptz not null default clock_timestamp();
create function public.ts_message_template_stamp() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.owner_id<>old.owner_id then raise exception 'Template ownership cannot change';end if;
 new.updated_at=clock_timestamp();return new;end $$;
revoke all on function public.ts_message_template_stamp() from public,anon,authenticated;
create trigger ts_message_template_stamp before update on public.ts_message_templates for each row execute function public.ts_message_template_stamp();
create table public.ts_message_rules (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),property_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 120),body text not null check(length(body) between 1 and 4000),
 event text not null check(event in ('confirmation','check_in','check_out')),
 offset_minutes integer not null default 0 check(offset_minutes between -10080 and 10080),enabled boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp(),
 unique(id,owner_id),foreign key(property_id,owner_id) references public.ts_properties(id,owner_id)
);
create index ts_message_rules_property on public.ts_message_rules(property_id,owner_id);
create index ts_message_rules_owner on public.ts_message_rules(owner_id);
create table public.ts_message_queue (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),booking_id uuid not null,rule_id uuid not null,
 due_at timestamptz,body text not null,state text not null check(state in ('planned','suppressed','dismissed','needs_review')),
 reason text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp(),
 unique(booking_id,rule_id),foreign key(booking_id,owner_id) references public.ts_reservations(id,owner_id),foreign key(rule_id,owner_id) references public.ts_message_rules(id,owner_id)
);
create index ts_message_queue_owner_due on public.ts_message_queue(owner_id,due_at);
create index ts_message_queue_booking on public.ts_message_queue(booking_id,owner_id);
create index ts_message_queue_rule on public.ts_message_queue(rule_id,owner_id);
alter table public.ts_message_rules enable row level security;
alter table public.ts_message_queue enable row level security;
revoke all on public.ts_message_rules,public.ts_message_queue from public,anon,authenticated;
grant select,insert,update on public.ts_message_rules to authenticated;
grant select,update on public.ts_message_queue to authenticated;
grant all on public.ts_message_rules,public.ts_message_queue to service_role;
create policy ts_message_rules_owner on public.ts_message_rules to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_message_queue_owner on public.ts_message_queue to authenticated using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_message_rules as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create policy ts_host_mfa on public.ts_message_queue as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_validate_message_rule() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.property_id<>old.property_id) then raise exception 'Rule ownership and listing cannot change';end if;
 if regexp_replace(new.body,'\{\{(guest|property|arrival|departure|check_in|check_out)\}\}','','g') ~ '\{\{|\}\}' then raise exception 'Use only the supported message variables';end if;
 new.updated_at=clock_timestamp();return new;end $$;
revoke all on function public.ts_validate_message_rule() from public,anon,authenticated;
create trigger ts_message_rule_validation before insert or update on public.ts_message_rules for each row execute function public.ts_validate_message_rule();
-- No callable privileged API: only row triggers reconcile the affected owner's plans.
-- Queue rows are preparation records; this release never sends messages.
create function public.ts_reconcile_message_queue() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.ts_reservations;r public.ts_message_rules;p public.ts_properties;wall timestamp;instant timestamptz;valid boolean;body_text text;s text;why text;
begin
 if auth.uid() is not null and auth.uid()<>new.owner_id then raise exception 'Owner mismatch';end if;
 for b in select * from public.ts_reservations where owner_id=new.owner_id and kind<>'block' and (tg_table_name<>'ts_reservations' or id=new.id) loop
  select * into p from public.ts_properties where id=b.property_id and owner_id=b.owner_id;
  for r in select * from public.ts_message_rules where owner_id=b.owner_id and (property_id=b.property_id or exists(select 1 from public.ts_message_queue q where q.booking_id=b.id and q.rule_id=ts_message_rules.id)) and (tg_table_name<>'ts_message_rules' or id=new.id) loop
   instant=null;valid=true;s='planned';why='Delivery is disabled';
   if b.status<>'confirmed' or not r.enabled or r.property_id<>b.property_id then s='suppressed';why='Booking cancelled, rule paused or listing changed';end if;
   begin
    if r.event='confirmation' then instant=b.created_at;
    else
     wall=case r.event when 'check_in' then b.arrival+p.check_in else b.departure+p.check_out end;
     instant=wall at time zone p.timezone;
     valid=(instant at time zone p.timezone)=wall and not exists(select 1 from unnest(array[-120,-60,-30,30,60,120]) n where ((instant+make_interval(mins=>n)) at time zone p.timezone)=wall);
    end if;
    instant=instant+make_interval(mins=>r.offset_minutes);
   exception when others then valid=false;
   end;
   if not valid and s='planned' then s='needs_review';why='Listing time is invalid or ambiguous at a clock change';instant=null;end if;
   body_text=replace(replace(replace(replace(replace(replace(r.body,'{{guest}}',b.guest),'{{property}}',p.name),'{{arrival}}',b.arrival::text),'{{departure}}',b.departure::text),'{{check_in}}',left(p.check_in::text,5)),'{{check_out}}',left(p.check_out::text,5));
   insert into public.ts_message_queue(owner_id,booking_id,rule_id,due_at,body,state,reason)
   values(b.owner_id,b.id,r.id,instant,body_text,s,why)
   on conflict(booking_id,rule_id) do update set due_at=excluded.due_at,body=excluded.body,state=case when ts_message_queue.state='dismissed' then 'dismissed' else excluded.state end,reason=excluded.reason,updated_at=clock_timestamp();
  end loop;
 end loop;
 return new;
end $$;
revoke all on function public.ts_reconcile_message_queue() from public,anon,authenticated,service_role;
create trigger ts_message_booking_sync after insert or update on public.ts_reservations for each row execute function public.ts_reconcile_message_queue();
create trigger ts_message_rule_sync after insert or update on public.ts_message_rules for each row execute function public.ts_reconcile_message_queue();
create trigger ts_message_property_sync after update on public.ts_properties for each row execute function public.ts_reconcile_message_queue();
create function public.ts_message_queue_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if pg_trigger_depth()=1 and (new.state<>'dismissed' or (to_jsonb(new)-'state'-'updated_at') is distinct from (to_jsonb(old)-'state'-'updated_at')) then raise exception 'Hosts can only dismiss planned messages';end if;
 new.updated_at=clock_timestamp();return new;end $$;
revoke all on function public.ts_message_queue_guard() from public,anon,authenticated;
create trigger ts_message_queue_guard before update on public.ts_message_queue for each row execute function public.ts_message_queue_guard();
