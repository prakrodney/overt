-- The app is now called "DeCam GPS" (the code and database keep the name Overt).
-- Update the one user-facing message that named the app, without retyping the function.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'report_new_point';
  if d is not null and position('Overt only covers' in d) > 0 then
    execute replace(d, 'Overt only covers the US for now.', 'DeCam GPS only covers the US for now.');
  end if;
end $$;
