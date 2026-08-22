alter table public.books
add column if not exists source text,
add column if not exists external_id text;

create unique index if not exists books_source_external_id_unique
on public.books(source, external_id)
where source is not null
  and external_id is not null;
