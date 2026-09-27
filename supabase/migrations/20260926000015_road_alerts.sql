-- DeCam GPS (Overt) · live road alerts: police, crashes, objects on the road.
--
-- * Anyone signed in (the app's anonymous account) can report one at their current spot.
--   The server checks the spot is within 300 m of the phone; the phone's location itself
--   is not stored.
-- * An alert lasts 1 hour. "Still there" from someone else resets the hour; two
--   "Not there" votes (or the reporter's own) remove it early.
-- * The same kind of alert reported within 150 m of an active one just extends it.
-- * Rows are deleted a day after they expire, so no history of who reported what is kept.

create table if not exists public.road_alerts (
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('police', 'crash', 'hazard')),
  geom         extensions.geometry(Point, 4326) not null,
  user_id      uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '1 hour',
  confirm_count integer not null default 0,
  gone_count   integer not null default 0,
  last_confirmed_at timestamptz
);
create index if not exists road_alerts_geom_idx on public.road_alerts using gist (geom);
create index if not exists road_alerts_expires_idx on public.road_alerts (expires_at);
alter table public.road_alerts enable row level security;
-- No direct access: reads and writes go through the functions below.

create table if not exists private.road_alert_votes (
  alert_id   bigint not null references public.road_alerts (id) on delete cascade,
  user_id    uuid not null,
  vote       text not null check (vote in ('still_there', 'gone')),
  created_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create or replace function private.road_alert_json(a public.road_alerts)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', a.id, 'type', a.type,
    'lat', ST_Y(a.geom), 'lon', ST_X(a.geom),
    'created_at', a.created_at, 'expires_at', a.expires_at,
    'confirm_count', a.confirm_count, 'last_confirmed_at', a.last_confirmed_at,
    'mine', a.user_id is not distinct from auth.uid() and auth.uid() is not null);
$$;

-- Active alerts in a box (anyone can read).
create or replace function public.get_road_alerts(
  min_lon float8, min_lat float8, max_lon float8, max_lat float8)
returns jsonb
language sql
stable
security definer
set search_path = public, private, extensions
as $$
  select coalesce(jsonb_agg(private.road_alert_json(a)), '[]'::jsonb)
    from (select * from public.road_alerts
           where expires_at > now()
             and geom && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
           order by created_at desc
           limit 500) a;
$$;

create or replace function public.report_road_alert(
  p_type text, p_lat float8, p_lon float8, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  g geometry := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  dist int;
  near public.road_alerts;
  a public.road_alerts;
begin
  if p_type not in ('police', 'crash', 'hazard') then raise exception 'Unknown alert type.'; end if;
  dist := private.distance_m(p_user_lat, p_user_lon, p_lat, p_lon);
  if dist > 300 then
    raise exception '%', private.too_far_message('the spot you''re reporting', dist);
  end if;
  if not private.in_us(g) then raise exception 'DeCam GPS only covers the US for now.'; end if;
  if (select count(*) from public.road_alerts
       where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You''ve sent a lot of alerts this hour. Try again a bit later.';
  end if;

  -- Same kind already reported nearby? Refresh that one instead of adding a duplicate.
  select * into near from public.road_alerts
   where type = p_type and expires_at > now()
     and ST_DWithin(geom::geography, g::geography, 150)
   order by geom <-> g limit 1;
  if near.id is not null then
    update public.road_alerts
       set expires_at = now() + interval '1 hour',
           confirm_count = confirm_count + case when user_id is distinct from uid then 1 else 0 end,
           last_confirmed_at = now()
     where id = near.id
     returning * into a;
    return private.road_alert_json(a) || jsonb_build_object('merged', true);
  end if;

  insert into public.road_alerts (type, geom, user_id) values (p_type, g, uid) returning * into a;
  return private.road_alert_json(a);
end;
$$;

create or replace function public.vote_road_alert(
  p_alert_id bigint, p_vote text, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  a public.road_alerts;
  dist int;
begin
  if p_vote not in ('still_there', 'gone') then raise exception 'Unknown vote.'; end if;
  select * into a from public.road_alerts where id = p_alert_id and expires_at > now() for update;
  if not found then raise exception 'This alert has already expired.'; end if;
  dist := private.distance_m(p_user_lat, p_user_lon, ST_Y(a.geom), ST_X(a.geom));
  if dist > 1500 then
    raise exception '%', private.too_far_message('this alert', dist);
  end if;

  -- The reporter can take their own alert down; they can't vote it up.
  if a.user_id = uid then
    if p_vote = 'gone' then
      update public.road_alerts set expires_at = now() where id = a.id returning * into a;
      return jsonb_build_object('removed', true);
    end if;
    raise exception 'You reported this one. Others nearby can confirm it.';
  end if;

  insert into private.road_alert_votes (alert_id, user_id, vote) values (a.id, uid, p_vote)
  on conflict (alert_id, user_id) do update set vote = excluded.vote, created_at = now();

  if p_vote = 'still_there' then
    update public.road_alerts
       set expires_at = now() + interval '1 hour', confirm_count = confirm_count + 1, last_confirmed_at = now()
     where id = a.id returning * into a;
    return private.road_alert_json(a);
  end if;

  update public.road_alerts set gone_count = gone_count + 1 where id = a.id returning * into a;
  if a.gone_count >= 2 and a.gone_count > a.confirm_count then
    update public.road_alerts set expires_at = now() where id = a.id;
    return jsonb_build_object('removed', true);
  end if;
  return private.road_alert_json(a) || jsonb_build_object('noted', true);
end;
$$;

revoke all on function public.get_road_alerts(float8, float8, float8, float8) from public;
grant execute on function public.get_road_alerts(float8, float8, float8, float8) to anon, authenticated;
revoke all on function public.report_road_alert(text, float8, float8, float8, float8) from public, anon;
grant execute on function public.report_road_alert(text, float8, float8, float8, float8) to authenticated;
revoke all on function public.vote_road_alert(bigint, text, float8, float8) from public, anon;
grant execute on function public.vote_road_alert(bigint, text, float8, float8) to authenticated;
revoke all on function private.road_alert_json(public.road_alerts) from public, anon, authenticated;

-- Forget alerts a day after they expire.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'road-alerts-cleanup' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('road-alerts-cleanup', '17 * * * *',
    $c$delete from public.road_alerts where expires_at < now() - interval '1 day'$c$);
end;
$$;
