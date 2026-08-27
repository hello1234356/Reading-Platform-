begin;

drop function if exists public.fill_missing_book_metadata(
  bigint, text, text, text, text, text, text, integer, text
);

create function public.fill_missing_book_metadata(
  p_book_id bigint,
  p_source text,
  p_external_id text,
  p_isbn text,
  p_description text default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_publication_year integer default null,
  p_genre text default null,
  p_language text default null
)
returns public.books
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_book public.books%rowtype;
  updated_book public.books%rowtype;
  normalized_isbn text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to update book metadata.'
      using errcode = '42501';
  end if;

  select * into existing_book
  from public.books
  where id = p_book_id
  for update;

  if not found then raise exception 'Book not found.'; end if;

  normalized_isbn := nullif(
    upper(regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g')),
    ''
  );

  if coalesce(existing_book.source, '') <> coalesce(p_source, '') then
    raise exception 'Book provider does not match.';
  end if;
  if existing_book.external_id is not null
    and existing_book.external_id <> coalesce(p_external_id, '') then
    raise exception 'Book provider identity does not match.';
  end if;
  if existing_book.isbn is not null
    and upper(regexp_replace(existing_book.isbn, '[^0-9Xx]', '', 'g'))
      <> coalesce(normalized_isbn, '') then
    raise exception 'Book ISBN does not match.';
  end if;

  if p_description is not null and char_length(p_description) > 20000 then
    raise exception 'Book description is too long.';
  end if;
  if p_cover_url is not null and p_cover_url !~* '^https?://' then
    raise exception 'Book cover URL must use HTTP or HTTPS.';
  end if;
  if p_publisher is not null and char_length(p_publisher) > 500 then
    raise exception 'Publisher is too long.';
  end if;
  if p_genre is not null and char_length(p_genre) > 500 then
    raise exception 'Genre is too long.';
  end if;
  if p_language is not null and char_length(p_language) > 40 then
    raise exception 'Language is too long.';
  end if;
  if p_publication_year is not null
    and (p_publication_year < 1 or p_publication_year > 2200) then
    raise exception 'Publication year is invalid.';
  end if;

  update public.books
  set
    description = case
      when nullif(btrim(coalesce(description, '')), '') is null
        then coalesce(nullif(btrim(p_description), ''), description)
      else description
    end,
    cover_url = case
      when nullif(btrim(coalesce(cover_url, '')), '') is null
        then coalesce(nullif(btrim(p_cover_url), ''), cover_url)
      else cover_url
    end,
    publisher = case
      when nullif(btrim(coalesce(publisher, '')), '') is null
        then coalesce(nullif(btrim(p_publisher), ''), publisher)
      else publisher
    end,
    publication_year = coalesce(publication_year, p_publication_year),
    genre = case
      when nullif(btrim(coalesce(genre, '')), '') is null
        then coalesce(nullif(btrim(p_genre), ''), genre)
      else genre
    end,
    language = case
      when nullif(btrim(coalesce(language, '')), '') is null
        then coalesce(nullif(btrim(p_language), ''), language)
      else language
    end
  where id = p_book_id
  returning * into updated_book;

  return updated_book;
end;
$$;

revoke execute on function public.fill_missing_book_metadata(
  bigint, text, text, text, text, text, text, integer, text, text
) from public, anon;

grant execute on function public.fill_missing_book_metadata(
  bigint, text, text, text, text, text, text, integer, text, text
) to authenticated;

commit;
