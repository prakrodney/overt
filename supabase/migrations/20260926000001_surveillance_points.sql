-- Overt · milestone 1
-- Camera layer: surveillance_points (PostGIS), a viewport/cluster query for the app,
-- and the plumbing the OpenStreetMap import function uses.

create extension if not exists postgis with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.surveillance_points (
  id                bigint generated always as identity primary key,
  geom              extensions.geometry(Point, 4326) not null,
  category          text not null default 'alpr',          -- room for other layers later
  subtype           text,                                  -- camera:type / surveillance:zone etc.
  manufacturer      text,
  operator          text,
  mount             text,                                  -- camera:mount
  direction_raw     text,                                  -- as tagged in OSM ("90", "NE", "0;180", "45-90")
  directions_deg    smallint[],                            -- parsed facing directions, 0 = north
  direction_deg     smallint generated always as (directions_deg[1]) stored,
  status            text not null default 'active' check (status in ('active', 'archived')),
  confidence_score  smallint not null default 55 check (confidence_score between 0 and 100),
  confidence_level  text not null default 'community'
                    check (confidence_level in ('verified', 'community', 'needs_confirmation')),
  source            text not null default 'osm',
  osm_type          text check (osm_type in ('node', 'way', 'relation')),
  osm_id            bigint,
  osm_version       integer,
  osm_updated_at    timestamptz,                           -- last edit of the element in OSM
  last_verified_at  timestamptz,
  last_seen_in_import_at timestamptz,
  tags              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint surveillance_points_osm_key unique (osm_type, osm_id)
);

create index if not exists surveillance_points_geom_idx
  on public.surveillance_points using gist (geom);
create index if not exists surveillance_points_active_idx
  on public.surveillance_points (status) where status = 'active';

-- Anyone may read active points; only the service role writes.
alter table public.surveillance_points enable row level security;

drop policy if exists "Active points are public" on public.surveillance_points;
create policy "Active points are public"
  on public.surveillance_points for select
  to anon, authenticated
  using (status = 'active');

-- ---------------------------------------------------------------------------
-- Viewport query used by the app.
--   zoom >= 15  -> individual points
--   zoom <  15  -> grid clusters (~60 pt cells on screen); single-point cells
--                  come back as full points so they still draw as markers.
-- ---------------------------------------------------------------------------
create or replace function public.get_camera_layer(
  min_lon double precision,
  min_lat double precision,
  max_lon double precision,
  max_lat double precision,
  zoom    double precision
)
returns jsonb
language plpgsql
stable
security invoker
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

  -- Width of one 256-pt map tile in degrees, scaled to a ~60 pt cell.
  cell := (360.0 / power(2, greatest(zoom, 0))) * (60.0 / 256.0);

  with cells as (
    select count(*)                          as n,
           ST_Centroid(ST_Collect(geom))     as center,
           min(id)                           as any_id,
           ST_Extent(geom)                   as extent
      from public.surveillance_points
     where status = 'active' and geom && env
     group by ST_SnapToGrid(geom, cell)
  )
  select jsonb_build_object(
           'mode', 'clusters',
           'clusters', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', 'c' || c.any_id,
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
    'last_verified_at', p.last_verified_at
  );
$$;

grant execute on function public.get_camera_layer(double precision, double precision, double precision, double precision, double precision)
  to anon, authenticated;
grant execute on function public._camera_point_json(public.surveillance_points) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Import plumbing (service role only)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.import_config (
  id     int primary key default 1 check (id = 1),
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into private.import_config (id) values (1) on conflict do nothing;

create table if not exists private.import_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  region      text,
  fetched     int,
  upserted    int,
  error       text,
  finished_at timestamptz
);

create or replace function public.verify_import_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = private
as $$
  select exists (select 1 from private.import_config where secret = p_secret);
$$;
revoke all on function public.verify_import_secret(text) from public, anon, authenticated;
grant execute on function public.verify_import_secret(text) to service_role;

-- Upsert a batch of OSM elements (called by the import-osm edge function).
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
  select ST_SetSRID(ST_MakePoint((r->>'lon')::float8, (r->>'lat')::float8), 4326),
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

create or replace function public.log_import_run(p_region text, p_fetched int, p_upserted int, p_error text)
returns void
language sql
security definer
set search_path = private
as $$
  insert into private.import_runs (region, fetched, upserted, error, finished_at)
  values (p_region, p_fetched, p_upserted, p_error, now());
$$;
revoke all on function public.log_import_run(text, int, int, text) from public, anon, authenticated;
grant execute on function public.log_import_run(text, int, int, text) to service_role;
