-- Permanent TV credentials; setup codes still expire and remain single-use.
alter table public.ts_display_devices alter column expires_at drop not null;
alter table public.ts_display_devices alter column expires_at set default null;
alter policy ts_device_insert on public.ts_display_devices
 with check ((select auth.uid())=owner_id and expires_at is null);
-- Preserve every token and pairing code; never reactivate a revoked screen.
update public.ts_display_devices set expires_at=null where not revoked;
