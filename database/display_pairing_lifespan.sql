-- New pairing codes last 30 minutes; existing expiry timestamps are unchanged.
alter policy ts_device_pair_expiry on public.ts_display_devices
 with check(pairing_expires_at is null or (pairing_expires_at>now() and pairing_expires_at<=now()+interval '30 minutes'));
