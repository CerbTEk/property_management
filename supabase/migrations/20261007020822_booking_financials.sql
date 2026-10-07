-- Immutable, host-confirmed USD booking charge revisions. No payments or tax remittance.
create table public.ts_booking_financials (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
 reservation_id uuid not null references public.ts_reservations(id),revision integer not null check(revision>0),
 property_id uuid not null,arrival date not null,departure date not null,guests integer not null,
 currency text not null default 'USD' check(currency='USD'),
 accommodation_cents bigint not null check(accommodation_cents between 0 and 1000000000),
 discount_cents bigint not null default 0 check(discount_cents between 0 and accommodation_cents),
 cleaning_cents bigint not null default 0 check(cleaning_cents between 0 and 1000000000),
 extra_guest_cents bigint not null default 0 check(extra_guest_cents between 0 and 1000000000),
 other_fee_cents bigint not null default 0 check(other_fee_cents between 0 and 1000000000),
 tax_cents bigint not null default 0 check(tax_cents between 0 and 1000000000),
 channel_fee_cents bigint not null default 0 check(channel_fee_cents between 0 and 1000000000),
 total_cents bigint generated always as (accommodation_cents-discount_cents+cleaning_cents+extra_guest_cents+other_fee_cents+tax_cents) stored,
 note text not null default '' check(length(trim(note)) between 1 and 1000),created_at timestamptz not null default clock_timestamp(),
 unique(reservation_id,revision),foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 check(departure>arrival),check(channel_fee_cents<=accommodation_cents-discount_cents+cleaning_cents+extra_guest_cents+other_fee_cents+tax_cents)
);
create index ts_booking_financials_owner on public.ts_booking_financials(owner_id,created_at,id);
create index ts_booking_financials_property_owner on public.ts_booking_financials(property_id,owner_id);
alter table public.ts_booking_financials enable row level security;
revoke all on public.ts_booking_financials from public,anon,authenticated;
grant select,insert on public.ts_booking_financials to authenticated;
grant all on public.ts_booking_financials to service_role;
create policy ts_booking_financials_read on public.ts_booking_financials for select to authenticated using((select auth.uid())=owner_id);
create policy ts_booking_financials_insert on public.ts_booking_financials for insert to authenticated with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_booking_financials as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_financial_revision_validation() returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.ts_reservations;latest integer;
begin
 if tg_op<>'INSERT' then raise exception 'Financial history is immutable';end if;
 if not coalesce(auth.jwt()->>'aal'='aal2' or auth.uid()='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid,false) then raise exception 'Authenticator required';end if;
 if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'Booking unavailable';end if;
 select * into b from public.ts_reservations where id=new.reservation_id and owner_id=auth.uid() for update;
 if b.id is null or b.kind='block' or b.status<>'confirmed' then raise exception 'Choose a confirmed booking';end if;
 if new.property_id<>b.property_id or new.arrival<>b.arrival or new.departure<>b.departure or new.guests<>b.guests then raise exception 'Booking changed. Refresh before saving its amounts';end if;
 select coalesce(max(revision),0) into latest from public.ts_booking_financials where reservation_id=b.id;
 if new.revision<>latest+1 then raise exception 'Amounts changed. Refresh before saving';end if;
 new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_financial_revision_validation() from public,anon,authenticated;
create trigger ts_financial_revision_validation before insert or update or delete on public.ts_booking_financials for each row execute function public.ts_financial_revision_validation();
create function public.ts_save_booking_financials(p_booking uuid,p_expected integer,p_property uuid,p_arrival date,p_departure date,p_guests integer,p_amounts jsonb,p_note text default '') returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if jsonb_typeof(p_amounts)<>'object' or p_amounts is null or p_expected is null or p_expected<0 then raise exception 'Enter valid booking amounts';end if;
 if (select count(*) from jsonb_object_keys(p_amounts))<>7 or not p_amounts ?& array['accommodation_cents','discount_cents','cleaning_cents','extra_guest_cents','other_fee_cents','tax_cents','channel_fee_cents'] then raise exception 'Enter every booking amount';end if;
 if exists(select 1 from jsonb_each(p_amounts) where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]+$') then raise exception 'Amounts must be whole non-negative cents';end if;
 insert into public.ts_booking_financials(owner_id,reservation_id,revision,property_id,arrival,departure,guests,accommodation_cents,discount_cents,cleaning_cents,extra_guest_cents,other_fee_cents,tax_cents,channel_fee_cents,note)
 values(auth.uid(),p_booking,p_expected+1,p_property,p_arrival,p_departure,p_guests,(p_amounts->>'accommodation_cents')::bigint,(p_amounts->>'discount_cents')::bigint,(p_amounts->>'cleaning_cents')::bigint,(p_amounts->>'extra_guest_cents')::bigint,(p_amounts->>'other_fee_cents')::bigint,(p_amounts->>'tax_cents')::bigint,(p_amounts->>'channel_fee_cents')::bigint,coalesce(p_note,'')) returning id into result;
 return result;
end $$;
revoke all on function public.ts_save_booking_financials(uuid,integer,uuid,date,date,integer,jsonb,text) from public,anon;
grant execute on function public.ts_save_booking_financials(uuid,integer,uuid,date,date,integer,jsonb,text) to authenticated;
