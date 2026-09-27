-- DeCam GPS (Overt) · road alert limits.
--
-- * Each person can send 3 alerts per rolling hour and 10 per day. The count comes from
--   a small log (who + which alert, no location) so deleting or merging an alert
--   doesn't reset anyone's limit. The log is cleared after 2 days.
-- * A second report of the same thing nearby, or "Still there", never adds time: the
--   hour restarts from that moment, and no alert lasts more than 3 hours in total.
-- * You can't report the same alert twice, and votes are limited to 20 per hour.

create table if not exists private.road_alert_log (
  user_id    uuid not null,
  alert_id   bigint,
  created_at timestamptz not null default now()
);
create index if not exists road_alert_log_user_idx on private.road_alert_log (user_id, created_at desc);

create or replace function public.report_road_alert(
  p_type text, p_lat float8, p_lon float8, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  g geometry := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326);
  dist int;
  near public.road_alerts;
  a public.road_alerts;
  n_hour int;
  oldest timestamptz;
begin
  if p_type not in ('police', 'crash', 'hazard') then raise exception 'Unknown alert type.'; end if;
  dist := private.distance_m(p_user_lat, p_user_lon, p_lat, p_lon);
  if dist > 300 then
    raise exception '%', private.too_far_message('the spot you''re reporting', dist);
  end if;
  if not private.in_us(g) then raise exception 'DeCam GPS only covers the US for now.'; end if;
  -- Limit: 3 alerts per rolling hour and 10 per day per person (counting both new
  -- alerts and reports that were merged into someone else's).
  select count(*), min(created_at) into n_hour, oldest from private.road_alert_log
   where user_id = uid and created_at > now() - interval '1 hour';
  if n_hour >= 3 then
    raise exception 'You can send 3 alerts per hour. You can send another in about % min.',
      greatest(1, ceil(extract(epoch from oldest + interval '1 hour' - now()) / 60)::int);
  end if;
  if (select count(*) from private.road_alert_log
       where user_id = uid and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'You''ve reached today''s limit of 10 alerts. Thanks for helping out!';
  end if;

  -- Same kind already reported nearby? Refresh that one instead of adding a duplicate.
  select * into near from public.road_alerts
   where type = p_type and expires_at > now()
     and ST_DWithin(geom::geography, g::geography, 150)
   order by geom <-> g limit 1;
  if near.id is not null then
    if exists (select 1 from private.road_alert_log where user_id = uid and alert_id = near.id) then
      raise exception 'You already reported this one.';
    end if;
    insert into private.road_alert_log (user_id, alert_id) values (uid, near.id);
    -- Another report doesn't add time: the hour restarts from now, capped at 3 hours
    -- after the first report.
    update public.road_alerts
       set expires_at = least(now() + interval '1 hour', created_at + interval '3 hours'),
           confirm_count = confirm_count + case when user_id is distinct from uid then 1 else 0 end,
           last_confirmed_at = now()
     where id = near.id
     returning * into a;
    return private.road_alert_json(a) || jsonb_build_object('merged', true);
  end if;

  insert into public.road_alerts (type, geom, user_id) values (p_type, g, uid) returning * into a;
  insert into private.road_alert_log (user_id, alert_id) values (uid, a.id);
  return private.road_alert_json(a);
end;
$$;

create or replace function public.vote_road_alert(
  p_alert_id bigint, p_vote text, p_user_lat float8, p_user_lon float8)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  uid uuid := private.require_reporter();
  a public.road_alerts;
  dist int;
  prev text;
begin
  if p_vote not in ('still_there', 'gone') then raise exception 'Unknown vote.'; end if;
  if (select count(*) from private.road_alert_votes
       where user_id = uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That''s a lot of votes this hour. Try again a bit later.';
  end if;
  select * into a from public.road_alerts where id = p_alert_id and expires_at > now() for update;
  if not found then raise exception 'This alert has already expired.'; end if;
  dist := private.distance_m(p_user_lat, p_user_lon, ST_Y(a.geom), ST_X(a.geom));
  if dist > 1500 then
    raise exception '%', private.too_far_message('this alert', dist);
  end if;

  -- The reporter can take their own alert down; they can't vote it up.
  if a.user_id = uid then
    if p_vote = 'gone' then
      update public.road_alerts set expires_at = now() where id = a.id returning * into a;
      return jsonb_build_object('removed', true);
    end if;
    raise exception 'You reported this one. Others nearby can confirm it.';
  end if;

  -- Voting the same way twice doesn't count twice.
  select vote into prev from private.road_alert_votes where alert_id = a.id and user_id = uid;
  insert into private.road_alert_votes (alert_id, user_id, vote) values (a.id, uid, p_vote)
  on conflict (alert_id, user_id) do update set vote = excluded.vote, created_at = now();

  if p_vote = 'still_there' then
    update public.road_alerts
       set expires_at = least(now() + interval '1 hour', created_at + interval '3 hours'),
           confirm_count = confirm_count + case when prev = 'still_there' then 0 else 1 end,
           last_confirmed_at = now()
     where id = a.id returning * into a;
    return private.road_alert_json(a);
  end if;

  update public.road_alerts set gone_count = gone_count + case when prev = 'gone' then 0 else 1 end
   where id = a.id returning * into a;
  if a.gone_count >= 2 and a.gone_count > a.confirm_count then
    update public.road_alerts set expires_at = now() where id = a.id;
    return jsonb_build_object('removed', true);
  end if;
  return private.road_alert_json(a) || jsonb_build_object('noted', true);
end;
$$;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'road-alerts-cleanup' loop
    perform cron.unschedule(j.jobid);
  end loop;
  perform cron.schedule('road-alerts-cleanup', '17 * * * *',
    $c$delete from public.road_alerts where expires_at < now() - interval '1 day';
       delete from private.road_alert_log where created_at < now() - interval '2 days';
       delete from private.road_alert_votes where created_at < now() - interval '2 days'$c$);
end;
$$;
