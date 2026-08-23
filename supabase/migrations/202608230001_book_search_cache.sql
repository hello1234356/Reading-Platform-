begin;

create table public.book_search_cache (
  normalized_query text not null,
  provider text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (provider, normalized_query),
  constraint book_search_cache_query_length_check
    check (char_length(normalized_query) between 1 and 300),
  constraint book_search_cache_provider_check
    check (provider in ('google_books', 'open_library')),
  constraint book_search_cache_result_json_check
    check (
      jsonb_typeof(result_json) = 'object'
      and jsonb_typeof(result_json -> 'results') = 'array'
      and jsonb_array_length(result_json -> 'results') <= 20
    )
);

create index book_search_cache_expires_at_idx
on public.book_search_cache (expires_at);

alter table public.book_search_cache enable row level security;

create policy "Anyone reads unexpired book search cache"
on public.book_search_cache
for select
to anon, authenticated
using (expires_at > now());

create or replace function public.cache_book_search(
  p_normalized_query text,
  p_provider text,
  p_result_json jsonb
)
returns public.book_search_cache
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_value text;
  result_count integer;
  result_item jsonb;
  cache_ttl interval;
  cached_row public.book_search_cache%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to write the book search cache.'
      using errcode = '42501';
  end if;

  normalized_value := lower(
    regexp_replace(btrim(coalesce(p_normalized_query, '')), '\s+', ' ', 'g')
  );

  if normalized_value = '' or char_length(normalized_value) > 300 then
    raise exception 'The normalized search query must contain 1 to 300 characters.';
  end if;

  if normalized_value <> p_normalized_query then
    raise exception 'The search query is not normalized.';
  end if;

  if p_provider not in ('google_books', 'open_library') then
    raise exception 'Unsupported book search provider.';
  end if;

  if p_result_json is null
    or jsonb_typeof(p_result_json) <> 'object'
    or jsonb_typeof(p_result_json -> 'results') <> 'array'
  then
    raise exception 'Cached search data must contain a results array.';
  end if;

  result_count := jsonb_array_length(p_result_json -> 'results');

  if result_count > 20 then
    raise exception 'Cached book searches may contain at most 20 results.';
  end if;

  if pg_column_size(p_result_json) > 200000 then
    raise exception 'Cached book search data exceeds 200000 bytes.';
  end if;

  for result_item in
    select value from jsonb_array_elements(p_result_json -> 'results')
  loop
    if jsonb_typeof(result_item) <> 'object'
      or nullif(btrim(result_item ->> 'title'), '') is null
      or result_item ->> 'source' <> p_provider
    then
      raise exception 'Each cached result must have a title and matching source.';
    end if;

    if p_provider = 'google_books'
      and nullif(btrim(result_item ->> 'googleBooksId'), '') is null
    then
      raise exception 'Google Books cache results require googleBooksId.';
    end if;

    if p_provider = 'open_library'
      and nullif(btrim(coalesce(
        result_item ->> 'openLibraryKey',
        result_item ->> 'editionKey'
      )), '') is null
    then
      raise exception 'Open Library cache results require a provider key.';
    end if;
  end loop;

  cache_ttl := case
    when result_count = 0 then interval '30 minutes'
    when p_provider = 'google_books' then interval '24 hours'
    else interval '12 hours'
  end;

  -- Opportunistic cleanup keeps the ephemeral cache bounded without a cron job.
  delete from public.book_search_cache
  where expires_at <= now();

  insert into public.book_search_cache (
    normalized_query,
    provider,
    result_json,
    created_at,
    expires_at
  )
  values (
    normalized_value,
    p_provider,
    p_result_json,
    now(),
    now() + cache_ttl
  )
  on conflict (provider, normalized_query)
  do update set
    result_json = excluded.result_json,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at
  returning * into cached_row;

  return cached_row;
end;
$$;

revoke all on table public.book_search_cache from anon, authenticated;
grant select on table public.book_search_cache to anon, authenticated;

revoke execute on function public.cache_book_search(text, text, jsonb)
from public, anon;
grant execute on function public.cache_book_search(text, text, jsonb)
to authenticated;

commit;

-- Reversal:
-- drop function if exists public.cache_book_search(text, text, jsonb);
-- drop table if exists public.book_search_cache;
