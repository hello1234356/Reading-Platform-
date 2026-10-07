alter table public.exhibition_book_recommendations
add column if not exists book_author text,
add column if not exists book_cover_url text,
add column if not exists book_id bigint references public.books(id) on delete set null;

create index if not exists exhibition_book_recommendations_book_id_idx
on public.exhibition_book_recommendations(book_id);
