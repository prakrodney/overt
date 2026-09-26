-- Overt · import OpenStreetMap ALPRs straight from the database
--
-- Edge functions share IP addresses and a 150 s limit, and public Overpass
-- servers were refusing or timing out their requests. The database now asks
-- Overpass itself (pg_net, async HTTP), parses the JSON and upserts in SQL.
--
-- How it runs: `osm-refresh-tick` fires every minute. It (1) processes any
-- Overpass responses that have arrived and (2) starts the next region whose
-- last good import is older than 20 hours, keeping at most 2 requests in
-- flight. The first pass imports the whole US in roughly half an hour; after
-- that each region refreshes about once a day. Failed regions are retried on
-- another mirror a few minutes later.

-- ---------------------------------------------------------------------------
-- Smaller regions: every contiguous-US tile from the previous migration split
-- into quarters, so each Overpass query stays well under its 60 s budget.
-- ---------------------------------------------------------------------------
create table if not exists private.import_regions_v2 as
select r.region || '-' || q.k as region,
       r.south + (r.north - r.south) / 2 * q.dy as south,
       r.west  + (r.east  - r.west)  / 2 * q.dx as west,
       r.south + (r.north - r.south) / 2 * (q.dy + 1) as north,
       r.west  + (r.east  - r.west)  / 2 * (q.dx + 1) as east
  from private.import_regions r
  cross join (values ('a', 0, 0), ('b', 0, 1), ('c', 1, 0), ('d', 1, 1)) as q(k, dy, dx)
 where r.region like 'conus-%'
union all
select region, south, west, north, east
  from private.import_regions
 where region not like 'conus-%';

delete from private.import_regions where true;
insert into private.import_regions select * from private.import_regions_v2;
drop table private.import_regions_v2;

-- ---------------------------------------------------------------------------
-- Overpass mirrors and in-flight requests
-- ---------------------------------------------------------------------------
create table if not exists private.overpass_mirrors (
  url text primary key,
  priority int not null
);
insert into private.overpass_mirrors (url, priority) values
  ('https://overpass-api.de/api/interpreter', 1),
  ('https://overpass.private.coffee/api/interpreter', 2),
  ('https://maps.mail.ru/osm/tools/overpass/api/interpreter', 3)
on conflict (url) do nothing;

create table if not exists private.pending_fetches (
  request_id   bigint primary key,
  region       text not null,
  mirror       text not null,
  requested_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- "90", "NE", "0;180", "45-90" -> {90}, {45}, {0,180}, {68}
-- ---------------------------------------------------------------------------
create or replace function private.parse_directions(raw text)
returns smallint[]
language plpgsql
immutable
as $$
declare
  part text;
  m text[];
  a double precision;
  b double precision;
  res smallint[] := '{}';
  cardinals constant jsonb := '{"N":0,"NNE":22,"NE":45,"ENE":67,"E":90,"ESE":112,"SE":135,"SSE":157,
    "S":180,"SSW":202,"SW":225,"WSW":247,"W":270,"WNW":292,"NW":315,"NNW":337}';
begin
  if raw is null then return null; end if;
  foreach part in array regexp_split_to_array(upper(raw), '[;,]') loop
    part := btrim(part);
    continue when part = '';
    if cardinals ? part then
      res := res || (cardinals->>part)::smallint;
    elsif part ~ '^-?\d+(\.\d+)?\s*-\s*\d+(\.\d+)?$' then
      m := regexp_match(part, '^(-?\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$');
      a := m[1]::double precision;
      b := m[2]::double precision;
      if b < a then b := b + 360; end if;
      res := res || (round(((a + b) / 2)::numeric) % 360)::smallint;
    elsif part ~ '^-?\d+(\.\d+)?$' then
      res := res || ((round(part::numeric) % 360 + 360) % 360)::smallint;
    end if;
    exit when cardinality(res) >= 8;
  end loop;
  return nullif(res, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Start one region's Overpass request on the least-recently-failed mirror.
-- ---------------------------------------------------------------------------
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

  q := format('[out:json][timeout:60];nwr["surveillance:type"="ALPR"](%s,%s,%s,%s);out center meta;',
              r.south, r.west, r.north, r.east);
  req := net.http_get(
    url := mirror,
    params := jsonb_build_object('data', q),
    headers := jsonb_build_object('User-Agent', 'Overt/0.1 (ALPR map prototype; daily OSM import)'),
    timeout_milliseconds := 90000);
  insert into private.pending_fetches (request_id, region, mirror) values (req, p_region, mirror);
  return req;
end;
$$;

-- ---------------------------------------------------------------------------
-- Turn arrived responses into rows.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- The every-minute tick.
-- ---------------------------------------------------------------------------
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
   where coalesce(s.last_ok, '-infinity') < now() - interval '20 hours'
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

-- Old per-region edge-function jobs are replaced by the tick.
do $$
declare j record;
begin
  for j in select jobid from cron.job
            where jobname like 'osm-import-%' or jobname in ('osm-initial-import', 'osm-refresh-tick') loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('osm-refresh-tick', '* * * * *', 'select private.refresh_tick()');
end;
$$;

-- Archive points missing upstream: every current region must have imported
-- cleanly within 36 hours, and the point must not have been seen for 36 hours.
create or replace function private.archive_stale_osm_points()
returns int
language plpgsql
security definer
set search_path = private, public
as $$
declare
  missing int;
  n int;
begin
  select count(*) into missing
    from private.import_regions ir
   where not exists (select 1 from private.import_runs x
                      where x.region = ir.region and x.error is null
                        and x.finished_at > now() - interval '36 hours');
  if missing > 0 then
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
