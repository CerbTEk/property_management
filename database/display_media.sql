alter table public.ts_guest_displays
 add column house_rules text not null default '' check(length(house_rules)<=10000),
 add column slideshow_seconds integer not null default 20 check(slideshow_seconds in (10,20,30,60));
create table public.ts_display_images (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 property_id uuid not null, object_path text not null unique,
 caption text not null default '' check(length(caption)<=160),
 position integer not null check(position between 0 and 11),
 created_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 unique(property_id,position),
 check(object_path ~ ('^' || property_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create index on public.ts_display_images(owner_id);
alter table public.ts_display_images enable row level security;
revoke all on public.ts_display_images from anon,authenticated;
grant select,insert,update,delete on public.ts_display_images to authenticated;
grant all on public.ts_display_images to service_role;
create policy ts_display_images_owner on public.ts_display_images to authenticated
 using((select auth.uid())=owner_id) with check((select auth.uid())=owner_id);
create policy ts_display_images_mfa on public.ts_display_images as restrictive to authenticated
 using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735')
 with check((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('treestand-display-images','treestand-display-images',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy ts_display_photo_read on storage.objects for select to authenticated using(
 bucket_id='treestand-display-images' and exists(select 1 from public.ts_properties p where p.id::text=(storage.foldername(storage.objects.name))[1] and p.owner_id=(select auth.uid()))
 and ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'));
create policy ts_display_photo_upload on storage.objects for insert to authenticated with check(
 bucket_id='treestand-display-images' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
 and exists(select 1 from public.ts_properties p where p.id::text=(storage.foldername(storage.objects.name))[1] and p.owner_id=(select auth.uid()))
 and ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'));
create policy ts_display_photo_delete on storage.objects for delete to authenticated using(
 bucket_id='treestand-display-images' and exists(select 1 from public.ts_properties p where p.id::text=(storage.foldername(storage.objects.name))[1] and p.owner_id=(select auth.uid()))
 and ((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735'));
