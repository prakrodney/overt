-- DeCam GPS (Overt) · slow down invite-code farming: each code works for at most
-- 3 new people a day (on top of: one code per account, max 10 reward weeks per inviter).
-- Real protection comes with App Store accounts; anonymous accounts are cheap to make.

alter table public.reporters add column if not exists invited_at timestamptz;

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
  -- Slow down code farming: a code works for at most 3 new people a day.
  if (select count(*) from public.reporters
       where invited_by = inviter.user_id and invited_at > now() - interval '24 hours') >= 3 then
    raise exception 'That code has been used a lot today. Try again tomorrow.';
  end if;

  update public.reporters
     set invited_by = inviter.user_id,
         invited_at = now(),
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
revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
