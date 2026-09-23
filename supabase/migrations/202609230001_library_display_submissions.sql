begin;

-- A single focused activity; editorial Events content is maintained in the frontend.
create table public.library_display_submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  student_name text not null,
  student_grade text,
  book_id bigint references public.books(id) on delete set null,
  book_title text not null,
  book_author text not null,
  book_isbn text,
  photo_path text not null unique,
  quote text not null check (char_length(btrim(quote)) between 1 and 1000),
  reason text not null check (char_length(btrim(reason)) between 1 and 800),
  status text not null default 'pending' check (status in ('pending', 'reviewed')),
  created_at timestamptz not null default now(),
  unique (student_id)
);

create function public.prepare_library_display_submission() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.student_id := auth.uid();
  select coalesce(nullif(btrim(full_name), ''), nullif(btrim(username), ''), 'Reader'), grade::text
    into new.student_name, new.student_grade from public.profiles where id = auth.uid();
  select title, coalesce(author, ''), isbn into new.book_title, new.book_author, new.book_isbn
    from public.books where id = new.book_id;
  if new.book_title is null then raise exception 'Select a catalog book'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'library-display-photos' and name = new.photo_path
    and (storage.foldername(name))[1] = auth.uid()::text) then
    raise exception 'Upload your photo first';
  end if;
  new.status := 'pending';
  new.created_at := now();
  return new;
end;
$$;
create trigger prepare_library_display_submission before insert on public.library_display_submissions
for each row execute function public.prepare_library_display_submission();
revoke all on function public.prepare_library_display_submission() from public;

alter table public.library_display_submissions enable row level security;
revoke all on public.library_display_submissions from anon, authenticated;
grant select on public.library_display_submissions to authenticated;
grant insert (student_id, book_id, photo_path, quote, reason) on public.library_display_submissions to authenticated;
grant update (status) on public.library_display_submissions to authenticated;
create policy "Students read own display submission; admins read all" on public.library_display_submissions
for select to authenticated using (student_id = auth.uid() or public.is_admin());
create policy "Students submit own display recommendation" on public.library_display_submissions
for insert to authenticated with check (student_id = auth.uid() and status = 'pending');
create policy "Admins review display submissions" on public.library_display_submissions
for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-display-photos', 'library-display-photos', false, 5242880, array['image/jpeg','image/png','image/webp']);
create policy "Upload own library display photo" on storage.objects for insert to authenticated
with check (bucket_id = 'library-display-photos' and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (select 1 from public.library_display_submissions where student_id = auth.uid()));
create policy "Read private library display photos" on storage.objects for select to authenticated
using (bucket_id = 'library-display-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "Remove unused own display photos" on storage.objects for delete to authenticated
using (bucket_id = 'library-display-photos' and (storage.foldername(name))[1] = auth.uid()::text
  and not exists (select 1 from public.library_display_submissions where photo_path = name));

commit;
