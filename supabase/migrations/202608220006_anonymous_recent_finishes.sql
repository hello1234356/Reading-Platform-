create or replace function public.get_recent_finished_books(p_limit integer default 10)
returns table (
  id bigint,
  book_id bigint,
  title text,
  author text,
  isbn text,
  cover_url text,
  source text,
  external_id text,
  rating numeric,
  progress integer,
  finished_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    shelves.id,
    shelves.book_id,
    books.title,
    books.author,
    books.isbn,
    books.cover_url,
    books.source,
    books.external_id,
    shelves.rating::numeric,
    coalesce(shelves.progress, 100),
    shelves.created_at
  from public.shelves
  join public.books
    on books.id = shelves.book_id
  where shelves.shelf = 'read'
  order by shelves.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 20));
$$;

revoke execute on function public.get_recent_finished_books(integer)
from public;

grant execute on function public.get_recent_finished_books(integer)
to authenticated;
