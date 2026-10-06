create index ts_operations_booking_owner on public.ts_operations_tasks(booking_id,owner_id);
alter policy ts_host_mfa on public.ts_operations_tasks
 using(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid)
 with check(((select auth.jwt())->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid);
