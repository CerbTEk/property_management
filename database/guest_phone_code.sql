-- Store only the suffix needed by the owner's selected door-code rule.
alter table public.ts_reservations add column guest_phone_last4 text check(guest_phone_last4 ~ '^[0-9]{4}$');
