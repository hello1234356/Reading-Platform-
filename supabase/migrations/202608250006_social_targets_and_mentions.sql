-- Addressable feed replies, validated mentions, and structured notification targets.
-- Mention notifications intentionally run on INSERT only; edits do not re-notify.

alter table public.comments
add column if not exists comment text,
add column if not exists mentioned_user_id uuid references public.profiles(id) on delete set null,
add column if not exists parent_comment_id bigint references public.comments(id) on delete cascade;

update public.comments
set comment = to_jsonb(public.comments) ->> 'content'
where comment is null
  and to_jsonb(public.comments) ? 'content';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comments'
      and column_name = 'content'
  ) then
    execute 'alter table public.comments alter column content drop not null';
  end if;
end;
$$;

alter table public.comments drop constraint if exists comments_parent_not_self;
alter table public.comments add constraint comments_parent_not_self
check (parent_comment_id is null or parent_comment_id <> id);

create index if not exists comments_parent_created_idx
on public.comments(parent_comment_id, created_at);

create table if not exists public.comment_mentions (
  comment_id bigint not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);

alter table public.comment_mentions enable row level security;
revoke all on table public.comment_mentions from anon, authenticated;
grant select on table public.comment_mentions to authenticated;

create policy "Students read comment mentions"
on public.comment_mentions for select to authenticated using (true);

alter table public.notifications
  add column if not exists target_type text,
  add column if not exists post_id bigint references public.posts(id) on delete set null,
  add column if not exists comment_id bigint references public.comments(id) on delete set null,
  add column if not exists reply_id bigint references public.comments(id) on delete set null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'reaction', 'reply', 'comment', 'mention',
  'book_submission_approved', 'book_submission_rejected', 'admin_announcement'
));

create or replace function public.validate_comment_parent()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_comment_id is not null and not exists (
    select 1 from public.comments parent
    where parent.id = new.parent_comment_id
      and parent.post_id = new.post_id
  ) then
    raise exception 'Reply parent must be a comment on the same post.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_comment_parent_before_write on public.comments;
create trigger validate_comment_parent_before_write
before insert or update of parent_comment_id, post_id on public.comments
for each row execute function public.validate_comment_parent();

create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
  direct_reply_recipient uuid;
  actor_name text;
  comment_text text := coalesce(to_jsonb(new) ->> 'comment', to_jsonb(new) ->> 'content', '');
  candidate text[];
  mentioned_profile record;
  parent_target bigint := coalesce(new.parent_comment_id, new.id);
  content_target_url text;
begin
  select posts.user_id into post_owner from public.posts where posts.id = new.post_id;
  actor_name := coalesce(public.notification_actor_name(new.user_id), 'A reader');
  if new.parent_comment_id is not null then
    select comments.user_id into direct_reply_recipient
    from public.comments where comments.id = new.parent_comment_id;

    with recursive ancestors as (
      select comments.id, comments.parent_comment_id
      from public.comments where comments.id = new.parent_comment_id
      union all
      select parent.id, parent.parent_comment_id
      from public.comments parent join ancestors child on parent.id = child.parent_comment_id
    )
    select ancestors.id into parent_target from ancestors
    where ancestors.parent_comment_id is null limit 1;
  end if;
  content_target_url := case when new.parent_comment_id is not null
    then '/post/' || new.post_id::text || '?comment=' || parent_target::text || '&reply=' || new.id::text
    else '/post/' || new.post_id::text || '?comment=' || new.id::text end;

  if new.parent_comment_id is not null
    and direct_reply_recipient is not null
    and direct_reply_recipient <> new.user_id
  then
    insert into public.notifications (
      recipient_id, actor_id, type, title, body, target_url,
      target_type, post_id, comment_id, reply_id, entity_type, entity_id, dedupe_key
    ) values (
      direct_reply_recipient, new.user_id, 'reply', actor_name || ' replied to your comment',
      nullif(left(comment_text, 300), ''), content_target_url,
      'reply', new.post_id, parent_target, new.id, 'comment', new.id::text,
      'comment_reply:' || new.id::text || ':' || direct_reply_recipient::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  if new.parent_comment_id is null
    and post_owner is not null and post_owner <> new.user_id
  then
    insert into public.notifications (
      recipient_id, actor_id, type, title, body, target_url,
      target_type, post_id, comment_id, entity_type, entity_id, dedupe_key
    ) values (
      post_owner, new.user_id, 'comment', actor_name || ' commented on your post',
      nullif(left(comment_text, 300), ''), content_target_url,
      'comment', new.post_id, new.id, 'comment', new.id::text,
      'post_comment:' || new.id::text || ':' || post_owner::text
    ) on conflict (dedupe_key) do nothing;
  end if;

  -- A mention starts at a token boundary, so the @ inside an email is not parsed.
  for candidate in
    select regexp_matches(comment_text, '(^|[^[:alnum:]_.+-])@([[:alnum:]_.-]{1,40})', 'g')
  loop
    for mentioned_profile in
      select profiles.id from public.profiles
      where profiles.username = candidate[2]
    loop
      insert into public.comment_mentions(comment_id, mentioned_user_id)
      values (new.id, mentioned_profile.id)
      on conflict do nothing;

      if mentioned_profile.id <> new.user_id
        and mentioned_profile.id is distinct from direct_reply_recipient
        and not (new.parent_comment_id is null and mentioned_profile.id = post_owner)
      then
        insert into public.notifications (
          recipient_id, actor_id, type, title, body, target_url,
          target_type, post_id, comment_id, reply_id, entity_type, entity_id, dedupe_key
        ) values (
          mentioned_profile.id, new.user_id, 'mention',
          actor_name || case when new.parent_comment_id is null
            then ' mentioned you in a comment' else ' mentioned you in a reply' end,
          nullif(left(comment_text, 300), ''), content_target_url,
          case when new.parent_comment_id is null then 'comment' else 'reply' end,
          new.post_id, parent_target,
          case when new.parent_comment_id is not null then new.id else null end,
          'comment', new.id::text,
          'comment_mention:' || new.id::text || ':' || mentioned_profile.id::text
        ) on conflict (dedupe_key) do nothing;
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_post_comment_after_insert on public.comments;
create trigger notify_post_comment_after_insert after insert on public.comments
for each row execute function public.notify_post_comment();

create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare post_owner uuid; post_book_id bigint; book_title text; post_kind text; actor_name text;
begin
  select posts.user_id, posts.book_id, coalesce(to_jsonb(posts) ->> 'post_type', 'note')
  into post_owner, post_book_id, post_kind from public.posts where posts.id = new.post_id;
  if post_owner is null or post_owner = new.user_id then return new; end if;
  if post_book_id is not null then select books.title into book_title from public.books where books.id = post_book_id; end if;
  actor_name := coalesce(public.notification_actor_name(new.user_id), 'A reader');
  insert into public.notifications (
    recipient_id, actor_id, type, title, body, target_url, target_type, post_id,
    entity_type, entity_id, dedupe_key
  ) values (
    post_owner, new.user_id, 'reaction',
    case when post_kind = 'review' then actor_name || ' liked your review' else actor_name || ' liked your post' end,
    case when post_kind = 'review' and book_title is not null then left(book_title, 180)
      when book_title is not null then 'Your post about ' || left(book_title, 180) else null end,
    '/post/' || new.post_id::text, 'post', new.post_id,
    'post_like', new.post_id::text || ':' || new.user_id::text,
    'post_like:' || new.post_id::text || ':' || new.user_id::text || ':' || post_owner::text
  ) on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
