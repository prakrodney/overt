-- Keep timing notes on each import run.
alter table private.import_runs add column if not exists note text;

drop function if exists public.log_import_run(text, int, int, text);
create or replace function public.log_import_run(
  p_region text, p_fetched int, p_upserted int, p_error text, p_note text default null)
returns void
language sql
security definer
set search_path = private
as $$
  insert into private.import_runs (region, fetched, upserted, error, note, finished_at)
  values (p_region, p_fetched, p_upserted, p_error, p_note, now());
$$;
revoke all on function public.log_import_run(text, int, int, text, text) from public, anon, authenticated;
grant execute on function public.log_import_run(text, int, int, text, text) to service_role;
