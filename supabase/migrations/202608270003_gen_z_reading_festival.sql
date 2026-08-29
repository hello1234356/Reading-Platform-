alter table public.homepage_banners
  add column if not exists action_type text not null default 'none',
  add column if not exists action_target text;

alter table public.homepage_banners
  drop constraint if exists homepage_banners_action_type_check,
  drop constraint if exists homepage_banners_action_target_check;

alter table public.homepage_banners
  add constraint homepage_banners_action_type_check
    check (action_type in ('none', 'url', 'internal', 'modal')),
  add constraint homepage_banners_action_target_check
    check (
      (action_type = 'none' and action_target is null)
      or (action_type <> 'none' and nullif(btrim(action_target), '') is not null)
    );

create table public.festival_book_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id bigint not null references public.books(id) on delete restrict,
  language text not null,
  quote text not null,
  reason text not null,
  student_photo_path text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint festival_book_recommendations_one_per_user unique (user_id),
  constraint festival_book_recommendations_language_check
    check (language in ('english', 'chinese')),
  constraint festival_book_recommendations_status_check
    check (status in ('submitted', 'selected', 'not_selected')),
  constraint festival_book_recommendations_quote_check
    check (char_length(btrim(quote)) between 1 and 300),
  constraint festival_book_recommendations_reason_check
    check (char_length(btrim(reason)) between 1 and 300),
  constraint festival_book_recommendations_photo_check
    check (student_photo_path ~ ('^' || user_id::text || '/[^/]+$'))
);

create index festival_book_recommendations_review_idx
  on public.festival_book_recommendations (status, created_at desc);

create or replace function public.set_festival_recommendation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger festival_book_recommendations_set_updated_at
before update on public.festival_book_recommendations
for each row execute function public.set_festival_recommendation_updated_at();

alter table public.festival_book_recommendations enable row level security;

create policy "Students read own festival recommendation"
on public.festival_book_recommendations
for select to authenticated
using (user_id = auth.uid());

create policy "Admins read festival recommendations"
on public.festival_book_recommendations
for select to authenticated
using (public.is_admin());

create policy "Students create own festival recommendation"
on public.festival_book_recommendations
for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'submitted'
  and public.can_use_moderated_book(book_id)
);

create or replace function public.upsert_festival_book_recommendation(
  p_book_id bigint,
  p_language text,
  p_quote text,
  p_reason text,
  p_student_photo_path text
)
returns public.festival_book_recommendations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved public.festival_book_recommendations%rowtype;
begin
  if current_user_id is null then
    raise exception 'You must be logged in to submit a recommendation.';
  end if;
  if p_language not in ('english', 'chinese') then
    raise exception 'Choose English or Chinese.';
  end if;
  if char_length(btrim(coalesce(p_quote, ''))) not between 1 and 300 then
    raise exception 'Your quote must be between 1 and 300 characters.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then
    raise exception 'Your reason must be between 1 and 300 characters.';
  end if;
  if p_student_photo_path is null
    or p_student_photo_path !~ ('^' || current_user_id::text || '/[^/]+$') then
    raise exception 'Choose a valid submission photo.';
  end if;
  if not public.can_use_moderated_book(p_book_id) then
    raise exception 'That book is not available for submissions.';
  end if;

  insert into public.festival_book_recommendations (
    user_id, book_id, language, quote, reason, student_photo_path
  ) values (
    current_user_id, p_book_id, p_language, btrim(p_quote), btrim(p_reason),
    p_student_photo_path
  )
  on conflict (user_id) do update set
    book_id = excluded.book_id,
    language = excluded.language,
    quote = excluded.quote,
    reason = excluded.reason,
    student_photo_path = excluded.student_photo_path
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.review_festival_book_recommendation(
  p_recommendation_id uuid,
  p_status text
)
returns public.festival_book_recommendations
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.festival_book_recommendations%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review festival recommendations.';
  end if;
  if p_status not in ('submitted', 'selected', 'not_selected') then
    raise exception 'Choose a valid review status.';
  end if;
  update public.festival_book_recommendations
  set status = p_status
  where id = p_recommendation_id
  returning * into saved;
  if not found then raise exception 'Recommendation not found.'; end if;
  return saved;
end;
$$;

revoke all on function public.upsert_festival_book_recommendation(bigint, text, text, text, text)
  from public, anon;
grant execute on function public.upsert_festival_book_recommendation(bigint, text, text, text, text)
  to authenticated;
revoke all on function public.review_festival_book_recommendation(uuid, text)
  from public, anon;
grant execute on function public.review_festival_book_recommendation(uuid, text)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'festival-student-photos',
  'festival-student-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Students read own festival photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'festival-student-photos'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

create policy "Students upload own festival photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'festival-student-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Students delete own festival photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'festival-student-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
