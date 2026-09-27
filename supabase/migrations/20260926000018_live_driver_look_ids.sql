-- DeCam GPS (Overt) · avatar ids are now "character__accessory__ride_color"
-- (e.g. "cloudy__headphones__monster_purple"), so allow up to 48 characters.
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef('public.update_live_position(uuid,text,float8,float8,integer)'::regprocedure) into d;
  n := replace(d, $a$'^[a-z0-9_]{1,24}$'$a$, $b$'^[a-z0-9_]{1,48}$'$b$);
  if n = d then raise exception 'update_live_position unchanged'; end if;
  execute n;
end
$mig$;
