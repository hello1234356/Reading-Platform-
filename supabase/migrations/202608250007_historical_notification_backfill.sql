-- One-time, idempotent historical notification backfill.
-- Historical rows are read so existing activity does not inflate unread badges.

-- Post/review reactions. Comment/reply reactions are not backfilled because no such source table exists.
insert into public.notifications (
  recipient_id, actor_id, type, title, body, target_url,
  target_type, post_id, entity_type, entity_id, dedupe_key, is_read, created_at
)
select
  posts.user_id, post_likes.user_id, 'reaction',
  case when posts.post_type = 'review'
    then public.notification_actor_name(post_likes.user_id) || ' liked your review'
    else public.notification_actor_name(post_likes.user_id) || ' liked your post' end,
  case when books.title is not null then left(books.title, 180) else null end,
  '/post/' || posts.id::text, 'post', posts.id,
  'post_like', posts.id::text || ':' || post_likes.user_id::text,
  'post_like:' || posts.id::text || ':' || post_likes.user_id::text || ':' || posts.user_id::text,
  true, post_likes.created_at
from public.post_likes
join public.posts on posts.id = post_likes.post_id
left join public.books on books.id = posts.book_id
where posts.user_id <> post_likes.user_id
on conflict (dedupe_key) do nothing;

-- Resolve and persist valid historical @username mentions once per comment/user.
insert into public.comment_mentions(comment_id, mentioned_user_id, created_at)
select distinct comments.id, profiles.id, comments.created_at
from public.comments
cross join lateral regexp_matches(
  comments.comment,
  '(^|[^[:alnum:]_.+-])@([[:alnum:]_.-]{1,40})',
  'g'
) candidate
join public.profiles on profiles.username = candidate[2]
where profiles.id <> comments.user_id
on conflict (comment_id, mentioned_user_id) do nothing;

-- Direct replies. New replies have parent_comment_id; legacy flat replies used mentioned_user_id.
with reply_sources as (
  select
    comments.*,
    coalesce(parent.user_id, comments.mentioned_user_id) as reply_recipient,
    coalesce(root.id, parent.id, comments.id) as root_comment_id
  from public.comments
  left join public.comments parent on parent.id = comments.parent_comment_id
  left join lateral (
    with recursive ancestors as (
      select p.id, p.parent_comment_id from public.comments p where p.id = comments.parent_comment_id
      union all
      select p.id, p.parent_comment_id from public.comments p
      join ancestors child on p.id = child.parent_comment_id
    )
    select ancestors.id from ancestors where ancestors.parent_comment_id is null limit 1
  ) root on true
  where comments.parent_comment_id is not null or comments.mentioned_user_id is not null
)
insert into public.notifications (
  recipient_id, actor_id, type, title, body, target_url,
  target_type, post_id, comment_id, reply_id,
  entity_type, entity_id, dedupe_key, is_read, created_at
)
select
  reply_sources.reply_recipient, reply_sources.user_id, 'reply',
  public.notification_actor_name(reply_sources.user_id) || ' replied to your comment',
  nullif(left(reply_sources.comment, 300), ''),
  case when reply_sources.parent_comment_id is not null
    then '/post/' || reply_sources.post_id::text || '?comment=' || reply_sources.root_comment_id::text
      || '&reply=' || reply_sources.id::text
    else '/post/' || reply_sources.post_id::text || '?comment=' || reply_sources.id::text end,
  'reply', reply_sources.post_id,
  case when reply_sources.parent_comment_id is not null then reply_sources.root_comment_id else reply_sources.id end,
  case when reply_sources.parent_comment_id is not null then reply_sources.id else null end,
  'comment', reply_sources.id::text,
  'comment_reply:' || reply_sources.id::text || ':' || reply_sources.reply_recipient::text,
  true, reply_sources.created_at
from reply_sources
where reply_sources.reply_recipient is not null
  and reply_sources.reply_recipient <> reply_sources.user_id
on conflict (dedupe_key) do nothing;

