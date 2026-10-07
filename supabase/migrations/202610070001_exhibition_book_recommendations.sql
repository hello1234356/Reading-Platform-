create table if not exists public.exhibition_book_recommendations (
  id bigint generated always as identity primary key,
  exhibition_slug text not null default 'halloween-ghosts',
  submitter_user_id uuid references public.profiles(id) on delete set null,
  submitter_name text,
  submitter_grade text,
  book_title text not null,
  recommendation text not null,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exhibition_book_recommendations_status_check
    check (status in ('pending', 'reviewed', 'featured', 'archived')),
  constraint exhibition_book_recommendations_book_title_check
    check (length(btrim(book_title)) between 1 and 240),
  constraint exhibition_book_recommendations_recommendation_check
    check (length(btrim(recommendation)) between 1 and 1200),
  constraint exhibition_book_recommendations_submitter_name_check
    check (submitter_name is null or length(btrim(submitter_name)) <= 80),
  constraint exhibition_book_recommendations_submitter_grade_check
    check (submitter_grade is null or length(btrim(submitter_grade)) <= 40)
);

create index if not exists exhibition_book_recommendations_status_created_idx
on public.exhibition_book_recommendations(status, created_at desc);

create index if not exists exhibition_book_recommendations_exhibition_created_idx
on public.exhibition_book_recommendations(exhibition_slug, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exhibition_book_recommendations_set_updated_at
on public.exhibition_book_recommendations;

create trigger exhibition_book_recommendations_set_updated_at
before update on public.exhibition_book_recommendations
for each row execute function public.set_updated_at();

alter table public.exhibition_book_recommendations enable row level security;

drop policy if exists "Readers submit exhibition recommendations"
on public.exhibition_book_recommendations;

create policy "Readers submit exhibition recommendations"
on public.exhibition_book_recommendations
for insert
to anon, authenticated
with check (
  submitter_user_id is null
  or submitter_user_id = auth.uid()
);

drop policy if exists "Submitters read own exhibition recommendations"
on public.exhibition_book_recommendations;

create policy "Submitters read own exhibition recommendations"
on public.exhibition_book_recommendations
for select
to authenticated
using (
  submitter_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "Admins read exhibition recommendations"
on public.exhibition_book_recommendations;

create policy "Admins read exhibition recommendations"
on public.exhibition_book_recommendations
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins update exhibition recommendations"
on public.exhibition_book_recommendations;

create policy "Admins update exhibition recommendations"
on public.exhibition_book_recommendations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete exhibition recommendations"
on public.exhibition_book_recommendations;

create policy "Admins delete exhibition recommendations"
on public.exhibition_book_recommendations
for delete
to authenticated
using (public.is_admin());

do $$
begin
  alter publication supabase_realtime
  add table public.exhibition_book_recommendations;
exception
  when duplicate_object or undefined_object then null;
end $$;
