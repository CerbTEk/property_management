alter table public.ts_display_devices
 add column pairing_hash text unique check(pairing_hash ~ '^[0-9a-f]{64}$'),
 add column pairing_expires_at timestamptz,
 add constraint ts_pairing_fields check((pairing_hash is null)=(pairing_expires_at is null));
create policy ts_device_pair_expiry on public.ts_display_devices as restrictive for insert to authenticated
 with check(pairing_expires_at is null or (pairing_expires_at>now() and pairing_expires_at<=now()+interval '10 minutes'));
