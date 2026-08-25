alter table public.books
add column if not exists cover_last_checked_at timestamptz,
add column if not exists cover_repair_status text not null default 'healthy';

alter table public.books
drop constraint if exists books_cover_repair_status_check;

alter table public.books
add constraint books_cover_repair_status_check
check (cover_repair_status in ('healthy', 'checking', 'failed'));

create index if not exists books_cover_repair_cooldown_idx
on public.books (cover_last_checked_at)
where cover_repair_status in ('checking', 'failed');

create or replace function public.claim_book_cover_repair(
  p_book_id bigint,
  p_stale_cover_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_book public.books%rowtype;
begin
  select *
  into target_book
  from public.books
  where id = p_book_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  if target_book.source not in ('google_books', 'open_library') then
    return jsonb_build_object('claimed', false, 'reason', 'unsupported_source');
  end if;

  if target_book.cover_url is distinct from nullif(btrim(p_stale_cover_url), '') then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'cover_changed',
      'cover_url', target_book.cover_url
    );
  end if;

  if target_book.cover_last_checked_at is not null
    and target_book.cover_last_checked_at > now() - interval '24 hours'
  then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'cooldown',
      'cover_url', target_book.cover_url,
      'status', target_book.cover_repair_status
    );
  end if;

  update public.books
  set
    cover_repair_status = 'checking',
    cover_last_checked_at = now()
  where id = p_book_id;

  return jsonb_build_object(
    'claimed', true,
    'book_id', target_book.id,
    'source', target_book.source,
    'external_id', target_book.external_id,
    'isbn', target_book.isbn,
    'cover_url', target_book.cover_url
  );
end;
$$;

create or replace function public.complete_book_cover_repair(
  p_book_id bigint,
  p_stale_cover_url text,
  p_repaired_cover_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  repaired_url text;
  updated_book public.books%rowtype;
begin
  repaired_url := nullif(btrim(p_repaired_cover_url), '');

  if repaired_url is not null and repaired_url !~* '^https://' then
    raise exception 'Repaired cover URLs must use HTTPS.';
  end if;

  update public.books
  set
    cover_url = coalesce(repaired_url, cover_url),
    cover_repair_status = case when repaired_url is null then 'failed' else 'healthy' end,
    cover_last_checked_at = now()
  where id = p_book_id
    and cover_repair_status = 'checking'
    and cover_url is not distinct from nullif(btrim(p_stale_cover_url), '')
  returning * into updated_book;

  if not found then
    return jsonb_build_object('updated', false, 'reason', 'claim_lost');
  end if;

  return jsonb_build_object(
    'updated', repaired_url is not null,
    'cover_url', updated_book.cover_url,
    'status', updated_book.cover_repair_status
  );
end;
$$;

revoke all on function public.claim_book_cover_repair(bigint, text) from public, anon, authenticated;
revoke all on function public.complete_book_cover_repair(bigint, text, text) from public, anon, authenticated;
grant execute on function public.claim_book_cover_repair(bigint, text) to service_role;
grant execute on function public.complete_book_cover_repair(bigint, text, text) to service_role;
