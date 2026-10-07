-- pg_net is not relocatable. Recreate this new scheduler-only extension in the
-- extensions namespace; no application tables or host data are affected.
drop extension pg_net;
create extension pg_net with schema extensions;

do $$
begin
 if not exists(select 1 from vault.secrets where name='treestand_access_fingerprint_key') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'treestand_access_fingerprint_key','Stable server-only access code fingerprint key');
 end if;
end $$;
-- The privileged implementation is private and limited to this one secret.
create function treestand_private.ts_access_fingerprint_key() returns text
language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='treestand_access_fingerprint_key';
$$;
revoke all on function treestand_private.ts_access_fingerprint_key() from public,anon,authenticated;
grant execute on function treestand_private.ts_access_fingerprint_key() to service_role;
create function public.ts_access_fingerprint_key() returns text
language sql security invoker set search_path='' as $$
 select treestand_private.ts_access_fingerprint_key();
$$;
revoke all on function public.ts_access_fingerprint_key() from public,anon,authenticated;
grant execute on function public.ts_access_fingerprint_key() to service_role;
