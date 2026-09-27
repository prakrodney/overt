-- DeCam GPS (Overt) · other drivers on the map (opt-in avatars).
--
-- Privacy rules (the phone does most of this before anything is sent):
--   * off by default; only while driving with the app open
--   * the position sent is ~30 s old and shifted by a fixed random 40–90 m per drive
--   * nothing is sent within ~800 m of where the drive started or of saved Home / Work
--   * one row per account, keyed by account but shown only by a random per-drive id;
--     rows vanish 2 minutes after the last update (no history, no trails)

create table if not exists public.live_drivers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  dot_id     uuid not null,
  avatar     text not null,
  geom       extensions.geometry(Point, 4326) not null,
  heading    smallint,
  updated_at timestamptz not null default now()
);
create index if not exists live_drivers_geom_idx on public.live_drivers using gist (geom);
alter table public.live_drivers enable row level security;
-- No direct access; functions below only.

create or replace function public.update_live_position(
  p_dot_id uuid, p_avatar text, p_lat float8, p_lon float8, p_heading integer)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  g geometry := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
begin
  if p_avatar !~ '^[a-z0-9_]{1,24}$' then raise exception 'Unknown avatar.'; end if;
  if not private.in_us(g) then return; end if;
  insert into public.live_drivers as d (user_id, dot_id, avatar, geom, heading, updated_at)
  values (uid, p_dot_id, p_avatar, g,
          case when p_heading is null then null else ((p_heading % 360 + 360) % 360)::smallint end, now())
  on conflict (user_id) do update
     set dot_id = excluded.dot_id, avatar = excluded.avatar, geom = excluded.geom,
         heading = excluded.heading, updated_at = now()
   -- at most one update every 4 seconds per account
   where d.updated_at < now() - interval '4 seconds' or d.dot_id <> excluded.dot_id;
end;
$$;

create or replace function public.clear_live_position()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.live_drivers where user_id = auth.uid();
$$;

-- Drivers seen in the last 2 minutes inside a small box (street-level views only).
create or replace function public.get_live_drivers(
  min_lon float8, min_lat float8, max_lon float8, max_lat float8, p_exclude uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select case
    when max_lat - min_lat > 0.25 or max_lon - min_lon > 0.3 then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.dot_id, 'avatar', d.avatar,
               'lat', round(ST_Y(d.geom)::numeric, 5), 'lon', round(ST_X(d.geom)::numeric, 5),
               'heading', d.heading))
        from (select * from public.live_drivers
               where updated_at > now() - interval '2 minutes'
                 and geom && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
                 and (p_exclude is null or dot_id <> p_exclude)
               limit 200) d), '[]'::jsonb)
  end;
$$;

revoke all on function public.update_live_position(uuid, text, float8, float8, integer) from public, anon;
grant execute on function public.update_live_position(uuid, text, float8, float8, integer) to authenticated;
revoke all on function public.clear_live_position() from public, anon;
grant execute on function public.clear_live_position() to authenticated;
revoke all on function public.get_live_drivers(float8, float8, float8, float8, uuid) from public;
grant execute on function public.get_live_drivers(float8, float8, float8, float8, uuid) to anon, authenticated;

-- Forget stale positions every minute.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'live-drivers-cleanup' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('live-drivers-cleanup', '* * * * *',
    $c$delete from public.live_drivers where updated_at < now() - interval '2 minutes'$c$);
end;
$$;
