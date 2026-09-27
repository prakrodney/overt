-- DeCam GPS (Overt) · known speed cameras.
--
-- * The OSM importer now also fetches node["highway"="speed_camera"] and stores them
--   with category 'speed_camera' (ALPRs stay 'alpr'). Regions imported before this
--   change refresh right away so speed cameras appear within an hour or two.
-- * The camera layer clusters each category separately and says which is which.
-- * Route lookups get the category too, so the app can count speed cameras apart.
-- * People can report a speed camera (report_new_point gains p_category).

create or replace function private.start_region_fetch(p_region text)
returns bigint
language plpgsql
security definer
set search_path = private, extensions
as $$
declare
  r private.import_regions;
  mirror text;
  q text;
  req bigint;
  attempts int;
begin
  select * into r from private.import_regions where region = p_region;
  if r.region is null then raise exception 'unknown region %', p_region; end if;

  -- Rotate mirrors on consecutive failures of this region.
  select count(*) into attempts
    from private.import_runs x
   where x.region = p_region and x.error is not null
     and x.finished_at > coalesce((select max(finished_at) from private.import_runs
                                    where region = p_region and error is null), '-infinity');
  select url into mirror from private.overpass_mirrors
   order by priority offset (attempts % (select count(*) from private.overpass_mirrors)) limit 1;

  -- ALPRs plus speed cameras (highway=speed_camera nodes).
  q := format('[out:json][timeout:60];(nwr["surveillance:type"="ALPR"](%1$s,%2$s,%3$s,%4$s);node["highway"="speed_camera"](%1$s,%2$s,%3$s,%4$s););out center meta;',
              r.south, r.west, r.north, r.east);
  req := net.http_get(
    url := mirror,
    params := jsonb_build_object('data', q),
    headers := jsonb_build_object('User-Agent', 'Overt/0.1 (DeCam GPS: ALPR + speed camera map; daily OSM import)'),
    timeout_milliseconds := 90000);
  insert into private.pending_fetches (request_id, region, mirror) values (req, p_region, mirror);
  return req;
end;
$$;

create or replace function private.process_fetches()
returns int
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  f record;
  resp record;
  doc jsonb;
  n int;
  handled int := 0;
  err text;
begin
  for f in select * from private.pending_fetches order by requested_at loop
    select status_code, content, error_msg, timed_out into resp
      from net._http_response where id = f.request_id;

    if not found then
      -- Still running; give up after 3 minutes.
      if f.requested_at < now() - interval '3 minutes' then
        perform public.log_import_run(f.region, 0, 0, 'no response from ' || f.mirror, null);
        delete from private.pending_fetches where request_id = f.request_id;
        handled := handled + 1;
      end if;
      continue;
    end if;

    err := null;
    doc := null;
    if resp.status_code is distinct from 200 then
      err := format('%s: HTTP %s %s', f.mirror, coalesce(resp.status_code::text, '-'),
                    left(coalesce(resp.error_msg, regexp_replace(coalesce(resp.content, ''), '<[^>]+>|\s+', ' ', 'g')), 200));
    else
      begin
        doc := resp.content::jsonb;
      exception when others then
        err := f.mirror || ': response was not JSON';
      end;
      if err is null and doc ? 'remark' then
        err := f.mirror || ': ' || left(doc->>'remark', 200);
      end if;
    end if;

    if err is not null then
      perform public.log_import_run(f.region, 0, 0, err, null);
    else
      select public.upsert_osm_points(coalesce(jsonb_agg(jsonb_build_object(
               'osm_type', e->>'type',
               'osm_id', e->'id',
               'osm_version', e->'version',
               'osm_updated_at', e->'timestamp',
               'lat', coalesce(e->'lat', e->'center'->'lat'),
               'lon', coalesce(e->'lon', e->'center'->'lon'),
               'category', case when e->'tags'->>'surveillance:type' = 'ALPR' then 'alpr'
                                when e->'tags'->>'highway' = 'speed_camera' then 'speed_camera'
                                else 'alpr' end,
               'subtype', coalesce(e->'tags'->'camera:type', e->'tags'->'surveillance:zone'),
               'manufacturer', coalesce(e->'tags'->'manufacturer', e->'tags'->'brand'),
               'operator', e->'tags'->'operator',
               'mount', e->'tags'->'camera:mount',
               'direction_raw', coalesce(e->'tags'->'direction', e->'tags'->'camera:direction',
                                         e->'tags'->'surveillance:direction'),
               'directions', to_jsonb(private.parse_directions(coalesce(
                                 e->'tags'->>'direction', e->'tags'->>'camera:direction',
                                 e->'tags'->>'surveillance:direction'))),
               'tags', e->'tags')), '[]'::jsonb), f.region)
        into n
        from jsonb_array_elements(doc->'elements') e
       where coalesce(e->'lat', e->'center'->'lat') is not null;
      perform public.log_import_run(f.region, jsonb_array_length(doc->'elements'), n, null,
                                    'via ' || f.mirror);
    end if;

    delete from private.pending_fetches where request_id = f.request_id;
    handled := handled + 1;
  end loop;
  return handled;
end;
$$;

create or replace function private.refresh_tick()
returns text
language plpgsql
security definer
set search_path = private, extensions
as $$
declare
  next_region text;
