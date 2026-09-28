-- DeCam GPS (Overt) · camera "still here?" review, invite-a-friend Pro weeks,
-- reporter badges and the Pro camera density map.

-- ---------------------------------------------------------------------------
-- 1. "People say it's gone": admins review cameras that got "gone" votes.
--    Keep  -> back on the map; it takes 2 NEW "gone" votes to remove it again.
--    Remove -> archived for good (like any moderator removal).
-- ---------------------------------------------------------------------------
alter table public.surveillance_points
  add column if not exists moderator_kept_at     timestamptz,
  add column if not exists disputes_reviewed_at  timestamptz;

do $$
declare d text;
begin
  d := pg_get_functiondef('private.recompute_confidence(bigint)'::regprocedure);
  if position('moderator_kept_at' in d) = 0 then
    d := replace(d,
      $a$status = case when gone_people >= 2 and gone_w > confirm_w then 'archived' else status end,$a$,
      $b$status = case when gone_people >= 2 and gone_w > confirm_w
                           and (p.moderator_kept_at is null
                                or (select count(distinct r2.user_id) from public.reports r2
                                     where r2.point_id = p_point and r2.type = 'gone'
                                       and r2.created_at > p.moderator_kept_at) >= 2)
                      then 'archived' else status end,$b$);
    if position('moderator_kept_at' in d) = 0 then
      raise exception 'recompute_confidence did not look as expected';
    end if;
    execute d;
  end if;
end $$;

create or replace function private.disputed_points()
returns setof public.surveillance_points
language sql
stable
security definer
set search_path = private, public
as $$
  select p.*
    from public.surveillance_points p
   where p.moderator_removed_at is null
     and exists (
       select 1 from public.reports r
        where r.point_id = p.id and r.type = 'gone'
          and r.created_at > now() - interval '30 days'
          and r.created_at > coalesce(p.disputes_reviewed_at, '-infinity'::timestamptz));
$$;
revoke all on function private.disputed_points() from public, anon, authenticated;

create or replace function public.admin_list_disputed()
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, extensions
as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'category', p.category,
             'status', p.status,
             'source', p.source,
             'operator', p.operator,
             'lat', ST_Y(p.geom),
             'lon', ST_X(p.geom),
             'gone_votes', (select count(distinct r.user_id) from public.reports r
                             where r.point_id = p.id and r.type = 'gone'
                               and r.created_at > now() - interval '180 days'),
             'still_there_votes', (select count(distinct r.user_id) from public.reports r
                                    where r.point_id = p.id and r.type = 'confirm'
                                      and r.created_at > now() - interval '180 days'),
             'last_gone_at', (select max(r.created_at) from public.reports r
                               where r.point_id = p.id and r.type = 'gone'))
           order by p.id)
      from private.disputed_points() p
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_resolve_disputed(p_point_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  if not exists (select 1 from public.surveillance_points where id = p_point_id) then
    raise exception 'Camera not found.';
  end if;
  if p_action = 'remove' then
    update public.surveillance_points
       set status = 'archived', moderator_removed_at = now(), disputes_reviewed_at = now(), updated_at = now()
     where id = p_point_id;
  elsif p_action = 'keep' then
    update public.surveillance_points
       set status = 'active', moderator_kept_at = now(), disputes_reviewed_at = now(), updated_at = now()
     where id = p_point_id;
    perform private.recompute_confidence(p_point_id);
  else
    raise exception 'Use keep or remove.';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- The Review button's count now includes disputed cameras.
create or replace function public.admin_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public
as $$
begin
  if not private.is_admin() then
    return jsonb_build_object('is_admin', false);
  end if;
  return jsonb_build_object(
    'is_admin', true,
    'pending', (select count(*) from public.reports where status = 'pending')
             + (select count(*) from private.disputed_points()));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Invite a friend: both people get a free week of Pro.
--    Each account can use one code, ever. An inviter earns at most 10 weeks.
-- ---------------------------------------------------------------------------
alter table public.reporters
  add column if not exists invite_code    text unique,
  add column if not exists invited_by     uuid,
  add column if not exists invite_rewards integer not null default 0,
  add column if not exists pro_until      timestamptz;

create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = private, public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.reporters where invite_code = c);
  end loop;
  return c;
end;
$$;

-- Your invite code (made on first use), how many friends joined, and any Pro time you've earned.
create or replace function public.my_invite()
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  uid uuid := private.require_reporter();
  r public.reporters;
