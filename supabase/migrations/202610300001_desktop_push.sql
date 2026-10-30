-- Optional browser push. Inbox rows remain the source of truth.
create table public.desktop_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 2048),
  p256dh text not null,
  auth_key text not null,
  language text not null default 'en' check (language in ('en','zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index desktop_push_user_idx on public.desktop_push_subscriptions(user_id);
create table public.desktop_push_presence (
  subscription_id uuid not null references public.desktop_push_subscriptions(id) on delete cascade,
  tab_id uuid not null,
  route text not null check (char_length(route) <= 1000),
  inbox_open boolean not null default false,
  seen_at timestamptz not null default now(),
  primary key(subscription_id,tab_id)
);
create table public.desktop_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.desktop_push_subscriptions(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete cascade,
  announcement_id uuid references public.public_announcements(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','sending','sent','skipped','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  created_at timestamptz not null default now(),
  constraint desktop_push_one_source check (num_nonnulls(notification_id,announcement_id)=1),
  unique(subscription_id,notification_id),
  unique(subscription_id,announcement_id)
);
create index desktop_push_pending_idx on public.desktop_push_deliveries(available_at) where state in ('pending','sending');
alter table public.desktop_push_subscriptions enable row level security;
alter table public.desktop_push_presence enable row level security;
alter table public.desktop_push_deliveries enable row level security;
revoke all on public.desktop_push_subscriptions,public.desktop_push_presence,public.desktop_push_deliveries from public,anon,authenticated;
grant all on public.desktop_push_subscriptions,public.desktop_push_presence,public.desktop_push_deliveries to service_role;

-- No client table access. These narrow RPCs derive the user AND session from auth.
create function public.register_desktop_push(p_subscription jsonb,p_expected_user uuid,p_language text default 'en') returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); sid uuid := (auth.jwt()->>'session_id')::uuid; result uuid;
  v_endpoint text := p_subscription->>'endpoint';
  key_p text := p_subscription->'keys'->>'p256dh'; key_a text := p_subscription->'keys'->>'auth';
begin
  if uid is null or uid is distinct from p_expected_user or not exists(select 1 from auth.sessions where id=sid and user_id=uid) then raise exception 'Authentication required'; end if;
  -- Strict provider allowlist prevents SSRF in the delivery worker, including URL credentials and custom ports.
  if v_endpoint is null or length(v_endpoint)>2048 or v_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$'
    or key_p is null or key_p !~ '^[A-Za-z0-9_-]{87}=?$' or key_a is null or key_a !~ '^[A-Za-z0-9_-]{22}(==)?$'
    then raise exception 'Invalid push subscription'; end if;
  -- Serialize the small per-account subscription limit.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if (select count(*) from public.desktop_push_subscriptions where user_id=uid)>=10
    and not exists(select 1 from public.desktop_push_subscriptions s where s.endpoint=v_endpoint and s.user_id=uid)
    then raise exception 'Browser subscription limit reached'; end if;
  insert into public.desktop_push_subscriptions as s(user_id,session_id,endpoint,p256dh,auth_key,language)
  values(uid,sid,v_endpoint,key_p,key_a,case when p_language='zh' then 'zh' else 'en' end)
  on conflict(endpoint) do update set session_id=excluded.session_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,language=excluded.language,updated_at=now()
  where s.user_id=uid returning id into result;
  if result is null then raise exception 'Subscription belongs to another account'; end if;
  return result;
end $$;
create function public.remove_desktop_push(p_id uuid) returns void
language sql security definer set search_path='' as $$
  delete from public.desktop_push_subscriptions where id=p_id and user_id=auth.uid();
$$;
create function public.touch_desktop_push(p_id uuid,p_tab_id uuid,p_route text,p_visible boolean,p_inbox_open boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.desktop_push_subscriptions where id=p_id and user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid) then return; end if;
  delete from public.desktop_push_presence where seen_at<now()-interval '2 minutes';
  if not p_visible then
    delete from public.desktop_push_presence where subscription_id=p_id and tab_id=p_tab_id;
  else
    insert into public.desktop_push_presence(subscription_id,tab_id,route,inbox_open)
    values(p_id,p_tab_id,left(p_route,1000),p_inbox_open)
    on conflict(subscription_id,tab_id) do update set route=excluded.route,inbox_open=excluded.inbox_open,seen_at=now();
  end if;
end $$;
revoke all on function public.register_desktop_push(jsonb,uuid,text),public.remove_desktop_push(uuid),public.touch_desktop_push(uuid,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.register_desktop_push(jsonb,uuid,text),public.remove_desktop_push(uuid),public.touch_desktop_push(uuid,uuid,text,boolean,boolean) to authenticated;

create function public.enqueue_desktop_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.is_read or new.actor_id=new.recipient_id or new.created_at<now()-interval '5 minutes'
    or (new.target_type='club_message' and new.type<>'mention')
    or new.type in ('club_message','club_notice','group_notice') or new.target_type in ('club_notice','group_notice') then return new; end if;
  insert into public.desktop_push_deliveries(subscription_id,notification_id)
    select id,new.id from public.desktop_push_subscriptions where user_id=new.recipient_id
    on conflict(subscription_id,notification_id) do nothing;
  return new;
end $$;
create trigger enqueue_desktop_push after insert on public.notifications for each row execute function public.enqueue_desktop_push();
revoke all on function public.enqueue_desktop_push() from public,anon,authenticated;

create table public.desktop_push_installation (singleton boolean primary key default true check(singleton), installed_at timestamptz not null default now());
insert into public.desktop_push_installation(singleton) values(true);
alter table public.desktop_push_installation enable row level security;
revoke all on public.desktop_push_installation from public,anon,authenticated;
grant select on public.desktop_push_installation to service_role;

-- Worker runs on a schedule. It also picks up newly active public inbox announcements.
-- Existing announcements and later opt-ins are never backfilled into desktop alerts.
create function public.claim_desktop_push(p_limit integer default 20) returns setof public.desktop_push_deliveries
language plpgsql security definer set search_path='' as $$
begin
  insert into public.desktop_push_deliveries(subscription_id,announcement_id)
    select s.id,a.id from public.public_announcements a join public.desktop_push_subscriptions s
      on s.created_at<=greatest(a.created_at,a.starts_at) and s.user_id is distinct from a.created_by
    where a.is_active and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
      and greatest(a.created_at,a.starts_at)>now()-interval '1 day'
      and greatest(a.created_at,a.starts_at)>=(select installed_at from public.desktop_push_installation)
      and not exists(select 1 from public.public_announcement_reads r where r.announcement_id=a.id and r.user_id=s.user_id)
    on conflict(subscription_id,announcement_id) do nothing;
  update public.desktop_push_deliveries set state='failed' where state in ('pending','sending') and (created_at<now()-interval '1 day' or (attempts>=5 and available_at<=now()));
  delete from public.desktop_push_deliveries where created_at<now()-interval '7 days';
  return query with selected as (
    select id from public.desktop_push_deliveries where state in ('pending','sending') and available_at<=now() and attempts<5
    order by available_at for update skip locked limit least(greatest(p_limit,1),20)
  ) update public.desktop_push_deliveries d set state='sending',attempts=d.attempts+1,lease_token=gen_random_uuid(),available_at=now()+interval '5 minutes'
    from selected where d.id=selected.id returning d.*;
end $$;

-- Recheck authorization, read state, and announcement visibility immediately before delivery.
create function public.desktop_push_context(p_delivery_id uuid,p_lease_token uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('subscription',to_jsonb(s),'notification',case when n.id is not null then to_jsonb(n) else jsonb_build_object('id',a.id,'type','admin_announcement','target_url',a.target_url) end,
    'actor_name',coalesce(nullif(p.full_name,''),nullif(p.username,'')),
    'presence',coalesce((select jsonb_agg(jsonb_build_object('route',v.route,'inbox_open',v.inbox_open))
      from public.desktop_push_presence v join public.desktop_push_subscriptions vs on vs.id=v.subscription_id
      where vs.user_id=s.user_id and v.seen_at>now()-interval '60 seconds'),'[]'::jsonb))
  from public.desktop_push_deliveries d join public.desktop_push_subscriptions s on s.id=d.subscription_id
  join auth.sessions session on session.id=s.session_id and session.user_id=s.user_id
  left join public.notifications n on n.id=d.notification_id and n.recipient_id=s.user_id
  left join public.profiles p on p.id=n.actor_id
  left join public.public_announcements a on a.id=d.announcement_id
  where d.id=p_delivery_id and d.lease_token=p_lease_token and d.state='sending'
    and (session.not_after is null or session.not_after>now())
    and ((n.id is not null and not n.is_read and n.actor_id is distinct from s.user_id)
      or (a.id is not null and a.is_active and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) and a.created_by is distinct from s.user_id
        and not exists(select 1 from public.public_announcement_reads r where r.announcement_id=a.id and r.user_id=s.user_id)));
$$;
revoke all on function public.claim_desktop_push(integer),public.desktop_push_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_desktop_push(integer),public.desktop_push_context(uuid,uuid) to service_role;
