-- DeCam GPS (Overt) · badges also count "Still there" / "Not there" answers on
-- police, crash and object reports (the pop-up after you pass one).
-- Old alerts (and their votes) are deleted a day after they expire, so keep a running
-- total on the reporter instead of counting rows.

alter table public.reporters add column if not exists alert_votes_total integer not null default 0;

update public.reporters r
   set alert_votes_total = v.n
  from (select user_id, count(*) as n from private.road_alert_votes group by user_id) v
 where v.user_id = r.user_id;

create or replace function private.count_alert_vote()
returns trigger
language plpgsql
security definer
set search_path = private, public
as $$
begin
  update public.reporters set alert_votes_total = alert_votes_total + 1 where user_id = new.user_id;
  return new;
end;
$$;
drop trigger if exists count_alert_vote on private.road_alert_votes;
create trigger count_alert_vote after insert on private.road_alert_votes
  for each row execute function private.count_alert_vote();
revoke all on function private.count_alert_vote() from public, anon, authenticated;

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
    return jsonb_build_object('cameras', 0, 'accepted', 0, 'confirms', 0, 'gone', 0, 'alerts', 0,
                              'alert_votes', 0, 'trust', 10, 'friends', 0);
  end if;
  return jsonb_build_object(
    'cameras',     (select count(*) from public.reports where user_id = uid and type = 'new'),
    'accepted',    (select count(*) from public.reports where user_id = uid and type = 'new' and status = 'accepted'),
    'confirms',    (select count(*) from public.reports where user_id = uid and type = 'confirm'),
    'gone',        (select count(*) from public.reports where user_id = uid and type = 'gone'),
    'alerts',      (select count(*) from public.road_alerts where user_id = uid),
    'alert_votes', coalesce((select alert_votes_total from public.reporters where user_id = uid), 0),
    'trust',       coalesce((select trust_score from public.reporters where user_id = uid), 10),
    'friends',     coalesce((select invite_rewards from public.reporters where user_id = uid), 0));
end;
$$;
revoke all on function public.my_contributions() from public, anon;
grant execute on function public.my_contributions() to authenticated;
