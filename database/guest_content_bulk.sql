-- One transaction; existing RLS and the authorized pilot MFA exception remain in force.
create function public.ts_apply_guest_content(p_source uuid,p_expected_source jsonb,p_targets jsonb,p_fields text[],p_mode text,p_allow_empty boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 uid uuid=auth.uid();source_row public.ts_guest_displays;dest public.ts_guest_displays;next_row public.ts_guest_displays;
 fields text[]=array['title','welcome','guidebook','recommendations','contact','house_rules','slideshow_seconds','music_enabled','music_default','music_volume','personalize'];
 text_fields text[]=array['title','welcome','guidebook','recommendations','contact','house_rules'];
 ids uuid[];locked uuid;snapshot jsonb;source_snapshot jsonb;next_snapshot jsonb;t jsonb;k text;changed integer=0;unchanged integer=0;n integer;
begin
 if uid is null or (coalesce(auth.jwt()->>'aal','')<>'aal2' and uid<>'3f03551d-89de-4214-aa7a-db7a86fe1735'::uuid) then raise exception 'Host authentication required';end if;
 if p_source is null or coalesce(jsonb_typeof(p_expected_source),'')<>'object' or coalesce(jsonb_typeof(p_targets),'')<>'array' then raise exception 'Invalid source or destination preview';end if;
 if jsonb_array_length(p_targets) not between 1 and 100 or coalesce(cardinality(p_fields),0) not between 1 and 11 or p_mode is null or p_mode not in ('replace','empty') or p_allow_empty is null then raise exception 'Choose 1–100 listings and valid fields/mode';end if;
 if not p_fields<@fields or array_position(p_fields,null) is not null or cardinality(p_fields)<>(select count(distinct f) from unnest(p_fields) f) then raise exception 'Invalid or repeated fields';end if;
 if p_mode='empty' and not p_fields<@text_fields then raise exception 'Fill empty fields supports text only';end if;
 for t in select value from jsonb_array_elements(p_targets) loop
  if jsonb_typeof(t)<>'object' or (select count(*) from jsonb_object_keys(t))<>2 or not (t ?& array['id','expected']) or jsonb_typeof(t->'id')<>'string' or jsonb_typeof(t->'expected') not in ('object','null') then raise exception 'Invalid destination preview';end if;
 end loop;
 select array_agg((value->>'id')::uuid order by (value->>'id')::uuid) into ids from jsonb_array_elements(p_targets);
 if p_source=any(ids) or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Choose different destination listings without duplicates';end if;
 -- Stable parent lock order serializes overlapping bulk copies, including reciprocal copies.
 n=0;for locked in select id from public.ts_properties where owner_id=uid and (id=p_source or id=any(ids)) order by id for update loop n=n+1;end loop;
 if n<>cardinality(ids)+1 then raise exception 'Every listing must be owned and available';end if;
 select * into source_row from public.ts_guest_displays where owner_id=uid and property_id=p_source for share;
 if source_row.id is null then raise exception 'Save source display settings first';end if;
 select jsonb_object_agg(f,to_jsonb(source_row)->f) into source_snapshot from unnest(fields) f;
 if source_snapshot is distinct from p_expected_source then raise exception 'Source content changed. Refresh and preview again';end if;
 foreach k in array p_fields loop
  if k=any(text_fields) and not p_allow_empty and regexp_replace(source_snapshot->>k,'[[:space:]]','','g')='' then raise exception 'Selected source text is blank; explicitly allow clearing or unselect it';end if;
 end loop;
 for t in select value from jsonb_array_elements(p_targets) order by (value->>'id')::uuid loop
  select * into dest from public.ts_guest_displays where owner_id=uid and property_id=(t->>'id')::uuid for update;
  if dest.id is null then
   if t->'expected'<>'null'::jsonb then raise exception 'Destination changed. Refresh and preview again';end if;
   insert into public.ts_guest_displays(owner_id,property_id) values(uid,(t->>'id')::uuid) returning * into dest;
   changed=changed+1;
  else
   select jsonb_object_agg(f,to_jsonb(dest)->f) into snapshot from unnest(fields) f;
   if snapshot is distinct from t->'expected' then raise exception 'Destination changed. Refresh and preview again';end if;
  end if;
  select jsonb_object_agg(f,to_jsonb(dest)->f) into snapshot from unnest(fields) f;next_snapshot=snapshot;
  foreach k in array p_fields loop
   if p_mode='replace' or snapshot->>k='' then next_snapshot=jsonb_set(next_snapshot,array[k],source_snapshot->k);end if;
  end loop;
  if next_snapshot<>snapshot then
   next_row=jsonb_populate_record(dest,next_snapshot);
   update public.ts_guest_displays set title=next_row.title,welcome=next_row.welcome,guidebook=next_row.guidebook,recommendations=next_row.recommendations,contact=next_row.contact,house_rules=next_row.house_rules,slideshow_seconds=next_row.slideshow_seconds,music_enabled=next_row.music_enabled,music_default=next_row.music_default,music_volume=next_row.music_volume,personalize=next_row.personalize where id=dest.id and owner_id=uid;
   if t->'expected'<>'null'::jsonb then changed=changed+1;end if;
  elsif t->'expected'<>'null'::jsonb then unchanged=unchanged+1;
  end if;
 end loop;
 return jsonb_build_object('changed',changed,'unchanged',unchanged);
end $$;
revoke all on function public.ts_apply_guest_content(uuid,jsonb,jsonb,text[],text,boolean) from public,anon,authenticated;
grant execute on function public.ts_apply_guest_content(uuid,jsonb,jsonb,text[],text,boolean) to authenticated;
