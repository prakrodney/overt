-- Overt · community reports and confirmations (plan §5–6)
--
-- Every phone gets an anonymous Supabase account (no sign-up). People can:
--   * report new equipment          -> a point that starts at "Needs confirmation"
--   * confirm "Still there"         -> raises confidence, resets the decay clock
--   * say "It's gone"               -> lowers confidence; 2+ independent "gone" votes archive it
--   * report an issue (wrong spot / wrong details) -> goes to the moderation queue
--
-- Guardrails: must be within ~300 m of the equipment (checked from the phone's
-- location at submit time; the user's location is NOT stored, only the
-- distance), one vote per person per point per day, daily limits, and a
-- reporter trust score that weights votes.

-- ---------------------------------------------------------------------------
-- Reporters (one row per anonymous or signed-in account)
-- ---------------------------------------------------------------------------
create table if not exists public.reporters (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  trust_score  smallint not null default 10 check (trust_score between 0 and 100),
  created_at   timestamptz not null default now()
);
alter table public.reporters enable row level security;
drop policy if exists "Reporters see their own row" on public.reporters;
create policy "Reporters see their own row" on public.reporters
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reports (equipment location only, never the user's position or trip)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id                 bigint generated always as identity primary key,
  point_id           bigint references public.surveillance_points (id) on delete set null,
  user_id            uuid not null references auth.users (id) on delete cascade,
  type               text not null check (type in ('new', 'confirm', 'gone', 'wrong_location', 'details_wrong', 'other')),
  geom               extensions.geometry(Point, 4326),
  reporter_distance_m integer,
  payload            jsonb not null default '{}'::jsonb,
  status             text not null default 'accepted' check (status in ('pending', 'accepted', 'rejected')),
  created_at         timestamptz not null default now()
);
create index if not exists reports_point_idx on public.reports (point_id, created_at desc);
create index if not exists reports_user_idx on public.reports (user_id, created_at desc);
alter table public.reports enable row level security;
drop policy if exists "Reporters see their own reports" on public.reports;
create policy "Reporters see their own reports" on public.reports
  for select to authenticated using (user_id = auth.uid());
-- No insert/update policies: all writes go through the functions below.

-- Community fields on points
alter table public.surveillance_points
  add column if not exists confirm_count    integer not null default 0,
  add column if not exists gone_count       integer not null default 0,
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists reported_by      uuid;

-- ---------------------------------------------------------------------------
-- Confidence model (starting point from the plan; tune with real data)
--   base: OpenStreetMap 55, community report 25 (+ reporter trust / 5)
--   + up to 3 recent confirmations, weighted by reporter trust (15 each)
--   + 10 if confirmed in the last 6 months
--   - "gone" votes in the last 6 months, weighted (20 each)
--   - 15 if never confirmed and last edited > 12 months ago
--   >= 70 Verified · 40–69 Community reported · < 40 Needs confirmation
-- ---------------------------------------------------------------------------
create or replace function private.recompute_confidence(p_point bigint)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  p public.surveillance_points;
  confirm_w numeric;
  gone_w numeric;
  gone_people int;
  confirm_people int;
  score numeric;
  lvl text;
  reporter_trust int;
