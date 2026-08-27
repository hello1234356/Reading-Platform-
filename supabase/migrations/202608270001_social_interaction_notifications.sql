-- Social interaction notifications.
-- Post likes/comments already had notification functions, but comment likes were
-- added later and need their own notification trigger.

create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

do $$
begin
  if to_regclass('public.likes') is not null then
    execute '
      insert into public.post_likes (post_id, user_id, created_at)
      select likes.post_id, likes.user_id, likes.created_at
      from public.likes
      on conflict (post_id, user_id) do nothing
    ';
  end if;
end;
$$;

create index if not exists post_likes_post_created_idx
on public.post_likes(post_id, created_at desc);

alter table public.post_likes enable row level security;

drop policy if exists "Students read post likes"
on public.post_likes;

create policy "Students read post likes"
on public.post_likes
for select
to authenticated
using (true);

drop policy if exists "Students create own post likes"
on public.post_likes;

create policy "Students create own post likes"
on public.post_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Students delete own post likes"
on public.post_likes;

create policy "Students delete own post likes"
on public.post_likes
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_owner uuid;
  comment_post_id bigint;
  parent_comment_id bigint;
  root_comment_id bigint;
  actor_name text;
  comment_text text;
  content_target_url text;
begin
  select comments.user_id, comments.post_id, comments.parent_comment_id,
    coalesce(to_jsonb(comments) ->> 'comment', to_jsonb(comments) ->> 'content', '')
  into comment_owner, comment_post_id, parent_comment_id, comment_text
  from public.comments
  where comments.id = new.comment_id;

  if comment_owner is null or comment_owner = new.user_id then
    return new;
  end if;

  root_comment_id := new.comment_id;

  if parent_comment_id is not null then
    with recursive ancestors as (
      select comments.id, comments.parent_comment_id
      from public.comments
      where comments.id = parent_comment_id
      union all
      select parent.id, parent.parent_comment_id
      from public.comments parent
      join ancestors child on parent.id = child.parent_comment_id
    )
    select ancestors.id into root_comment_id
    from ancestors
    where ancestors.parent_comment_id is null
    limit 1;

    root_comment_id := coalesce(root_comment_id, parent_comment_id, new.comment_id);
  end if;

  content_target_url := case
    when parent_comment_id is not null then
      '/post/' || comment_post_id::text || '?comment=' || root_comment_id::text ||
      '&reply=' || new.comment_id::text
    else
      '/post/' || comment_post_id::text || '?comment=' || new.comment_id::text
  end;

  actor_name := coalesce(public.notification_actor_name(new.user_id), 'A reader');

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    title,
    body,
    target_url,
    target_type,
    post_id,
    comment_id,
    reply_id,
    entity_type,
    entity_id,
    dedupe_key
  ) values (
    comment_owner,
    new.user_id,
    'reaction',
    actor_name || case
      when parent_comment_id is not null then ' liked your reply'
      else ' liked your comment'
    end,
    nullif(left(comment_text, 300), ''),
    content_target_url,
    case when parent_comment_id is not null then 'reply' else 'comment' end,
    comment_post_id,
    case when parent_comment_id is not null then root_comment_id else new.comment_id end,
    case when parent_comment_id is not null then new.comment_id else null end,
    'comment_like',
    new.comment_id::text || ':' || new.user_id::text,
    'comment_like:' || new.comment_id::text || ':' || new.user_id::text || ':' || comment_owner::text
  ) on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_comment_like_after_insert
on public.comment_likes;

create trigger notify_comment_like_after_insert
after insert on public.comment_likes
for each row execute function public.notify_comment_like();

drop trigger if exists notify_post_like_after_insert
on public.post_likes;

create trigger notify_post_like_after_insert
after insert on public.post_likes
for each row execute function public.notify_post_like();

insert into public.notifications (
  recipient_id,
  actor_id,
  type,
  title,
  body,
  target_url,
  target_type,
  post_id,
  entity_type,
  entity_id,
  dedupe_key,
  is_read,
  created_at
)
select
  posts.user_id,
  post_likes.user_id,
  'reaction',
  case when posts.post_type = 'review'
    then public.notification_actor_name(post_likes.user_id) || ' liked your review'
    else public.notification_actor_name(post_likes.user_id) || ' liked your post' end,
  case when books.title is not null then left(books.title, 180) else null end,
  '/post/' || posts.id::text,
  'post',
  posts.id,
  'post_like',
  posts.id::text || ':' || post_likes.user_id::text,
  'post_like:' || posts.id::text || ':' || post_likes.user_id::text || ':' || posts.user_id::text,
  true,
  post_likes.created_at
from public.post_likes
join public.posts on posts.id = post_likes.post_id
left join public.books on books.id = posts.book_id
where posts.user_id <> post_likes.user_id
on conflict (dedupe_key) do nothing;

insert into public.notifications (
  recipient_id,
  actor_id,
  type,
  title,
  body,
  target_url,
  target_type,
  post_id,
  comment_id,
  reply_id,
  entity_type,
  entity_id,
  dedupe_key,
  is_read,
  created_at
)
select
  comments.user_id,
  comment_likes.user_id,
  'reaction',
  public.notification_actor_name(comment_likes.user_id) ||
    case when comments.parent_comment_id is not null then ' liked your reply'
    else ' liked your comment' end,
  nullif(left(coalesce(to_jsonb(comments) ->> 'comment', to_jsonb(comments) ->> 'content', ''), 300), ''),
  case when comments.parent_comment_id is not null then
    '/post/' || comments.post_id::text || '?comment=' ||
      coalesce(root_comments.root_comment_id, comments.parent_comment_id, comments.id)::text ||
      '&reply=' || comments.id::text
    else '/post/' || comments.post_id::text || '?comment=' || comments.id::text end,
  case when comments.parent_comment_id is not null then 'reply' else 'comment' end,
  comments.post_id,
  case when comments.parent_comment_id is not null
    then coalesce(root_comments.root_comment_id, comments.parent_comment_id, comments.id)
    else comments.id end,
  case when comments.parent_comment_id is not null then comments.id else null end,
  'comment_like',
  comments.id::text || ':' || comment_likes.user_id::text,
  'comment_like:' || comments.id::text || ':' || comment_likes.user_id::text || ':' || comments.user_id::text,
  true,
  comment_likes.created_at
from public.comment_likes
join public.comments on comments.id = comment_likes.comment_id
left join lateral (
  with recursive ancestors as (
    select parent.id, parent.parent_comment_id
    from public.comments parent
    where parent.id = comments.parent_comment_id
    union all
    select parent.id, parent.parent_comment_id
    from public.comments parent
    join ancestors child on parent.id = child.parent_comment_id
  )
  select ancestors.id as root_comment_id
  from ancestors
  where ancestors.parent_comment_id is null
  limit 1
) root_comments on true
where comments.user_id <> comment_likes.user_id
on conflict (dedupe_key) do nothing;
