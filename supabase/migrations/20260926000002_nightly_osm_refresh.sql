-- Overt · nightly OpenStreetMap refresh
-- Calls the import-osm edge function once per region (staggered so Overpass
-- isn't hit in parallel), then archives points that disappeared upstream.

create extension if not exists pg_cron;

alter table private.import_config
  add column if not exists function_url text;  -- https://<ref>.supabase.co/functions/v1/import-osm

create table if not exists private.import_regions (
  region text primary key,
  south double precision not null,
  west  double precision not null,
  north double precision not null,
  east  double precision not null
);

insert into private.import_regions (region, south, west, north, east) values
  ('conus-sw',  24, -125.0, 37, -110.25),
  ('conus-sc1', 24, -110.25, 37, -95.5),
  ('conus-sc2', 24,  -95.5, 37, -80.75),
  ('conus-se',  24,  -80.75, 37, -66.0),
  ('conus-nw',  37, -125.0, 50, -110.25),
  ('conus-nc1', 37, -110.25, 50, -95.5),
  ('conus-nc2', 37,  -95.5, 50, -80.75),
  ('conus-ne',  37,  -80.75, 50, -66.0),
  ('alaska',    51, -180.0, 72, -129.0),
  ('hawaii',    18, -161.0, 23, -154.0),
  ('puerto-rico', 17, -68.0, 19, -64.0)
on conflict (region) do nothing;

-- Fire one region's import (async via pg_net). Returns the pg_net request id.
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
    body    := jsonb_build_object('region', r.region,
                                  'bbox', jsonb_build_array(r.south, r.west, r.north, r.east)),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-import-secret', cfg.secret),
    timeout_milliseconds := 180000
  );
end;
$$;

-- Archive OSM points not seen by any import in the last 36 hours, but only
-- when every region imported cleanly in that window (so a failed region
-- never wipes its cameras off the map).
create or replace function private.archive_stale_osm_points()
returns int
language plpgsql
security definer
set search_path = private, public
as $$
declare
  ok_regions int;
  all_regions int;
  n int;
begin
  select count(distinct region) into ok_regions
    from private.import_runs
   where error is null and finished_at > now() - interval '36 hours';
  select count(*) into all_regions from private.import_regions;
  if ok_regions < all_regions then
    return 0;
  end if;
  update public.surveillance_points
     set status = 'archived', updated_at = now()
   where source = 'osm' and status = 'active'
     and last_seen_in_import_at < now() - interval '36 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Nightly schedule: 08:00–08:40 UTC (≈3 AM Central), one region every 4 minutes.
do $$
declare
  r record;
  i int := 0;
begin
  for r in select region from private.import_regions order by region loop
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'osm-import-' || r.region;
    perform cron.schedule(
      'osm-import-' || r.region,
      format('%s 8 * * *', i * 4),
      format($f$select private.queue_import(%L)$f$, r.region)
    );
    i := i + 1;
  end loop;
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'osm-archive-stale';
  perform cron.schedule('osm-archive-stale', '0 10 * * *', 'select private.archive_stale_osm_points()');
end;
$$;