begin
  select * into p from public.surveillance_points where id = p_point for update;
  if not found then return; end if;

  -- Latest vote per person in the last 6 months.
  with latest as (
    select distinct on (r.user_id) r.user_id, r.type
      from public.reports r
     where r.point_id = p_point and r.type in ('confirm', 'gone')
       and r.created_at > now() - interval '180 days'
       and r.user_id is distinct from p.reported_by
     order by r.user_id, r.created_at desc
  )
  select coalesce(sum(case when l.type = 'confirm' then 0.5 + coalesce(rp.trust_score, 10) / 100.0 end), 0),
         coalesce(sum(case when l.type = 'gone'    then 0.5 + coalesce(rp.trust_score, 10) / 100.0 end), 0),
         count(*) filter (where l.type = 'confirm'),
         count(*) filter (where l.type = 'gone')
    into confirm_w, gone_w, confirm_people, gone_people
    from latest l left join public.reporters rp on rp.user_id = l.user_id;

  if p.source = 'osm' then
    score := 55;
  else
    select trust_score into reporter_trust from public.reporters where user_id = p.reported_by;
    score := 25 + coalesce(reporter_trust, 10) / 5.0;
  end if;
  score := score + least(confirm_w, 3) * 15 - gone_w * 20;
  if p.last_confirmed_at > now() - interval '180 days' then score := score + 10; end if;
  if p.last_confirmed_at is null and coalesce(p.osm_updated_at, p.created_at) < now() - interval '365 days' then
    score := score - 15;
  end if;
  score := greatest(0, least(100, round(score)));
  lvl := case when score >= 70 then 'verified' when score >= 40 then 'community' else 'needs_confirmation' end;

  update public.surveillance_points
     set confidence_score = score,
         confidence_level = lvl,
         confirm_count    = confirm_people,
         gone_count       = gone_people,
         status = case when gone_people >= 2 and gone_w > confirm_w then 'archived' else status end,
         updated_at = now()
   where id = p_point;

  -- Reporter trust: rises when others confirm their report, falls when it's voted gone.
  if p.source = 'community' and p.reported_by is not null then
    update public.reporters
       set trust_score = greatest(0, least(100, 10 + least(confirm_people, 5) * 8 - gone_people * 10))
     where user_id = p.reported_by;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.require_reporter()
returns uuid
language plpgsql
security definer
set search_path = private, public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.reporters (user_id) values (uid) on conflict do nothing;
  return uid;
end;
$$;

create or replace function private.distance_m(lat1 float8, lon1 float8, lat2 float8, lon2 float8)
returns integer
language sql
immutable
set search_path = extensions
as $$
  select round(ST_DistanceSphere(ST_MakePoint(lon1, lat1), ST_MakePoint(lon2, lat2)))::int;
$$;

-- ---------------------------------------------------------------------------
-- Public API (callable by signed-in users, including anonymous ones)
-- ---------------------------------------------------------------------------

