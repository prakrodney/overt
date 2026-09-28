-- DeCam GPS (Overt) · red-light cameras (Pro layer).
-- OSM nodes tagged enforcement=traffic_signals (and not ALPR) are stored with
-- category 'red_light'. Route lookups mark them with 2 in the 5th element
-- (0 = plate reader, 1 = speed camera, 2 = red-light camera). They can be reported.
-- Applied as in-place text replacements of the live functions (like 0014), and
-- every region re-imports once (regions last imported before 2026-09-27 23:07 UTC).
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef('private.start_region_fetch(text)'::regprocedure) into d;
  n := replace(d, $a$node["highway"="speed_camera"](%1$s,%2$s,%3$s,%4$s););$a$,
                  $b$node["highway"="speed_camera"](%1$s,%2$s,%3$s,%4$s);node["enforcement"="traffic_signals"](%1$s,%2$s,%3$s,%4$s););$b$);
  if n <> d then execute n; end if;

  select pg_get_functiondef('private.process_fetches()'::regprocedure) into d;
  n := replace(d, $a$when e->'tags'->>'highway' = 'speed_camera' then 'speed_camera'$a$,
                  $b$when e->'tags'->>'highway' = 'speed_camera' then 'speed_camera'
                                when e->'tags'->>'enforcement' = 'traffic_signals' then 'red_light'$b$);
  if n <> d then execute n; end if;

  select pg_get_functiondef('public.get_cameras_in_boxes(jsonb,integer)'::regprocedure) into d;
  n := replace(d, $a$case when category = 'speed_camera' then 1 else 0 end$a$,
                  $b$case when category = 'speed_camera' then 1 when category = 'red_light' then 2 else 0 end$b$);
  if n <> d then execute n; end if;

  select pg_get_functiondef('public.report_new_point(float8,float8,integer,float8,float8,text)'::regprocedure) into d;
  n := replace(d, $a$p_category not in ('alpr', 'speed_camera')$a$, $b$p_category not in ('alpr', 'speed_camera', 'red_light')$b$);
  if n <> d then execute n; end if;

  select pg_get_functiondef('private.refresh_tick()'::regprocedure) into d;
  n := replace(d, $a$timestamptz '2026-09-27 04:55:00+00'$a$, $b$timestamptz '2026-09-27 23:07:00+00'$b$);
  if n <> d then execute n; end if;
end
$mig$;