-- Top-level comments on somebody else's post, excluding legacy rows known to be replies.
insert into public.notifications (
  recipient_id, actor_id, type, title, body, target_url,
  target_type, post_id, comment_id, entity_type, entity_id, dedupe_key, is_read, created_at
)
select
  posts.user_id, comments.user_id, 'comment',
  public.notification_actor_name(comments.user_id) || ' commented on your post',
  nullif(left(comments.comment, 300), ''),
  '/post/' || comments.post_id::text || '?comment=' || comments.id::text,
  'comment', comments.post_id, comments.id, 'comment', comments.id::text,
  'post_comment:' || comments.id::text || ':' || posts.user_id::text,
  true, comments.created_at
from public.comments
join public.posts on posts.id = comments.post_id
where comments.parent_comment_id is null
  and comments.mentioned_user_id is null
  and posts.user_id <> comments.user_id
on conflict (dedupe_key) do nothing;

-- Valid mentions, excluding recipients already covered by direct-reply or post-comment priority.
insert into public.notifications (
  recipient_id, actor_id, type, title, body, target_url,
  target_type, post_id, comment_id, reply_id,
  entity_type, entity_id, dedupe_key, is_read, created_at
)
select
  comment_mentions.mentioned_user_id, comments.user_id, 'mention',
  public.notification_actor_name(comments.user_id)
    || case when comments.parent_comment_id is null
      then ' mentioned you in a comment' else ' mentioned you in a reply' end,
  nullif(left(comments.comment, 300), ''),
  case when comments.parent_comment_id is null
    then '/post/' || comments.post_id::text || '?comment=' || comments.id::text
    else '/post/' || comments.post_id::text || '?comment=' || root.id::text
      || '&reply=' || comments.id::text end,
  case when comments.parent_comment_id is null then 'comment' else 'reply' end,
  comments.post_id, case when comments.parent_comment_id is null then comments.id else root.id end,
  case when comments.parent_comment_id is not null then comments.id else null end,
  'comment', comments.id::text,
  'comment_mention:' || comments.id::text || ':' || comment_mentions.mentioned_user_id::text,
  true, comments.created_at
from public.comment_mentions
join public.comments on comments.id = comment_mentions.comment_id
join public.posts on posts.id = comments.post_id
left join lateral (
  with recursive ancestors as (
    select p.id, p.parent_comment_id from public.comments p where p.id = comments.parent_comment_id
    union all
    select p.id, p.parent_comment_id from public.comments p
    join ancestors child on p.id = child.parent_comment_id
  )
  select ancestors.id from ancestors where ancestors.parent_comment_id is null limit 1
) root on true
left join public.comments direct_parent on direct_parent.id = comments.parent_comment_id
where comment_mentions.mentioned_user_id <> comments.user_id
  and comment_mentions.mentioned_user_id is distinct from coalesce(
    direct_parent.user_id,
    case when comments.parent_comment_id is null then comments.mentioned_user_id end
  )
  and not (
    comments.parent_comment_id is null
    and comments.mentioned_user_id is null
    and comment_mentions.mentioned_user_id = posts.user_id
  )
on conflict (dedupe_key) do nothing;

-- Historical book decisions use updated_at, the closest stored decision timestamp.
insert into public.notifications (
  recipient_id, type, title, body, target_url, target_type,
  entity_type, entity_id, dedupe_key, is_read, created_at
)
select
  book_submissions.submitted_by,
  case book_submissions.status when 'approved' then 'book_submission_approved'
    else 'book_submission_rejected' end,
  case book_submissions.status when 'approved' then 'Your book submission was approved'
    else 'Your book submission was not approved' end,
  case book_submissions.status when 'approved'
    then left(book_submissions.title, 300) || ' is now available on LitShelf.'
    else left(book_submissions.title, 300) || ' was not added to LitShelf.' end,
  case when book_submissions.status = 'approved' and book_submissions.approved_book_id is not null
    then '/discover?bookId=' || book_submissions.approved_book_id::text else null end,
  case when book_submissions.status = 'approved' then 'book' else 'book_submission' end,
  'book_submission', book_submissions.id::text,
  'book_submission:' || book_submissions.id::text || ':' || book_submissions.status,
  true, book_submissions.updated_at
from public.book_submissions
where book_submissions.status in ('approved', 'rejected')
  and book_submissions.submitted_by is not null
on conflict (dedupe_key) do nothing;
