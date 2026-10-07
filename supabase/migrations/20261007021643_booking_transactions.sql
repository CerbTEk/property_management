-- Manual evidence ledger only. Clients cannot claim provider verification or move money.
create table public.ts_booking_transactions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),booking_id uuid not null references public.ts_reservations(id),
 sequence integer not null check(sequence>0),request_id uuid not null,
 kind text not null check(kind in ('payment','refund','reversal')),amount_cents bigint not null check(amount_cents between 1 and 1000000000),
 related_id uuid references public.ts_booking_transactions(id),currency text not null default 'USD' check(currency='USD'),
 method text not null check(method in ('channel','bank','cash','other')),occurred_on date not null,
 reference text not null check(length(trim(reference)) between 1 and 160),note text not null check(length(trim(note)) between 1 and 1000),
 evidence text not null default 'host_recorded' check(evidence='host_recorded'),created_at timestamptz not null default clock_timestamp(),
 unique(booking_id,sequence),unique(owner_id,request_id),check((kind='payment' and related_id is null) or (kind<>'payment' and related_id is not null))
);
create index ts_booking_transactions_owner on public.ts_booking_transactions(owner_id,created_at,id);
create index ts_booking_transactions_related on public.ts_booking_transactions(related_id);
create unique index ts_booking_transactions_reference on public.ts_booking_transactions(owner_id,booking_id,kind,lower(trim(reference)));
create unique index ts_booking_transactions_single_reversal on public.ts_booking_transactions(related_id) where kind='reversal';
alter table public.ts_booking_transactions enable row level security;
revoke all on public.ts_booking_transactions from public,anon,authenticated;
grant select,insert on public.ts_booking_transactions to authenticated;
grant all on public.ts_booking_transactions to service_role;
create policy ts_booking_transactions_read on public.ts_booking_transactions for select to authenticated using((select auth.uid())=owner_id);
create policy ts_booking_transactions_insert on public.ts_booking_transactions for insert to authenticated with check((select auth.uid())=owner_id);
create policy ts_host_mfa on public.ts_booking_transactions as restrictive to authenticated using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
create function public.ts_transaction_validation() returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.ts_reservations;target public.ts_booking_transactions;latest integer;refunded bigint;
begin
 if tg_op<>'INSERT' then raise exception 'Transaction history is immutable. Record a reversal';end if;
 if not coalesce(auth.jwt()->>'aal'='aal2' or auth.uid()='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid,false) then raise exception 'Authenticator required';end if;
 if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'Booking unavailable';end if;
 select * into b from public.ts_reservations where id=new.booking_id and owner_id=auth.uid() for update;
 if b.id is null or b.kind='block' then raise exception 'Booking unavailable';end if;
 select coalesce(max(sequence),0) into latest from public.ts_booking_transactions where booking_id=b.id;
 if new.sequence<>latest+1 then raise exception 'Transactions changed. Refresh before saving';end if;
 if new.occurred_on>(clock_timestamp() at time zone 'UTC')::date then raise exception 'Record completed transactions, not future payments';end if;
 if new.kind='payment' then
  if b.status<>'confirmed' then raise exception 'New payments require a confirmed booking';end if;
 elsif new.kind in ('refund','reversal') then
  select * into target from public.ts_booking_transactions where id=new.related_id and booking_id=b.id and owner_id=auth.uid();
  if target.id is null or target.kind='reversal' or exists(select 1 from public.ts_booking_transactions where related_id=target.id and kind='reversal') then raise exception 'Choose an active transaction in this booking';end if;
  if new.kind='refund' then
   if target.kind<>'payment' then raise exception 'A refund must reference a payment';end if;
   select coalesce(sum(t.amount_cents),0) into refunded from public.ts_booking_transactions t where t.related_id=target.id and t.kind='refund' and not exists(select 1 from public.ts_booking_transactions r where r.kind='reversal' and r.related_id=t.id);
   if new.amount_cents+refunded>target.amount_cents then raise exception 'Refund exceeds the remaining recorded payment';end if;
  else
   if new.amount_cents<>target.amount_cents then raise exception 'A correction reverses the entire record';end if;
   if target.kind='payment' and exists(select 1 from public.ts_booking_transactions t where t.related_id=target.id and t.kind='refund' and not exists(select 1 from public.ts_booking_transactions r where r.kind='reversal' and r.related_id=t.id)) then raise exception 'Reverse active refund records before correcting their payment';end if;
  end if;
 else raise exception 'Choose a valid transaction type';end if;
 new.reference=trim(new.reference);new.note=trim(new.note);new.created_at=clock_timestamp();return new;
end $$;
revoke all on function public.ts_transaction_validation() from public,anon,authenticated;
create trigger ts_transaction_validation before insert or update or delete on public.ts_booking_transactions for each row execute function public.ts_transaction_validation();
create function public.ts_record_booking_transaction(p_booking uuid,p_expected integer,p_request uuid,p_kind text,p_amount bigint,p_related uuid,p_method text,p_date date,p_reference text,p_note text) returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid;prior public.ts_booking_transactions;
begin
 if auth.uid() is null or not coalesce(auth.jwt()->>'aal'='aal2' or auth.uid()='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid,false) then raise exception 'Authenticator required';end if;
 perform 1 from public.ts_reservations where id=p_booking and owner_id=auth.uid() for update;if not found then raise exception 'Booking unavailable';end if;
 select * into prior from public.ts_booking_transactions where owner_id=auth.uid() and request_id=p_request;
 if found then
  if prior.booking_id=p_booking and prior.kind=p_kind and prior.amount_cents=p_amount and prior.related_id is not distinct from p_related and prior.method=p_method and prior.occurred_on=p_date and prior.reference=trim(p_reference) and prior.note=trim(p_note) then return prior.id;end if;
  raise exception 'Request already used for another transaction';
 end if;
 if p_expected is null or p_expected<0 then raise exception 'Refresh transaction history';end if;
 insert into public.ts_booking_transactions(owner_id,booking_id,sequence,request_id,kind,amount_cents,related_id,method,occurred_on,reference,note)
 values(auth.uid(),p_booking,p_expected+1,p_request,p_kind,p_amount,p_related,p_method,p_date,p_reference,p_note) returning id into result;
 return result;
end $$;
revoke all on function public.ts_record_booking_transaction(uuid,integer,uuid,text,bigint,uuid,text,date,text,text) from public,anon;
grant execute on function public.ts_record_booking_transaction(uuid,integer,uuid,text,bigint,uuid,text,date,text,text) to authenticated;
