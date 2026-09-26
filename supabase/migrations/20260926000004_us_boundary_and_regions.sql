-- Overt · faster, US-only imports
-- Overpass "inside the US" area queries were too slow (>2 min per region), so the
-- import now asks Overpass for a plain bounding box and keeps only points inside
-- a US boundary stored here (geoBoundaries ADM0, padded ~300 m for shorelines).

-- US boundary, split into small indexed pieces so point checks are fast.
create table if not exists private.us_boundary_parts (
  id   bigint generated always as identity primary key,
  geom extensions.geometry(Polygon, 4326) not null
);
create index if not exists us_boundary_parts_geom_idx
  on private.us_boundary_parts using gist (geom);

create or replace function public.load_us_boundary(p_geojson jsonb)
returns int
language plpgsql
security definer
set search_path = private, extensions
as $$
declare n int;
begin
  delete from private.us_boundary_parts where true;  -- PostgREST requires a WHERE
  insert into private.us_boundary_parts (geom)
  -- Subdivide first, then pad each piece by ~300 m (0.003 degrees) so piers,
  -- islands and shoreline cameras aren't clipped by the simplified outline.
  select (ST_Dump(ST_Buffer(parts.geom, 0.003))).geom
    from (
      select ST_Subdivide(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326)), 128) as geom
    ) parts;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.load_us_boundary(jsonb) from public, anon, authenticated;
grant execute on function public.load_us_boundary(jsonb) to service_role;

-- True when the point is inside the US (or no boundary is loaded yet).
create or replace function private.in_us(p extensions.geometry)
returns boolean
language sql
stable
set search_path = private, extensions
as $$
  select not exists (select 1 from private.us_boundary_parts limit 1)
      or exists (select 1 from private.us_boundary_parts b where ST_Intersects(b.geom, p));
$$;

-- Upsert now skips anything outside the US boundary.
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
    status                 = 'active',
    updated_at             = case when sp.osm_version is distinct from excluded.osm_version
                                  then now() else sp.updated_at end;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.upsert_osm_points(jsonb, text) from public, anon, authenticated;
grant execute on function public.upsert_osm_points(jsonb, text) to service_role;

-- Smaller regions: each Overpass call stays well under the function time limit.
delete from private.import_regions;
insert into private.import_regions (region, south, west, north, east) values
  ('conus-00', 24.00, -125.000, 32.50, -115.167),
  ('conus-01', 24.00, -115.167, 32.50, -105.333),
  ('conus-02', 24.00, -105.333, 32.50, -95.500),
  ('conus-03', 24.00, -95.500, 32.50, -85.667),
  ('conus-04', 24.00, -85.667, 32.50, -75.833),
  ('conus-05', 24.00, -75.833, 32.50, -66.000),
  ('conus-10', 32.50, -125.000, 41.00, -115.167),
  ('conus-11', 32.50, -115.167, 41.00, -105.333),
  ('conus-12', 32.50, -105.333, 41.00, -95.500),
  ('conus-13', 32.50, -95.500, 41.00, -85.667),
  ('conus-14', 32.50, -85.667, 41.00, -75.833),
  ('conus-15', 32.50, -75.833, 41.00, -66.000),
  ('conus-20', 41.00, -125.000, 49.50, -115.167),
  ('conus-21', 41.00, -115.167, 49.50, -105.333),
  ('conus-22', 41.00, -105.333, 49.50, -95.500),
  ('conus-23', 41.00, -95.500, 49.50, -85.667),
  ('conus-24', 41.00, -85.667, 49.50, -75.833),
  ('conus-25', 41.00, -75.833, 49.50, -66.000),
  ('alaska', 51, -180.0, 71.6, -129.9),
  ('alaska-aleutians-west', 50, 172.0, 54, 180.0),
  ('hawaii', 18.5, -161.0, 22.5, -154.5),
  ('puerto-rico-usvi', 17.6, -67.95, 18.6, -64.5);

-- queue_import: bounding box only (the US check happens on upsert).
create or replace function private.queue_import(p_region text)
returns bigint
language plpgsql
security definer
set search_path = private, extensions
as $$
declare
  cfg private.import_config;
  r   private.import_regions;
begin
  select * into cfg from private.import_config where id = 1;
  select * into r from private.import_regions where region = p_region;
  if cfg.function_url is null or r.region is null then
    raise exception 'import not configured for region %', p_region;
  end if;
  return net.http_post(
    url     := cfg.function_url,
    body    := jsonb_build_object('region', r.region, 'useArea', false,
                                  'bbox', jsonb_build_array(r.south, r.west, r.north, r.east)),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-import-secret', cfg.secret),
    timeout_milliseconds := 60000
  );
end;
$$;

-- Ask the function to (re)load the US boundary.
create or replace function private.queue_boundary_load()
returns bigint
language sql
security definer
set search_path = private, extensions
as $$
  select net.http_post(
    url     := cfg.function_url,
    body    := '{"action": "load-boundary"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-import-secret', cfg.secret),
    timeout_milliseconds := 60000)
  from private.import_config cfg where cfg.id = 1;
$$;

-- Remove points that came in before the boundary existed and lie outside it.
create or replace function private.archive_points_outside_us()
returns int
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare n int;
begin
  update public.surveillance_points
     set status = 'archived', updated_at = now()
   where status = 'active' and not private.in_us(geom);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Reschedule: 08:00 UTC onward, one region every 2 minutes (~44 min total).
do $$
declare
  j record;
  r record;
  i int := 0;
begin
  for j in select jobid from cron.job where jobname like 'osm-import-%' loop
    perform cron.unschedule(j.jobid);
  end loop;
  for r in select region from private.import_regions order by region loop
    perform cron.schedule(
      'osm-import-' || r.region,
      format('%s %s * * *', (i * 2) % 60, 8 + (i * 2) / 60),
      format($f$select private.queue_import(%L)$f$, r.region)
    );
    i := i + 1;
  end loop;
end;
$$;
