alter table public.ts_guest_displays
 add column music_enabled boolean not null default true,
 add column music_default text not null default 'woodland' check(music_default in ('woodland','evening','shores')),
 add column music_volume integer not null default 15 check(music_volume between 0 and 40);
