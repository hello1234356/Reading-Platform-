create table if not exists public.comment_likes (
  comment_id bigint not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_created_idx
on public.comment_likes(comment_id, created_at desc);

alter table public.comment_likes enable row level security;

drop policy if exists "Students read comment likes"
on public.comment_likes;

create policy "Students read comment likes"
on public.comment_likes
for select
to authenticated
using (true);

drop policy if exists "Students create own comment likes"
on public.comment_likes;

create policy "Students create own comment likes"
on public.comment_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Students delete own comment likes"
on public.comment_likes;

create policy "Students delete own comment likes"
on public.comment_likes
for delete
to authenticated
using (user_id = auth.uid());
