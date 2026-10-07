-- Owners may read conversion status; only the authenticated converter publishes videos.
create table public.ts_display_videos (
 property_id uuid primary key, owner_id uuid not null references auth.users(id),
 requested_version bigint not null default 1, ready_version bigint not null default 0,
 state text not null default 'pending' check(state in ('pending','running','ready','failed')),
 object_path text, photo_count integer not null default 0 check(photo_count between 0 and 12),
 lease_id uuid, lease_until timestamptz, attempts integer not null default 0,
 retry_after timestamptz not null default now(), last_error text not null default '',
 updated_at timestamptz not null default now(),
 foreign key(property_id,owner_id) references public.ts_properties(id,owner_id),
 check(object_path is null or object_path ~ ('^'||property_id::text||'/[0-9a-f-]{36}\.mp4$'))
);
create index ts_display_videos_owner on public.ts_display_videos(owner_id);
create index ts_display_videos_pending on public.ts_display_videos(updated_at) where state<>'ready';
alter table public.ts_display_videos enable row level security;
revoke all on public.ts_display_videos from public,anon,authenticated;
grant select on public.ts_display_videos to authenticated;
grant all on public.ts_display_videos to service_role;
create policy ts_display_videos_owner on public.ts_display_videos for select to authenticated
 using((select auth.uid())=owner_id);
create policy ts_display_videos_mfa on public.ts_display_videos as restrictive for select to authenticated
 using((select auth.jwt()->>'aal')='aal2' or (select auth.uid())='3f03551d-89de-4214-aa7a-db7a86fe1735');

create schema if not exists treestand_private;
revoke all on schema treestand_private from public,anon,authenticated;
create table public.ts_display_video_cleanup (
 object_path text primary key check(object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'),
 delete_after timestamptz not null default now()+interval '5 minutes'
);
alter table public.ts_display_video_cleanup enable row level security;
revoke all on public.ts_display_video_cleanup from public,anon,authenticated;
grant all on public.ts_display_video_cleanup to service_role;
create index ts_display_video_cleanup_due on public.ts_display_video_cleanup(delete_after);

create function treestand_private.queue_display_video() returns trigger
language plpgsql security definer set search_path='' as $$
declare p uuid; o uuid; withdraw boolean:=false; prior text;
begin
 if tg_table_name='ts_display_images' then
  if tg_op='DELETE' then p:=old.property_id;o:=old.owner_id;withdraw:=true;
  else p:=new.property_id;o:=new.owner_id;
   if tg_op='UPDATE' and new.object_path=old.object_path and new.position=old.position then return new;end if;
   if tg_op='UPDATE' and (new.property_id<>old.property_id or new.owner_id<>old.owner_id) then
    raise exception 'Move photos by removing and uploading them again';
   end if;
  end if;
 else p:=new.property_id;o:=new.owner_id;
  if tg_op='UPDATE' and new.slideshow_seconds=old.slideshow_seconds then return new;end if;
 end if;
 if auth.uid() is not null and auth.uid()<>o then raise exception 'Photo listing ownership required';end if;
 if withdraw then
  select object_path into prior from public.ts_display_videos where property_id=p and owner_id=o;
  if prior is not null then insert into public.ts_display_video_cleanup(object_path) values(prior) on conflict do nothing;end if;
 end if;
 insert into public.ts_display_videos(property_id,owner_id) values(p,o)
 on conflict(property_id) do update set requested_version=public.ts_display_videos.requested_version+1,
  state='pending',lease_id=null,lease_until=null,attempts=0,retry_after=now(),last_error='',updated_at=now(),
  object_path=case when withdraw then null else public.ts_display_videos.object_path end;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function treestand_private.queue_display_video() from public,anon,authenticated,service_role;
create trigger ts_display_image_video after insert or update or delete on public.ts_display_images
 for each row execute function treestand_private.queue_display_video();
create trigger ts_display_settings_video after insert or update of slideshow_seconds on public.ts_guest_displays
 for each row execute function treestand_private.queue_display_video();
insert into public.ts_display_videos(property_id,owner_id)
 select distinct property_id,owner_id from public.ts_display_images on conflict do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('treestand-display-videos','treestand-display-videos',false,67108864,array['video/mp4']);
-- No client storage policies: videos are supplied only after device authentication.

