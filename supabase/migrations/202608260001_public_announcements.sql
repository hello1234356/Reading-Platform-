-- Store public announcements once, with sparse per-user read state. Personal
-- notifications remain recipient-specific in public.notifications.

create table if not exists public.public_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  target_url text check (
    target_url is null
    or (char_length(target_url) <= 500 and target_url like '/%' and target_url not like '//%')
  ),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  legacy_broadcast_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_announcements_valid_window check (
    ends_at is null or ends_at > starts_at
  )
);

create table if not exists public.public_announcement_reads (
  announcement_id uuid not null
    references public.public_announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists public_announcements_visibility_idx
on public.public_announcements(is_active, starts_at, ends_at);

create index if not exists public_announcement_reads_user_idx
on public.public_announcement_reads(user_id, announcement_id);

-- Keep this migration independent of historical helper functions. Some remote
-- projects were initialized from an older schema snapshot that does not have
-- public.set_updated_at().
create or replace function public.set_public_announcement_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_public_announcement_updated_at()
from public, anon, authenticated;

drop trigger if exists public_announcements_set_updated_at
on public.public_announcements;
create trigger public_announcements_set_updated_at
before update on public.public_announcements
for each row execute function public.set_public_announcement_updated_at();

alter table public.public_announcements enable row level security;
alter table public.public_announcement_reads enable row level security;

revoke all on table public.public_announcements from anon, authenticated;
revoke all on table public.public_announcement_reads from anon, authenticated;
grant select on table public.public_announcements to authenticated;
grant select, insert, update on table public.public_announcement_reads to authenticated;

create policy "Users read visible public announcements"
on public.public_announcements for select to authenticated
using (
  public.is_admin()
  or (
    is_active
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  )
);

create policy "Users read own public announcement state"
on public.public_announcement_reads for select to authenticated
using (user_id = auth.uid());

create policy "Users create own public announcement state"
on public.public_announcement_reads for insert to authenticated
with check (user_id = auth.uid());

create policy "Users update own public announcement state"
on public.public_announcement_reads for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.save_public_announcement(
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_target_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean
)
returns public.public_announcements
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_body text := nullif(btrim(coalesce(p_body, '')), '');
  normalized_target text := nullif(btrim(coalesce(p_target_url, '')), '');
  visible_from timestamptz := coalesce(p_starts_at, now());
  saved public.public_announcements%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can manage public announcements.';
  end if;
  if normalized_title is null or char_length(normalized_title) > 180 then
    raise exception 'Announcement title must contain 1 to 180 characters.';
  end if;
  if normalized_body is null or char_length(normalized_body) > 1000 then
    raise exception 'Announcement message must contain 1 to 1000 characters.';
  end if;
  if normalized_target is not null and (
    char_length(normalized_target) > 500
    or normalized_target not like '/%'
    or normalized_target like '//%'
  ) then
    raise exception 'Destination must be a safe internal LitShelf path.';
  end if;
  if p_ends_at is not null and p_ends_at <= visible_from then
    raise exception 'Visible until must be later than visible from.';
  end if;

  if p_announcement_id is null then
    insert into public.public_announcements (
      title, body, target_url, starts_at, ends_at, is_active, created_by
    ) values (
      normalized_title, normalized_body, normalized_target,
      visible_from, p_ends_at, coalesce(p_is_active, true), auth.uid()
    ) returning * into saved;
  else
    update public.public_announcements
    set title = normalized_title,
        body = normalized_body,
        target_url = normalized_target,
        starts_at = visible_from,
        ends_at = p_ends_at,
        is_active = coalesce(p_is_active, true)
    where id = p_announcement_id
    returning * into saved;

    if not found then
      insert into public.public_announcements (
        id, title, body, target_url, starts_at, ends_at, is_active, created_by
      ) values (
        p_announcement_id, normalized_title, normalized_body, normalized_target,
        visible_from, p_ends_at, coalesce(p_is_active, true), auth.uid()
      ) returning * into saved;
    end if;
  end if;

  return saved;
end;
$$;

create or replace function public.send_targeted_admin_notification(
  p_message_id uuid,
  p_recipient_id uuid,
  p_title text,
  p_body text,
  p_target_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_body text := nullif(btrim(coalesce(p_body, '')), '');
  normalized_target text := nullif(btrim(coalesce(p_target_url, '')), '');
  notification_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can send targeted messages.';
  end if;
  if p_message_id is null or p_recipient_id is null then
    raise exception 'A message ID and recipient are required.';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'The selected recipient was not found.';
  end if;
  if normalized_title is null or char_length(normalized_title) > 180 then
    raise exception 'Message title must contain 1 to 180 characters.';
  end if;
  if normalized_body is null or char_length(normalized_body) > 1000 then
    raise exception 'Message must contain 1 to 1000 characters.';
  end if;
  if normalized_target is not null and (
    char_length(normalized_target) > 500
    or normalized_target not like '/%'
    or normalized_target like '//%'
  ) then
    raise exception 'Destination must be a safe internal LitShelf path.';
  end if;

  insert into public.notifications (
    recipient_id, type, title, body, target_url,
    entity_type, entity_id, dedupe_key
  ) values (
    p_recipient_id, 'admin_announcement', normalized_title, normalized_body,
    normalized_target, 'admin_message', p_message_id::text,
    'admin_message:' || p_message_id::text || ':' || p_recipient_id::text
  )
  on conflict (dedupe_key) do update
  set title = excluded.title,
      body = excluded.body,
      target_url = excluded.target_url
  returning id into notification_id;

  return notification_id;
end;
$$;

create or replace function public.search_announcement_recipients(
  p_query text,
  p_limit integer default 8
)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can search message recipients.';
  end if;
  if normalized_query is null then return; end if;

  return query
  select profile.id, profile.username, profile.full_name, profile.avatar_url
  from public.profiles as profile
  where profile.username ilike '%' || normalized_query || '%'
    or profile.full_name ilike '%' || normalized_query || '%'
  order by
    case when lower(profile.username) = lower(normalized_query) then 0 else 1 end,
    profile.username nulls last,
    profile.full_name nulls last
  limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$$;

create or replace function public.get_notification_inbox(p_limit integer default 30)
returns table (
  id uuid,
  item_kind text,
  type text,
  title text,
  body text,
  target_url text,
  target_type text,
  post_id bigint,
  comment_id bigint,
  reply_id bigint,
  is_read boolean,
  created_at timestamptz,
  actor jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  return query
  with combined as (
    select
      notification.id,
      'personal'::text as item_kind,
      notification.type,
      notification.title,
      coalesce(notification.body, '') as body,
      notification.target_url,
      notification.target_type,
      notification.post_id,
      notification.comment_id,
      notification.reply_id,
      notification.is_read,
      notification.created_at,
      case when actor_profile.id is null then null else jsonb_build_object(
        'id', actor_profile.id,
        'username', actor_profile.username,
        'full_name', actor_profile.full_name,
        'avatar_url', actor_profile.avatar_url
      ) end as actor
    from public.notifications as notification
    left join public.profiles as actor_profile on actor_profile.id = notification.actor_id
    where notification.recipient_id = auth.uid()
      and not (
        notification.type = 'admin_announcement'
        and notification.entity_type = 'admin_broadcast'
        and exists (
          select 1
          from public.public_announcements as migrated
          where migrated.legacy_broadcast_id::text = notification.entity_id
        )
      )

    union all

    select
      announcement.id,
      'public_announcement'::text,
      'admin_announcement'::text,
      announcement.title,
      announcement.body,
      announcement.target_url,
      null::text,
      null::bigint,
      null::bigint,
      null::bigint,
      (announcement_read.user_id is not null),
      announcement.starts_at,
      null::jsonb
    from public.public_announcements as announcement
    left join public.public_announcement_reads as announcement_read
      on announcement_read.announcement_id = announcement.id
      and announcement_read.user_id = auth.uid()
    where announcement.is_active
      and announcement.starts_at <= now()
      and (announcement.ends_at is null or announcement.ends_at > now())
  )
  select combined.*
  from combined
  order by combined.created_at desc, combined.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then 0 else (
    select count(*)::integer
    from public.notifications as notification
    where notification.recipient_id = auth.uid()
      and not notification.is_read
      and not (
        notification.type = 'admin_announcement'
        and notification.entity_type = 'admin_broadcast'
        and exists (
          select 1 from public.public_announcements as migrated
          where migrated.legacy_broadcast_id::text = notification.entity_id
        )
      )
  ) + (
    select count(*)::integer
    from public.public_announcements as announcement
    where announcement.is_active
      and announcement.starts_at <= now()
      and (announcement.ends_at is null or announcement.ends_at > now())
      and not exists (
        select 1 from public.public_announcement_reads as announcement_read
        where announcement_read.announcement_id = announcement.id
          and announcement_read.user_id = auth.uid()
      )
  ) end;
$$;

create or replace function public.mark_public_announcement_read(p_announcement_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if not exists (
    select 1 from public.public_announcements as announcement
    where announcement.id = p_announcement_id
      and announcement.is_active
      and announcement.starts_at <= now()
      and (announcement.ends_at is null or announcement.ends_at > now())
  ) then return false; end if;

  insert into public.public_announcement_reads (announcement_id, user_id, read_at)
  values (p_announcement_id, auth.uid(), now())
  on conflict (announcement_id, user_id)
  do update set read_at = excluded.read_at;
  return true;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_count integer;
  announcement_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  update public.notifications
  set is_read = true
  where recipient_id = auth.uid() and not is_read;
  get diagnostics personal_count = row_count;

  insert into public.public_announcement_reads (announcement_id, user_id, read_at)
  select announcement.id, auth.uid(), now()
  from public.public_announcements as announcement
  where announcement.is_active
    and announcement.starts_at <= now()
    and (announcement.ends_at is null or announcement.ends_at > now())
  on conflict (announcement_id, user_id) do nothing;
  get diagnostics announcement_count = row_count;

  return personal_count + announcement_count;
end;
$$;

-- Keep stale clients safe: the old broadcast RPC now creates one global row
-- instead of enumerating profiles.
create or replace function public.broadcast_notification(
  p_broadcast_id uuid,
  p_title text,
  p_body text,
  p_target_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.public_announcements%rowtype;
begin
  saved := public.save_public_announcement(
    p_broadcast_id, p_title, p_body, p_target_url,
    now(), null, true
  );
  return jsonb_build_object(
    'broadcast_id', p_broadcast_id,
    'announcement_id', saved.id,
    'announcement_count', 1,
    'sent_count', 1
  );
end;
$$;

revoke all on function public.save_public_announcement(
  uuid, text, text, text, timestamptz, timestamptz, boolean
) from public, anon, authenticated;
revoke all on function public.send_targeted_admin_notification(
  uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.search_announcement_recipients(text, integer)
from public, anon, authenticated;
revoke all on function public.get_notification_inbox(integer)
from public, anon, authenticated;
revoke all on function public.get_unread_notification_count()
from public, anon, authenticated;
revoke all on function public.mark_public_announcement_read(uuid)
from public, anon, authenticated;

grant execute on function public.save_public_announcement(
  uuid, text, text, text, timestamptz, timestamptz, boolean
) to authenticated;
grant execute on function public.send_targeted_admin_notification(
  uuid, uuid, text, text, text
) to authenticated;
grant execute on function public.search_announcement_recipients(text, integer)
to authenticated;
grant execute on function public.get_notification_inbox(integer) to authenticated;
grant execute on function public.get_unread_notification_count() to authenticated;
grant execute on function public.mark_public_announcement_read(uuid) to authenticated;

-- Reconstruct only the most recent legacy broadcast as the currently active
-- global announcement. Historical fan-out rows remain untouched.
with legacy_broadcasts as (
  select
    notification.entity_id::uuid as broadcast_id,
    (array_agg(notification.title order by notification.created_at, notification.id))[1] as title,
    (array_agg(coalesce(notification.body, '') order by notification.created_at, notification.id))[1] as body,
    (array_agg(notification.target_url order by notification.created_at, notification.id))[1] as target_url,
    min(notification.created_at) as created_at,
    max(notification.created_at) as latest_copy_at
  from public.notifications as notification
  where notification.type = 'admin_announcement'
    and notification.entity_type = 'admin_broadcast'
    and notification.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by notification.entity_id
), latest_legacy_broadcast as (
  select * from legacy_broadcasts
  order by latest_copy_at desc, broadcast_id desc
  limit 1
)
insert into public.public_announcements (
  id, title, body, target_url, starts_at, is_active,
  legacy_broadcast_id, created_at, updated_at
)
select
  broadcast_id, title, body, target_url, created_at, true,
  broadcast_id, created_at, created_at
from latest_legacy_broadcast
on conflict (id) do nothing;

insert into public.public_announcement_reads (announcement_id, user_id, read_at)
select announcement.id, notification.recipient_id, now()
from public.public_announcements as announcement
join public.notifications as notification
  on notification.entity_type = 'admin_broadcast'
  and notification.entity_id = announcement.legacy_broadcast_id::text
where notification.type = 'admin_announcement'
  and notification.is_read
on conflict (announcement_id, user_id) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'public_announcements'
    ) then
      alter publication supabase_realtime add table public.public_announcements;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'public_announcement_reads'
    ) then
      alter publication supabase_realtime add table public.public_announcement_reads;
    end if;
  end if;
end;
$$;
