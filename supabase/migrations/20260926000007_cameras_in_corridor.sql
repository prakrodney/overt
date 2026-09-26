-- Overt · camera points for route previews
--
-- The app counts documented cameras along each route ON THE DEVICE. It asks
-- only for the cameras inside a handful of coarse boxes (~20 km) around the
-- routes, never for the route itself, so trips don't reach the server.
-- Returns compact rows: [[id, lat, lon, direction_deg], ...].

create or replace function public.get_cameras_in_boxes(boxes jsonb, max_count int default 20000)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with b as (
    select ST_MakeEnvelope((x->>0)::float8, (x->>1)::float8, (x->>2)::float8, (x->>3)::float8, 4326) as env
      from jsonb_array_elements(boxes) x
     limit 200
  ),
  pts as (
    select distinct on (p.id) p.id, p.geom, p.direction_deg
      from b
      join public.surveillance_points p on p.geom && b.env
     where p.status = 'active'
     limit least(greatest(max_count, 1), 50000)
  )
  select coalesce(jsonb_agg(jsonb_build_array(id, round(ST_Y(geom)::numeric, 6), round(ST_X(geom)::numeric, 6), direction_deg)), '[]'::jsonb)
    from pts;
$$;

grant execute on function public.get_cameras_in_boxes(jsonb, int) to anon, authenticated;