-- Confirm or deny a camera. verdict: 'confirm' (Still there) or 'gone'.
create or replace function public.vote_on_point(
  p_point_id bigint, p_verdict text, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  p public.surveillance_points;
  dist int;
begin
  if p_verdict not in ('confirm', 'gone') then raise exception 'Unknown vote'; end if;
  select * into p from public.surveillance_points where id = p_point_id and status = 'active';
  if not found then raise exception 'This camera is no longer on the map.'; end if;
  if p.reported_by = uid then raise exception 'You reported this one, so someone else needs to confirm it.'; end if;

  dist := private.distance_m(p_user_lat, p_user_lon, ST_Y(p.geom), ST_X(p.geom));
  if dist > 300 then
    raise exception 'You need to be within 300 m (about 1,000 ft) of the camera. You''re about % m away.', dist;
  end if;
  if exists (select 1 from public.reports where user_id = uid and point_id = p_point_id
               and type in ('confirm', 'gone') and created_at > now() - interval '24 hours') then
    raise exception 'You already voted on this camera today. Thanks!';
  end if;
  if (select count(*) from public.reports where user_id = uid and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'Daily limit reached. Try again tomorrow.';
  end if;

  insert into public.reports (point_id, user_id, type, geom, reporter_distance_m)
  values (p_point_id, uid, p_verdict, p.geom, dist);

  if p_verdict = 'confirm' then
    update public.surveillance_points set last_confirmed_at = now(), last_verified_at = now()
     where id = p_point_id;
  end if;
  perform private.recompute_confidence(p_point_id);

  select * into p from public.surveillance_points where id = p_point_id;
  return jsonb_build_object('status', p.status, 'confidence_level', p.confidence_level,
                            'confirm_count', p.confirm_count);
end;
$$;

-- Report new equipment at (lat, lon). direction_deg is optional (0 = north).
create or replace function public.report_new_point(
  p_lat float8, p_lon float8, p_direction_deg integer, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  dist int;
  g geometry := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  near_id bigint;
  new_id bigint;
  trust int;
begin
  dist := private.distance_m(p_user_lat, p_user_lon, p_lat, p_lon);
  if dist > 300 then
    raise exception 'You can only report equipment within 300 m (about 1,000 ft) of where you are. This spot is about % m away.', dist;
  end if;
  if not private.in_us(g) then raise exception 'Overt only covers the US for now.'; end if;
  if (select count(*) from public.reports where user_id = uid and type = 'new'
        and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You''ve reported 10 cameras today, the daily limit. Thanks for helping!';
  end if;

  -- Already on the map within 25 m? Count it as a confirmation instead.
  select id into near_id from public.surveillance_points
   where status = 'active' and ST_DWithin(geom::geography, g::geography, 25)
   order by geom <-> g limit 1;
  if near_id is not null then
    begin
      return public.vote_on_point(near_id, 'confirm', p_user_lat, p_user_lon)
             || jsonb_build_object('merged_into', near_id);
    exception when others then
      return jsonb_build_object('merged_into', near_id, 'note', SQLERRM);
    end;
  end if;

  select trust_score into trust from public.reporters where user_id = uid;
  insert into public.surveillance_points
    (geom, category, source, confidence_level, confidence_score, directions_deg, reported_by, status)
  values
    (g, 'alpr', 'community', 'needs_confirmation', 25 + coalesce(trust, 10) / 5,
     case when p_direction_deg is null then null else array[((p_direction_deg % 360 + 360) % 360)::smallint] end,
     uid, 'active')
  returning id into new_id;

  insert into public.reports (point_id, user_id, type, geom, reporter_distance_m, payload, status)
  values (new_id, uid, 'new', g, dist, jsonb_build_object('direction_deg', p_direction_deg),
          -- low-trust reporters' reports are listed for review; the point still shows as "Needs confirmation"
          case when coalesce(trust, 10) < 30 then 'pending' else 'accepted' end);

  perform private.recompute_confidence(new_id);
  return jsonb_build_object('point_id', new_id);
end;
$$;

-- Flag a problem with a camera (goes to the moderation queue).
create or replace function public.report_issue(
  p_point_id bigint, p_kind text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  p public.surveillance_points;
begin
  if p_kind not in ('wrong_location', 'details_wrong', 'other') then raise exception 'Unknown issue type'; end if;
  select * into p from public.surveillance_points where id = p_point_id;
  if not found then raise exception 'Camera not found.'; end if;
  if (select count(*) from public.reports where user_id = uid and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'Daily limit reached. Try again tomorrow.';
  end if;
  insert into public.reports (point_id, user_id, type, geom, payload, status)
  values (p_point_id, uid, p_kind, p.geom, jsonb_build_object('note', left(p_note, 500)), 'pending');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.vote_on_point(bigint, text, float8, float8) from public, anon;
revoke all on function public.report_new_point(float8, float8, integer, float8, float8) from public, anon;
revoke all on function public.report_issue(bigint, text, text) from public, anon;
grant execute on function public.vote_on_point(bigint, text, float8, float8) to authenticated;
grant execute on function public.report_new_point(float8, float8, integer, float8, float8) to authenticated;
grant execute on function public.report_issue(bigint, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Moderation (for you, in the SQL editor, until there's an admin screen)
--   select * from private.moderation_queue;
--   select private.moderate_report(<report id>, 'accepted' | 'rejected');
-- Rejecting a "new" report archives the point it created.
-- ---------------------------------------------------------------------------
create or replace view private.moderation_queue as
select r.id as report_id, r.type, r.created_at, r.point_id,
       ST_Y(r.geom) as lat, ST_X(r.geom) as lon, r.payload,
       rp.trust_score as reporter_trust
  from public.reports r
  left join public.reporters rp on rp.user_id = r.user_id
 where r.status = 'pending'
 order by r.created_at;

create or replace function private.moderate_report(p_report_id bigint, p_decision text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare r public.reports;
begin
  if p_decision not in ('accepted', 'rejected') then raise exception 'accepted or rejected'; end if;
  update public.reports set status = p_decision where id = p_report_id returning * into r;
  if r.type = 'new' and p_decision = 'rejected' and r.point_id is not null then
    update public.surveillance_points set status = 'archived', updated_at = now() where id = r.point_id;
    update public.reporters set trust_score = greatest(0, trust_score - 10) where user_id = r.user_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Camera JSON for the app now includes community info.
-- ---------------------------------------------------------------------------
create or replace function public._camera_point_json(p public.surveillance_points)
returns jsonb
language sql
immutable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id',               p.id,
    'lat',              ST_Y(p.geom),
    'lon',              ST_X(p.geom),
    'category',         p.category,
    'subtype',          p.subtype,
    'manufacturer',     p.manufacturer,
    'operator',         p.operator,
    'mount',            p.mount,
    'directions',       coalesce(to_jsonb(p.directions_deg), '[]'::jsonb),
    'confidence_level', p.confidence_level,
    'source',           p.source,
    'osm_type',         p.osm_type,
    'osm_id',           p.osm_id,
    'updated_at',       coalesce(p.osm_updated_at, p.updated_at),
    'last_verified_at', p.last_verified_at,
    'confirm_count',    p.confirm_count
  );
$$;

-- ---------------------------------------------------------------------------
-- The nightly OSM import must not bring back cameras the community voted gone.
-- (Same as before, except status: keep 'archived' when 2+ people said it's gone.)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_osm_points(p_rows jsonb, p_region text default null)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare n int;
begin
  insert into public.surveillance_points as sp (
    geom, category, subtype, manufacturer, operator, mount,
    direction_raw, directions_deg, source, osm_type, osm_id, osm_version,
    osm_updated_at, last_seen_in_import_at, tags, status
  )
  select g.geom,
         'alpr',
         r->>'subtype', r->>'manufacturer', r->>'operator', r->>'mount',
         r->>'direction_raw',
         case when jsonb_typeof(r->'directions') = 'array' and jsonb_array_length(r->'directions') > 0
              then array(select (d)::smallint from jsonb_array_elements_text(r->'directions') d)
         end,
         'osm', r->>'osm_type', (r->>'osm_id')::bigint, (r->>'osm_version')::int,
         (r->>'osm_updated_at')::timestamptz, now(),
         coalesce(r->'tags', '{}'::jsonb), 'active'
    from jsonb_array_elements(p_rows) r
    cross join lateral (
      select ST_SetSRID(ST_MakePoint((r->>'lon')::float8, (r->>'lat')::float8), 4326) as geom
    ) g
   where private.in_us(g.geom)
  on conflict (osm_type, osm_id) do update set
    geom                   = excluded.geom,
    subtype                = excluded.subtype,
    manufacturer           = excluded.manufacturer,
    operator               = excluded.operator,
    mount                  = excluded.mount,
    direction_raw          = excluded.direction_raw,
    directions_deg         = excluded.directions_deg,
    osm_version            = excluded.osm_version,
    osm_updated_at         = excluded.osm_updated_at,
    last_seen_in_import_at = excluded.last_seen_in_import_at,
    tags                   = excluded.tags,
    status                 = case when sp.gone_count >= 2 and sp.gone_count > sp.confirm_count
                                  then sp.status else 'active' end,
    updated_at             = case when sp.osm_version is distinct from excluded.osm_version
                                  then now() else sp.updated_at end;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.upsert_osm_points(jsonb, text) from public, anon, authenticated;
grant execute on function public.upsert_osm_points(jsonb, text) to service_role;
