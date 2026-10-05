-- Keep availability conflicts atomic in one calendar table.
alter table public.ts_reservations add column kind text not null default 'booking' check(kind in ('booking','block'));
alter table public.ts_reservations drop constraint ts_reservations_status_check;
alter table public.ts_reservations add constraint ts_reservations_status_check check(status in ('confirmed','blocked','cancelled'));
alter table public.ts_reservations add constraint ts_reservations_kind_status_check check((kind='booking' and status in ('confirmed','cancelled')) or (kind='block' and status in ('blocked','cancelled')));
alter table public.ts_reservations add constraint ts_reservations_occupied_excl
 exclude using gist(property_id with =, daterange(arrival,departure,'[)') with &&) where(status in ('confirmed','blocked'));
alter table public.ts_reservations drop constraint ts_reservations_property_id_daterange_excl;
create or replace function public.ts_check_reservation() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.ts_properties;
begin
 if new.status='cancelled' then return new; end if;
 select * into p from public.ts_properties where id=new.property_id and owner_id=new.owner_id;
 if p.id is null then raise exception 'Listing unavailable'; end if;
 if new.kind='block' then return new; end if;
 if new.guests>p.max_guests then raise exception 'Maximum occupancy exceeded'; end if;
 if new.departure-new.arrival<p.min_stay then raise exception 'Minimum stay not met'; end if;
 return new;
end $$;
revoke all on function public.ts_check_reservation() from public,anon,authenticated;
