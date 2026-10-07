-- Dedicated random scheduler bearer stays in Vault. Only its digest is visible
-- to the Edge Function; no service-role credential is stored in a cron command.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$
declare token text;
begin
 if not exists(select 1 from vault.secrets where name='treestand_access_runner_token') then
  token:=encode(extensions.gen_random_bytes(32),'hex');
  perform vault.create_secret(token,'treestand_access_runner_token','Internal Treestand access scheduler');
 else
  select decrypted_secret into token from vault.decrypted_secrets where name='treestand_access_runner_token';
 end if;
 insert into public.ts_access_runner_config(id,token_hash) values(true,encode(extensions.digest(token,'sha256'),'hex'))
 on conflict(id) do update set token_hash=excluded.token_hash;
end $$;
select cron.schedule('treestand-access-lifecycle','* * * * *',$job$
 select net.http_post(
  url:='https://pjeejfntvtbqbsuxcwds.supabase.co/functions/v1/treestand-access-runner',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
   (select decrypted_secret from vault.decrypted_secrets where name='treestand_access_runner_token')),
  body:='{}'::jsonb,timeout_milliseconds:=10000
 );
$job$);
-- With no activated devices the worker only completes planning claims; it never
-- contacts a host's lock provider or changes a code. Test activation is separate.
