create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in (
    'reaction', 'reply', 'comment',
    'book_submission_approved', 'book_submission_rejected',
    'admin_announcement'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  body text check (body is null or char_length(body) <= 1000),
  target_url text check (
    target_url is null
    or (char_length(target_url) <= 500 and target_url like '/%' and target_url not like '//%')
  ),
  entity_type text,
  entity_id text,
  dedupe_key text unique,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
on public.notifications(recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
on public.notifications(recipient_id, is_read, created_at desc);

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

create policy "Users read own notifications"
on public.notifications for select to authenticated
using (recipient_id = auth.uid());

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.notifications set is_read = true
  where id = p_notification_id and recipient_id = auth.uid() and not is_read;
  return found;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.notifications set is_read = true
  where recipient_id = auth.uid() and not is_read;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.notification_actor_name(p_actor_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(profiles.full_name), ''),
    nullif(btrim(profiles.username), ''),
    'A reader'
  )
  from public.profiles
  where profiles.id = p_actor_id;
$$;

create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
  post_book_id bigint;
  book_title text;
  post_type text;
  actor_name text;
begin
  select posts.user_id, posts.book_id, coalesce(to_jsonb(posts) ->> 'post_type', 'note')
  into post_owner, post_book_id, post_type
  from public.posts
  where posts.id = new.post_id;

  if post_owner is null or post_owner = new.user_id then return new; end if;
  if post_book_id is not null then
    select books.title into book_title from public.books where books.id = post_book_id;
  end if;
  actor_name := coalesce(public.notification_actor_name(new.user_id), 'A reader');

  insert into public.notifications (
    recipient_id, actor_id, type, title, body, target_url,
    entity_type, entity_id, dedupe_key
  ) values (
    post_owner, new.user_id, 'reaction',
    case when post_type = 'review' then actor_name || ' liked your review'
      else actor_name || ' liked your post' end,
    case when post_type = 'review' and book_title is not null then left(book_title, 180)
      when book_title is not null then 'Your post about ' || left(book_title, 180) else null end,
    '/?post=' || new.post_id::text, 'post_like', new.post_id::text || ':' || new.user_id::text,
    'post_like:' || new.post_id::text || ':' || new.user_id::text || ':' || post_owner::text
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
  mentioned_recipient uuid;
  actor_name text;
  comment_text text;
begin
  select posts.user_id into post_owner from public.posts where posts.id = new.post_id;
  mentioned_recipient := nullif(to_jsonb(new) ->> 'mentioned_user_id', '')::uuid;
  comment_text := coalesce(to_jsonb(new) ->> 'comment', to_jsonb(new) ->> 'content', '');
  actor_name := coalesce(public.notification_actor_name(new.user_id), 'A reader');

  if mentioned_recipient is not null and mentioned_recipient <> new.user_id then
    insert into public.notifications (
      recipient_id, actor_id, type, title, body, target_url,
      entity_type, entity_id, dedupe_key
    ) values (
      mentioned_recipient, new.user_id, 'reply', actor_name || ' replied to your comment',
      nullif(left(comment_text, 300), ''),
      '/?post=' || new.post_id::text || '&comment=' || new.id::text,
      'comment', new.id::text,
      'comment_reply:' || new.id::text || ':' || mentioned_recipient::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  if post_owner is not null and post_owner <> new.user_id
    and post_owner is distinct from mentioned_recipient
  then
    insert into public.notifications (
      recipient_id, actor_id, type, title, body, target_url,
      entity_type, entity_id, dedupe_key
    ) values (
      post_owner, new.user_id, 'comment', actor_name || ' commented on your post',
      nullif(left(comment_text, 300), ''),
      '/?post=' || new.post_id::text || '&comment=' || new.id::text,
      'comment', new.id::text,
      'post_comment:' || new.id::text || ':' || post_owner::text
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.notify_book_submission_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status
    or new.status not in ('approved', 'rejected')
  then return new; end if;

  insert into public.notifications (
    recipient_id, type, title, body, target_url,
    entity_type, entity_id, dedupe_key
  ) values (
    new.submitted_by,
    case new.status when 'approved' then 'book_submission_approved'
      else 'book_submission_rejected' end,
    case new.status when 'approved' then 'Your book submission was approved'
      else 'Your book submission was not approved' end,
    case new.status when 'approved' then left(new.title, 300) || ' is now available on LitShelf.'
      else left(new.title, 300) || ' was not added to LitShelf.' end,
    case when new.status = 'approved' and new.approved_book_id is not null
      then '/discover?bookId=' || new.approved_book_id::text else null end,
    'book_submission', new.id::text,
    'book_submission:' || new.id::text || ':' || new.status
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.post_likes') is not null then
    execute 'drop trigger if exists notify_post_like_after_insert on public.post_likes';
    execute 'create trigger notify_post_like_after_insert after insert on public.post_likes
      for each row execute function public.notify_post_like()';
  elsif to_regclass('public.likes') is not null then
    execute 'drop trigger if exists notify_post_like_after_insert on public.likes';
    execute 'create trigger notify_post_like_after_insert after insert on public.likes
      for each row execute function public.notify_post_like()';
  end if;

  if to_regclass('public.comments') is not null then
    execute 'drop trigger if exists notify_post_comment_after_insert on public.comments';
    execute 'create trigger notify_post_comment_after_insert after insert on public.comments
      for each row execute function public.notify_post_comment()';
  end if;

  if to_regclass('public.book_submissions') is not null then
    execute 'drop trigger if exists notify_book_submission_outcome_after_update on public.book_submissions';
    execute 'create trigger notify_book_submission_outcome_after_update after update of status on public.book_submissions
      for each row execute function public.notify_book_submission_outcome()';
  end if;
end;
$$;

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
  normalized_title text := nullif(btrim(coalesce(p_title, '')), '');
  normalized_body text := nullif(btrim(coalesce(p_body, '')), '');
  normalized_target text := nullif(btrim(coalesce(p_target_url, '')), '');
  inserted_count integer;
begin
  if not public.is_admin() then raise exception 'Only admins can send announcements.'; end if;
  if p_broadcast_id is null then raise exception 'A broadcast ID is required.'; end if;
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
  ) then raise exception 'Destination must be a safe internal LitShelf path.'; end if;

  insert into public.notifications (
    recipient_id, type, title, body, target_url,
    entity_type, entity_id, dedupe_key
  )
  select profiles.id, 'admin_announcement', normalized_title, normalized_body,
    normalized_target, 'admin_broadcast', p_broadcast_id::text,
    'admin_broadcast:' || p_broadcast_id::text || ':' || profiles.id::text
  from public.profiles
  on conflict (dedupe_key) do nothing;
  get diagnostics inserted_count = row_count;

  return jsonb_build_object('broadcast_id', p_broadcast_id, 'sent_count', inserted_count);
end;
$$;

revoke all on function public.notification_actor_name(uuid) from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.broadcast_notification(uuid, text, text, text) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.broadcast_notification(uuid, text, text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    )
  then alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
