-- Extend notification destinations without changing notification storage,
-- delivery, read state, or recipient authorization.

create or replace function public.is_safe_notification_destination(p_target text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_target is not null
    and p_target = btrim(p_target)
    and char_length(p_target) <= 500
    and (
      (p_target like '/%' and p_target not like '//%')
      or p_target ~* '^https://[^/[:space:]?#]+([/?#].*)?$'
    );
$$;

alter table public.notifications
  drop constraint if exists notifications_target_url_check;
alter table public.notifications
  add constraint notifications_target_url_check
  check (target_url is null or public.is_safe_notification_destination(target_url));

alter table public.public_announcements
  drop constraint if exists public_announcements_target_url_check;
alter table public.public_announcements
  add constraint public_announcements_target_url_check
  check (target_url is null or public.is_safe_notification_destination(target_url));

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
  if normalized_target is not null
    and not public.is_safe_notification_destination(normalized_target) then
    raise exception 'Destination must be a LitShelf path or a valid HTTPS link.';
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
  if normalized_target is not null
    and not public.is_safe_notification_destination(normalized_target) then
    raise exception 'Destination must be a LitShelf path or a valid HTTPS link.';
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

revoke all on function public.is_safe_notification_destination(text)
  from public, anon, authenticated;
