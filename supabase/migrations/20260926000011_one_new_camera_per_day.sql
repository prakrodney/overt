-- Overt · limit new camera reports to one per person per 24 hours
-- (was 10/day). Confirming or flagging existing cameras keeps its own limits.

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
  last_new timestamptz;
begin
  dist := private.distance_m(p_user_lat, p_user_lon, p_lat, p_lon);
  if dist > 300 then
    raise exception '%', private.too_far_message('the spot you''re reporting', dist);
  end if;
  if not private.in_us(g) then raise exception 'Overt only covers the US for now.'; end if;
  -- One new camera per person per 24 hours (keeps pranksters from flooding the map).
  select max(created_at) into last_new from public.reports
   where user_id = uid and type = 'new' and created_at > now() - interval '24 hours';
  if last_new is not null then
    raise exception 'You can add one new camera per day. You can add another in about %.',
      case when last_new + interval '24 hours' - now() > interval '1 hour'
           then ceil(extract(epoch from last_new + interval '24 hours' - now()) / 3600)::int || ' hours'
           else 'an hour' end;
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
