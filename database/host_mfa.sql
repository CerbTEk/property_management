-- Restrictive policies combine with ownership policies, never replace them.
-- Authenticated host reads AND writes require a Supabase-verified MFA session.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ts_properties','ts_reservations','ts_rates','ts_message_templates','ts_guest_displays','ts_display_devices'] LOOP
  EXECUTE format('create policy ts_host_mfa on public.%I as restrictive for all to authenticated using ((select auth.jwt()->>''aal'') = ''aal2'') with check ((select auth.jwt()->>''aal'') = ''aal2'')',t);
 END LOOP;
END $$;
