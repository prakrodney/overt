-- DeCam GPS (Overt) · in-app review of flagged reports, for admins only.
--
-- Who is an admin: private.admins lists account ids. An account becomes an admin by
-- redeeming a one-time code (only its SHA-256 hash is stored) with public.claim_admin.
-- The owner types the code into the app's search bar. Codes are made in the SQL editor:
--   insert into private.admin_codes (code_hash) values (encode(extensions.digest('<code>', 'sha256'), 'hex'));
--
-- What the review screen does (public.admin_moderate):
--   new camera  · approve -> report accepted, reporter trust +5
--               · reject  -> report rejected, camera archived, reporter trust -10
--   issue       · remove camera -> report accepted, camera archived (and kept archived
--                                  even if OpenStreetMap still lists it)
--               · keep camera   -> report rejected

create table if not exists private.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists private.admin_codes (
  code_hash  text primary key,
  created_at timestamptz not null default now(),
  used_by    uuid,
  used_at    timestamptz
);

-- Cameras removed by a moderator stay removed, whatever the OSM import says.
alter table public.surveillance_points add column if not exists moderator_removed_at timestamptz;

create or replace function private.keep_moderator_removed()
returns trigger
language plpgsql
as $$
begin
  if new.moderator_removed_at is not null and new.status = 'active' then
    new.status := 'archived';
  end if;
  return new;
end;
$$;
drop trigger if exists keep_moderator_removed on public.surveillance_points;
create trigger keep_moderator_removed
  before insert or update on public.surveillance_points
  for each row execute function private.keep_moderator_removed();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (select 1 from private.admins where user_id = auth.uid());
$$;

-- Redeem a one-time admin code (typed into the search bar).
create or replace function public.claim_admin(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions
as $$
declare
  uid uuid := private.require_reporter();
  h text := encode(extensions.digest(trim(p_code), 'sha256'), 'hex');
begin
  update private.admin_codes set used_by = uid, used_at = now()
   where code_hash = h and used_by is null;
  if not found then
    raise exception 'That code isn''t valid (or was already used).';
  end if;
  insert into private.admins (user_id) values (uid) on conflict do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- Is this phone an admin, and how many reports are waiting?
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
    'pending', (select count(*) from public.reports where status = 'pending'));
end;
$$;

-- Pending reports, oldest first, with the camera they're about.
create or replace function public.admin_list_reports()
returns jsonb
language plpgsql
stable
security definer
set search_path = private, public, extensions
as $$
begin
  if not private.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'created_at'))
      from (
        select jsonb_build_object(
          'id',               r.id,
          'type',             r.type,
          'created_at',       r.created_at,
          'note',             r.payload->>'note',
          'direction_deg',    (r.payload->>'direction_deg')::int,
          'reporter_trust',   rp.trust_score,
          'reporter_reports', (select count(*) from public.reports r2 where r2.user_id = r.user_id),
          'lat',              ST_Y(coalesce(p.geom, r.geom)),
          'lon',              ST_X(coalesce(p.geom, r.geom)),
          'point', case when p.id is null then null else jsonb_build_object(
             'id', p.id, 'source', p.source, 'status', p.status,
             'confidence_level', p.confidence_level, 'confirm_count', p.confirm_count,
             'gone_count', p.gone_count, 'directions_deg', p.directions_deg,
             'operator', p.operator, 'osm_type', p.osm_type, 'osm_id', p.osm_id) end
        ) as x
          from public.reports r
          left join public.reporters rp on rp.user_id = r.user_id
          left join public.surveillance_points p on p.id = r.point_id
         where r.status = 'pending'
         order by r.created_at
         limit 200
      ) q
  ), '[]'::jsonb);
end;
$$;

-- Decide on one report.
create or replace function public.admin_moderate(p_report_id bigint, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = private, public
as $$
declare r public.reports;
begin
  if not private.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  select * into r from public.reports where id = p_report_id for update;
  if not found then raise exception 'Report not found.'; end if;
  if r.status <> 'pending' then raise exception 'Someone already decided on this report.'; end if;

  if r.type = 'new' then
    if p_action = 'approve' then
      update public.reports set status = 'accepted' where id = r.id;
      update public.reporters set trust_score = least(100, trust_score + 5) where user_id = r.user_id;
      if r.point_id is not null then perform private.recompute_confidence(r.point_id); end if;
    elsif p_action = 'reject' then
      update public.reports set status = 'rejected' where id = r.id;
      update public.surveillance_points
         set status = 'archived', moderator_removed_at = now(), updated_at = now()
       where id = r.point_id;
      update public.reporters set trust_score = greatest(0, trust_score - 10) where user_id = r.user_id;
    else
      raise exception 'Use approve or reject for a new camera.';
    end if;
  else
    if p_action = 'remove_camera' then
      update public.reports set status = 'accepted' where id = r.id;
      update public.surveillance_points
         set status = 'archived', moderator_removed_at = now(), updated_at = now()
       where id = r.point_id;
      update public.reporters set trust_score = least(100, trust_score + 5) where user_id = r.user_id;
      -- Other open reports about the same camera are settled too.
      update public.reports set status = 'accepted'
       where point_id = r.point_id and status = 'pending' and id <> r.id;
    elsif p_action = 'keep_camera' then
      update public.reports set status = 'rejected' where id = r.id;
    else
      raise exception 'Use remove_camera or keep_camera for an issue report.';
    end if;
  end if;
  return jsonb_build_object('ok', true,
    'pending', (select count(*) from public.reports where status = 'pending'));
end;
$$;

revoke all on function public.claim_admin(text) from public, anon;
revoke all on function public.admin_status() from public, anon;
revoke all on function public.admin_list_reports() from public, anon;
revoke all on function public.admin_moderate(bigint, text) from public, anon;
grant execute on function public.claim_admin(text) to authenticated;
grant execute on function public.admin_status() to authenticated;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_moderate(bigint, text) to authenticated;
revoke all on function private.is_admin() from public, anon;
