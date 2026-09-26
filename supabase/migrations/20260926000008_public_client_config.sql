-- Overt · public app settings served at runtime
--
-- Holds values that are public by design (they ship inside the app anyway),
-- such as the Mapbox *public* (pk.) token, so they don't have to live in the
-- git repository. Never store secret keys (Mapbox sk., Supabase service role) here.
--
-- Set a value (outside of migrations, so it never lands in git):
--   insert into private.public_client_config (key, value) values ('mapbox_token', 'pk....')
--   on conflict (key) do update set value = excluded.value;

create table if not exists private.public_client_config (
  key   text primary key check (key in ('mapbox_token')),
  value text not null check (value not like 'sk.%')
);

create or replace function public.get_public_config()
returns jsonb
language sql
stable
security definer
set search_path = private
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from private.public_client_config;
$$;

revoke all on function public.get_public_config() from public;
grant execute on function public.get_public_config() to anon, authenticated;
