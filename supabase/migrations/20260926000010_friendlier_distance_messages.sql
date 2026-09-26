-- Overt · friendlier "too far away" messages (feet / miles instead of raw metres)

create or replace function private.distance_text(m integer)
returns text
language sql
immutable
as $$
  select case
    when m < 1609 then to_char(round(m * 3.28084 / 50) * 50, 'FM999,999') || ' ft'
    when m < 16093 then to_char(m / 1609.344, 'FM990.0') || ' miles'
    else to_char(round(m / 1609.344), 'FM999,999') || ' miles'
  end;
$$;

create or replace function private.too_far_message(what text, m integer)
returns text
language sql
immutable
set search_path = private
as $$
  select format('You need to be within about 1,000 ft (300 m) of %s. You''re about %s away.',
                what, private.distance_text(m));
$$;

-- Same functions as migration 0009, with the new messages.
create or replace function public.vote_on_point(
  p_point_id bigint, p_verdict text, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  p public.surveillance_points;
  dist int;
begin
  if p_verdict not in ('confirm', 'gone') then raise exception 'Unknown vote'; end if;
  select * into p from public.surveillance_points where id = p_point_id and status = 'active';
  if not found then raise exception 'This camera is no longer on the map.'; end if;
  if p.reported_by = uid then raise exception 'You reported this one, so someone else needs to confirm it.'; end if;

  dist := private.distance_m(p_user_lat, p_user_lon, ST_Y(p.geom), ST_X(p.geom));
  if dist > 300 then
    raise exception '%', private.too_far_message('the camera', dist);
  end if;
  if exists (select 1 from public.reports where user_id = uid and point_id = p_point_id
               and type in ('confirm', 'gone') and created_at > now() - interval '24 hours') then
    raise exception 'You already voted on this camera today. Thanks!';
  end if;
  if (select count(*) from public.reports where user_id = uid and created_at > now() - interval '24 hours') >= 50 then
    raise exception 'Daily limit reached. Try again tomorrow.';
  end if;

  insert into public.reports (point_id, user_id, type, geom, reporter_distance_m)
  values (p_point_id, uid, p_verdict, p.geom, dist);

  if p_verdict = 'confirm' then
    update public.surveillance_points set last_confirmed_at = now(), last_verified_at = now()
     where id = p_point_id;
  end if;
  perform private.recompute_confidence(p_point_id);

  select * into p from public.surveillance_points where id = p_point_id;
  return jsonb_build_object('status', p.status, 'confidence_level', p.confidence_level,
                            'confirm_count', p.confirm_count);
end;
$$;

create or replace function public.report_new_point(
  p_lat float8, p_lon float8, p_direction_deg integer, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  dist int;
  g geometry := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  near_id bigint;
  new_id bigint;
  trust int;
begin
  dist := private.distance_m(p_user_lat, p_user_lon, p_lat, p_lon);
  if dist > 300 then
    raise exception '%', private.too_far_message('the spot you''re reporting', dist);
  end if;
  if not private.in_us(g) then raise exception 'Overt only covers the US for now.'; end if;
  if (select count(*) from public.reports where user_id = uid and type = 'new'
        and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You''ve reported 10 cameras today, the daily limit. Thanks for helping!';
  end if;

  -- Already on the map within 25 m? Count it as a confirmation instead.
  select id into near_id from public.surveillance_points
   where status = 'active' and ST_DWithin(geom::geography, g::geography, 25)
   order by geom <-> g limit 1;
  if near_id is not null then
    begin
      return public.vote_on_point(near_id, 'confirm', p_user_lat, p_user_lon)
             || jsonb_build_object('merged_into', near_id);
    exception when others then
      return jsonb_build_object('merged_into', near_id, 'note', SQLERRM);
    end;
  end if;

  select trust_score into trust from public.reporters where user_id = uid;
  insert into public.surveillance_points
    (geom, category, source, confidence_level, confidence_score, directions_deg, reported_by, status)
  values
    (g, 'alpr', 'community', 'needs_confirmation', 25 + coalesce(trust, 10) / 5,
     case when p_direction_deg is null then null else array[((p_direction_deg % 360 + 360) % 360)::smallint] end,
     uid, 'active')
  returning id into new_id;

  insert into public.reports (point_id, user_id, type, geom, reporter_distance_m, payload, status)
  values (new_id, uid, 'new', g, dist, jsonb_build_object('direction_deg', p_direction_deg),
          -- low-trust reporters' reports are listed for review; the point still shows as "Needs confirmation"
          case when coalesce(trust, 10) < 30 then 'pending' else 'accepted' end);

  perform private.recompute_confidence(new_id);
  return jsonb_build_object('point_id', new_id);
end;
$$;
