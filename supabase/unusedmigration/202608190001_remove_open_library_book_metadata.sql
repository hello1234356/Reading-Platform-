-- Remove metadata that still points at Open Library without deleting shared
-- book rows. Books are referenced by shelves, feed posts, reviews, and book
-- clubs, so deleting those rows would also delete or detach user content.
--
-- This migration is intentionally idempotent and supports both cover column
-- names used by versions of this project (`cover_url` and `cover_image`).

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'cover_url'
  ) then
    update public.books
    set cover_url = null
    where cover_url ~* '^https?://(?:covers\.)?openlibrary\.org/';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'cover_image'
  ) then
    update public.books
    set cover_image = null
    where cover_image ~* '^https?://(?:covers\.)?openlibrary\.org/';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'description'
  ) then
    update public.books
    set description = ''
    where description ~* 'open\s+library|openlibrary\.org';
  end if;
end
$$;

