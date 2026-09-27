-- DeCam GPS (Overt) · "Drive with others" was dropped: remove its table, functions and cleanup job.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'live-drivers-cleanup' loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;
drop function if exists public.update_live_position(uuid, text, float8, float8, integer);
drop function if exists public.clear_live_position();
drop function if exists public.get_live_drivers(float8, float8, float8, float8, uuid);
drop table if exists public.live_drivers;