begin
  perform private.process_fetches();

  if (select count(*) from private.pending_fetches) >= 2 then
    return 'busy';
  end if;

  -- Stalest region first; skip anything that failed in the last 4 minutes.
  select ir.region into next_region
    from private.import_regions ir
    left join lateral (
      select max(finished_at) filter (where error is null) as last_ok,
             max(finished_at) filter (where error is not null) as last_fail
        from private.import_runs x where x.region = ir.region) s on true
   -- (Regions last imported before speed cameras were added refresh right away.)
   where coalesce(s.last_ok, '-infinity') < greatest(now() - interval '20 hours', timestamptz '2026-09-27 04:55:00+00')
     and coalesce(s.last_fail, '-infinity') < now() - interval '4 minutes'
     and not exists (select 1 from private.pending_fetches p where p.region = ir.region)
   order by s.last_ok nulls first, ir.region
   limit 1;

  if next_region is null then
    return 'idle';
  end if;
  perform private.start_region_fetch(next_region);
  return 'started ' || next_region;
end;
$$;

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
         coalesce(r->>'category', 'alpr'),
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
    category               = excluded.category,
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

-- Camera JSON: add the posted speed limit when OSM has one.
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
    'confirm_count',    p.confirm_count,
    'maxspeed',         p.tags->>'maxspeed'
  );
$$;

-- Layer: clusters per category (so zoomed-out dots can be colored by type).
create or replace function public.get_camera_layer(
  min_lon double precision, min_lat double precision, max_lon double precision,
  max_lat double precision, zoom double precision)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  env  geometry := ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326);
  cell double precision;
  result jsonb;
begin
  if zoom >= 15 then
    select jsonb_build_object(
             'mode', 'points',
             'clusters', '[]'::jsonb,
             'points', coalesce(jsonb_agg(public._camera_point_json(p)), '[]'::jsonb))
      into result
      from (
        select * from public.surveillance_points
         where status = 'active' and geom && env
         limit 2000
      ) p;
    return result;
  end if;

  cell := (360.0 / power(2, greatest(zoom, 0))) * (60.0 / 256.0);

  with cells as (
    select category,
           count(*)                          as n,
           ST_Centroid(ST_Collect(geom))     as center,
           min(id)                           as any_id,
           ST_Extent(geom)                   as extent
      from public.surveillance_points
     where status = 'active' and geom && env
     group by category, ST_SnapToGrid(geom, cell)
  )
  select jsonb_build_object(
           'mode', 'clusters',
           'clusters', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', 'c' || c.any_id,
                       'category', c.category,
                       'count', c.n,
                       'lat', ST_Y(c.center),
                       'lon', ST_X(c.center),
                       'bbox', jsonb_build_array(ST_XMin(c.extent), ST_YMin(c.extent),
                                                 ST_XMax(c.extent), ST_YMax(c.extent))))
                from cells c where c.n > 1), '[]'::jsonb),
           'points', coalesce((
              select jsonb_agg(public._camera_point_json(p))
                from cells c
                join public.surveillance_points p on p.id = c.any_id
               where c.n = 1), '[]'::jsonb))
    into result;
  return result;
end;
$$;

-- Route lookups: [id, lat, lon, direction, 1 if speed camera else 0]
create or replace function public.get_cameras_in_boxes(boxes jsonb, max_count integer default 20000)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with b as (
    select ST_MakeEnvelope((x->>0)::float8, (x->>1)::float8, (x->>2)::float8, (x->>3)::float8, 4326) as env
      from jsonb_array_elements(boxes) x
     limit 200
  ),
  pts as (
    select distinct on (p.id) p.id, p.geom, p.direction_deg, p.category
      from b
      join public.surveillance_points p on p.geom && b.env
     where p.status = 'active'
     limit least(greatest(max_count, 1), 50000)
  )
  select coalesce(jsonb_agg(jsonb_build_array(id, round(ST_Y(geom)::numeric, 6), round(ST_X(geom)::numeric, 6),
                                              direction_deg, case when category = 'speed_camera' then 1 else 0 end)),
                  '[]'::jsonb)
    from pts;
$$;

-- Reporting: a camera type can be chosen (ALPR or speed camera).
drop function if exists public.report_new_point(float8, float8, integer, float8, float8);
create or replace function public.report_new_point(
  p_lat float8, p_lon float8, p_direction_deg integer, p_user_lat float8, p_user_lon float8,
  p_category text default 'alpr')
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
  last_new timestamptz;
begin
  if p_category not in ('alpr', 'speed_camera') then raise exception 'Unknown camera type.'; end if;
  dist := private.distance_m(p_user_lat, p_user_lon, p_lat, p_lon);
  if dist > 300 then
    raise exception '%', private.too_far_message('the spot you''re reporting', dist);
  end if;
  if not private.in_us(g) then raise exception 'DeCam GPS only covers the US for now.'; end if;
  -- One new camera per person per 24 hours (keeps pranksters from flooding the map).
  select max(created_at) into last_new from public.reports
   where user_id = uid and type = 'new' and created_at > now() - interval '24 hours';
  if last_new is not null then
    raise exception 'You can add one new camera per day. You can add another in about %.',
      case when last_new + interval '24 hours' - now() > interval '1 hour'
           then ceil(extract(epoch from last_new + interval '24 hours' - now()) / 3600)::int || ' hours'
           else 'an hour' end;
  end if;

  -- Already on the map within 25 m? Count it as a confirmation instead.
  select id into near_id from public.surveillance_points
   where status = 'active' and category = p_category and ST_DWithin(geom::geography, g::geography, 25)
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
    (g, p_category, 'community', 'needs_confirmation', 25 + coalesce(trust, 10) / 5,
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
revoke all on function public.report_new_point(float8, float8, integer, float8, float8, text) from public, anon;
grant execute on function public.report_new_point(float8, float8, integer, float8, float8, text) to authenticated;