begin
  update public.reporters set invite_code = private.new_invite_code()
   where user_id = uid and invite_code is null;
  select * into r from public.reporters where user_id = uid;
  return jsonb_build_object(
    'code', r.invite_code,
    'friends', r.invite_rewards,
    'used_code', r.invited_by is not null,
    'pro_until', r.pro_until);
end;
$$;

-- Pro time earned from invites (read at app start; creates nothing).
create or replace function public.my_pro_grant()
returns jsonb
language sql
stable
security definer
set search_path = private, public
as $$
  select jsonb_build_object('pro_until', (select pro_until from public.reporters where user_id = auth.uid()));
$$;

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare
  uid uuid := private.require_reporter();
  me public.reporters;
  inviter public.reporters;
  wk interval := interval '7 days';
begin
  select * into me from public.reporters where user_id = uid for update;
  if me.invited_by is not null then
    raise exception 'You''ve already used an invite code on this phone.';
  end if;
  select * into inviter from public.reporters
   where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
   for update;
  if not found then raise exception 'That code doesn''t match anyone. Check the letters and try again.'; end if;
  if inviter.user_id = uid then raise exception 'That''s your own code. Send it to a friend instead!'; end if;

  update public.reporters
     set invited_by = inviter.user_id,
         pro_until = greatest(coalesce(pro_until, now()), now()) + wk
   where user_id = uid;
  if inviter.invite_rewards < 10 then
    update public.reporters
       set invite_rewards = invite_rewards + 1,
           pro_until = greatest(coalesce(pro_until, now()), now()) + wk
     where user_id = inviter.user_id;
  end if;
  return jsonb_build_object('ok', true,
    'pro_until', (select pro_until from public.reporters where user_id = uid));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reporter badges: counts of what you've added to the map.
-- ---------------------------------------------------------------------------
create index if not exists road_alerts_user_idx on public.road_alerts (user_id);

create or replace function public.my_contributions()
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('cameras', 0, 'accepted', 0, 'confirms', 0, 'gone', 0, 'alerts', 0, 'trust', 10, 'friends', 0);
  end if;
  return jsonb_build_object(
    'cameras',  (select count(*) from public.reports where user_id = uid and type = 'new'),
    'accepted', (select count(*) from public.reports where user_id = uid and type = 'new' and status = 'accepted'),
    'confirms', (select count(*) from public.reports where user_id = uid and type = 'confirm'),
    'gone',     (select count(*) from public.reports where user_id = uid and type = 'gone'),
    'alerts',   (select count(*) from public.road_alerts where user_id = uid),
    'trust',    coalesce((select trust_score from public.reporters where user_id = uid), 10),
    'friends',  coalesce((select invite_rewards from public.reporters where user_id = uid), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Camera density (Pro map layer): plate readers per grid square in view.
--    Returns [[south, west, count], ...] for squares `cell` degrees wide (the app
--    computes the same square size: max(cell, 0.005, width/45, height/45)).
-- ---------------------------------------------------------------------------
create or replace function public.get_camera_density(
  min_lon float8, min_lat float8, max_lon float8, max_lat float8, cell float8)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  with c as (
    -- At most ~45 x 45 squares, and never smaller than ~500 m.
    select greatest(cell, 0.005, (max_lon - min_lon) / 45.0, (max_lat - min_lat) / 45.0) as s
  )
  select coalesce(jsonb_agg(jsonb_build_array(
           round((gy * c.s)::numeric, 5), round((gx * c.s)::numeric, 5), n)), '[]'::jsonb)
    from c,
    lateral (
      select floor(ST_X(p.geom) / c.s) as gx, floor(ST_Y(p.geom) / c.s) as gy, count(*) as n
        from public.surveillance_points p
       where p.status = 'active' and p.category = 'alpr'
         and p.geom && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
       group by 1, 2
       limit 2500
    ) g;
$$;

revoke all on function public.admin_list_disputed() from public, anon;
revoke all on function public.admin_resolve_disputed(bigint, text) from public, anon;
revoke all on function public.my_invite() from public, anon;
revoke all on function public.my_pro_grant() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.my_contributions() from public, anon;
grant execute on function public.admin_list_disputed() to authenticated;
grant execute on function public.admin_resolve_disputed(bigint, text) to authenticated;
grant execute on function public.my_invite() to authenticated;
grant execute on function public.my_pro_grant() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.my_contributions() to authenticated;
grant execute on function public.get_camera_density(float8, float8, float8, float8, float8) to anon, authenticated;
revoke all on function private.new_invite_code() from public, anon, authenticated;
