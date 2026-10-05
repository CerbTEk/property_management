-- Restrictive policies combine with ownership policies, never replace them.
-- Host reads/writes require verified MFA, except the explicitly authorized pilot owner.
-- Existing ownership policies still apply to every row.
-- Resolve the pilot exception before claiming Airbnb MFA compliance.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ts_properties','ts_reservations','ts_rates','ts_message_templates','ts_guest_displays','ts_display_devices'] LOOP
  EXECUTE format('create policy ts_host_mfa on public.%I as restrictive for all to authenticated using ((select auth.jwt()->>''aal'') = ''aal2'' or (select auth.uid()) = ''3f03551d-89de-4214-aa7a-db7a86fe1735''::uuid) with check ((select auth.jwt()->>''aal'') = ''aal2'' or (select auth.uid()) = ''3f03551d-89de-4214-aa7a-db7a86fe1735''::uuid)',t);
 END LOOP;
END $$;
