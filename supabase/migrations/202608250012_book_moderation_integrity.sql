-- Make human decisions policy-version independent, bind community identities,
-- rate-limit AI work, and enforce approved decisions on restricted mutations.

-- Reconcile columns present in the deployed catalog but missing from the
-- checked-in baseline so a fresh database can run modern book migrations.
alter table public.books
add column if not exists cover_url text,
add column if not exists shelf text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'books'
      and column_name = 'cover_image'
  ) then
    execute $copy$
      update public.books
      set cover_url = cover_image
      where nullif(btrim(coalesce(cover_url, '')), '') is null
        and nullif(btrim(coalesce(cover_image, '')), '') is not null
    $copy$;
  end if;
end;
$$;

create index if not exists book_moderation_manual_identity_idx
on public.book_moderation_assessments(source, external_id, reviewed_at desc)
where manually_reviewed;

create or replace function public.set_community_book_external_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'community'
    and nullif(btrim(coalesce(new.external_id, '')), '') is null
  then
    new.external_id := 'book:' || new.id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists set_community_book_external_id_before_write on public.books;
create trigger set_community_book_external_id_before_write
before insert or update of source, external_id on public.books
for each row execute function public.set_community_book_external_id();

update public.books
set external_id = 'book:' || id::text
where source = 'community'
  and nullif(btrim(coalesce(external_id, '')), '') is null;

create or replace function public.record_approved_submission_book_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved_book public.books%rowtype;
  assessment_id uuid;
  previous_status text;
  approved_source text;
  approved_external_id text;
begin
  if new.status <> 'approved' or new.approved_book_id is null
    or (old.status = new.status and old.approved_book_id is not distinct from new.approved_book_id)
  then
    return new;
  end if;

  select * into approved_book from public.books where id = new.approved_book_id;
  if not found then return new; end if;

  approved_source := coalesce(nullif(btrim(approved_book.source), ''), 'community');
  approved_external_id := coalesce(
    nullif(btrim(approved_book.external_id), ''),
    'book:' || approved_book.id::text
  );

  select candidate.status into previous_status
  from public.book_moderation_assessments as candidate
  where candidate.source = approved_source
    and candidate.external_id = approved_external_id
    and candidate.policy_version = 'school-books-2026-08-v3';

  insert into public.book_moderation_assessments (
    book_id, source, external_id, status, confidence,
    identity_confidence, moderation_confidence, knowledge_source,
    evidence_quality, risk_scores, flags, summary, evidence,
    policy_version, model_version, manually_reviewed, reviewed_by, reviewed_at
  ) values (
    approved_book.id,
    approved_source,
    approved_external_id,
    'approved', 1, 1, 1, 'provider_evidence',
    case when nullif(btrim(coalesce(approved_book.description, '')), '') is null
      then 'very_low' else 'low' end,
    '{}'::jsonb,
    array['human_submission_approval']::text[],
    'Approved through the separate human book-submission workflow.',
    jsonb_build_object(
      'title', approved_book.title,
      'authors', jsonb_build_array(approved_book.author),
      'description', coalesce(approved_book.description, ''),
      'categories', case when nullif(btrim(coalesce(approved_book.genre, '')), '') is null
        then '[]'::jsonb else jsonb_build_array(approved_book.genre) end,
      'subjects', '[]'::jsonb,
      'publisher', coalesce(approved_book.publisher, ''),
      'publicationYear', approved_book.publication_year,
      'isbn', coalesce(approved_book.isbn, ''),
      'language', coalesce(approved_book.language, ''),
      'coverUrl', coalesce(approved_book.cover_url, '')
    ),
    'school-books-2026-08-v3', 'human:book_submission',
    true, auth.uid(), now()
  )
  on conflict (source, external_id, policy_version) do update set
    book_id = excluded.book_id,
    status = excluded.status,
    confidence = excluded.confidence,
    identity_confidence = excluded.identity_confidence,
    moderation_confidence = excluded.moderation_confidence,
    knowledge_source = excluded.knowledge_source,
    evidence_quality = excluded.evidence_quality,
    risk_scores = excluded.risk_scores,
    flags = excluded.flags,
    summary = excluded.summary,
    evidence = excluded.evidence,
    model_version = excluded.model_version,
    manually_reviewed = true,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    updated_at = now()
  returning id into assessment_id;

  if assessment_id is not null then
    insert into public.book_moderation_events (
      assessment_id, event_type, actor_id, previous_status, next_status, details
    ) values (
      assessment_id, 'human_approved', auth.uid(), previous_status, 'approved',
      jsonb_build_object('origin', 'book_submission', 'submission_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_approved_submission_book_moderation on public.book_submissions;
create trigger record_approved_submission_book_moderation
after update of status, approved_book_id on public.book_submissions
for each row execute function public.record_approved_submission_book_moderation();

create table if not exists public.book_moderation_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  book_count integer not null default 0 check (book_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_started_at)
);

alter table public.book_moderation_rate_limits enable row level security;
revoke all on table public.book_moderation_rate_limits from anon, authenticated;

create or replace function public.consume_book_moderation_quota(
  p_user_id uuid,
  p_book_count integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  quota_window timestamptz;
  next_count integer;
begin
  if p_user_id is null or p_book_count < 1 or p_book_count > 10 then
    return false;
  end if;

  quota_window := to_timestamp(
    floor(extract(epoch from now()) / 600) * 600
  );

  delete from public.book_moderation_rate_limits
  where window_started_at < now() - interval '1 day';

  insert into public.book_moderation_rate_limits (
    user_id, window_started_at, book_count, updated_at
  ) values (
    p_user_id, quota_window, p_book_count, now()
  )
  on conflict (user_id, window_started_at)
  do update set
    book_count = public.book_moderation_rate_limits.book_count + excluded.book_count,
    updated_at = now()
  returning book_count into next_count;

  -- Ten ordinary 20-result searches per ten-minute window remain possible,
  -- while one account cannot create unbounded provider spend.
  return next_count <= 200;
end;
$$;

revoke all on function public.consume_book_moderation_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_book_moderation_quota(uuid, integer) to service_role;

create or replace function public.has_approved_book_moderation(
  p_source text,
  p_external_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select assessment.status = 'approved'
    from public.book_moderation_assessments as assessment
    where assessment.source = p_source
      and assessment.external_id = p_external_id
      and (
        assessment.manually_reviewed
        or assessment.policy_version = 'school-books-2026-08-v3'
      )
    order by
      assessment.manually_reviewed desc,
      case when assessment.manually_reviewed
        then assessment.reviewed_at else assessment.updated_at end desc nulls last
    limit 1
  ), false);
$$;

create or replace function public.can_use_moderated_book(p_book_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_source text;
  target_external_id text;
  effective_status text;
begin
  if p_book_id is null then return true; end if;

  select source, external_id
  into target_source, target_external_id
  from public.books
  where id = p_book_id;

  if not found then return false; end if;

  select assessment.status
  into effective_status
  from public.book_moderation_assessments as assessment
  where assessment.source = target_source
    and assessment.external_id = target_external_id
    and (
      assessment.manually_reviewed
      or assessment.policy_version = 'school-books-2026-08-v3'
    )
  order by
    assessment.manually_reviewed desc,
    case when assessment.manually_reviewed
      then assessment.reviewed_at else assessment.updated_at end desc nulls last
  limit 1;

  -- Existing catalog rows without any applicable assessment remain usable.
  -- New provider rows cannot enter the catalog without an approved assessment
  -- because the books INSERT policy below is stricter.
  return effective_status is null or effective_status = 'approved';
end;
$$;

revoke all on function public.has_approved_book_moderation(text, text) from public, anon;
revoke all on function public.can_use_moderated_book(bigint) from public, anon;
grant execute on function public.has_approved_book_moderation(text, text) to authenticated;
grant execute on function public.can_use_moderated_book(bigint) to authenticated;

create or replace function public.materialize_approved_book(
  p_source text,
  p_external_id text
)
returns public.books
language plpgsql
security definer
set search_path = ''
as $$
declare
  assessment public.book_moderation_assessments%rowtype;
  saved public.books%rowtype;
  resolved_author text;
  resolved_isbn text;
  resolved_year integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to save a book.';
  end if;
  p_source := btrim(coalesce(p_source, ''));
  p_external_id := btrim(coalesce(p_external_id, ''));
  if p_source not in ('google_books', 'open_library', 'isbn_work')
    or p_external_id = '' or char_length(p_external_id) > 300
  then
    raise exception 'Book provider identity is invalid.';
  end if;

  select candidate.* into assessment
  from public.book_moderation_assessments as candidate
  where candidate.source = p_source
    and candidate.external_id = p_external_id
    and (candidate.manually_reviewed
      or candidate.policy_version = 'school-books-2026-08-v3')
  order by
    candidate.manually_reviewed desc,
    case when candidate.manually_reviewed
      then candidate.reviewed_at else candidate.updated_at end desc nulls last
  limit 1;

  if not found or assessment.status <> 'approved' then
    raise exception 'This book does not have an approved moderation decision.';
  end if;
  if nullif(btrim(coalesce(assessment.evidence ->> 'title', '')), '') is null then
    raise exception 'Approved book evidence is missing a title.';
  end if;

  select string_agg(left(value, 300), ', ' order by ordinal)
  into resolved_author
  from jsonb_array_elements_text(
    case when jsonb_typeof(assessment.evidence -> 'authors') = 'array'
      then assessment.evidence -> 'authors' else '[]'::jsonb end
  ) with ordinality as author(value, ordinal);

  resolved_isbn := upper(regexp_replace(
    coalesce(assessment.evidence ->> 'isbn', ''), '[^0-9Xx]', '', 'g'
  ));
  if char_length(resolved_isbn) not in (10, 13) then resolved_isbn := null; end if;
  if coalesce(assessment.evidence ->> 'publicationYear', '') ~ '^\d{1,4}$' then
    resolved_year := (assessment.evidence ->> 'publicationYear')::integer;
  end if;

  select * into saved
  from public.books
  where source = p_source and external_id = p_external_id;
  if found then return saved; end if;

  begin
    insert into public.books (
      title, author, isbn, source, external_id, cover_url, description,
      genre, language, publisher, publication_year, shelf
    ) values (
      left(btrim(assessment.evidence ->> 'title'), 500),
      left(coalesce(nullif(btrim(resolved_author), ''), 'Unknown author'), 1000),
      resolved_isbn,
      p_source,
      p_external_id,
      nullif(left(btrim(coalesce(assessment.evidence ->> 'coverUrl', '')), 2000), ''),
      left(coalesce(assessment.evidence ->> 'description', ''), 12000),
      left(coalesce(assessment.evidence -> 'categories' ->> 0, ''), 500),
      left(coalesce(assessment.evidence ->> 'language', ''), 40),
      left(coalesce(assessment.evidence ->> 'publisher', ''), 500),
      resolved_year,
      null
    )
    returning * into saved;
  exception
    when unique_violation then
      select * into saved
      from public.books
      where (source = p_source and external_id = p_external_id)
        or (resolved_isbn is not null and isbn = resolved_isbn)
      order by (source = p_source and external_id = p_external_id) desc
      limit 1;
      if not found then raise; end if;
  end;

  return saved;
end;
$$;

revoke all on function public.materialize_approved_book(text, text) from public, anon;
grant execute on function public.materialize_approved_book(text, text) to authenticated;

-- Catalog rows must be created through the function above so the title,
-- author, description, and ISBN come from attested assessment evidence.
revoke insert on table public.books from authenticated;

-- This baseline policy remained active because a later migration dropped a
-- differently named policy. Permissive PostgreSQL policies are ORed together.
drop policy if exists "Students add books" on public.books;

drop policy if exists "Authenticated users can add books" on public.books;
create policy "Authenticated users can add approved books"
on public.books for insert to authenticated
with check (
  source in ('google_books', 'open_library', 'isbn_work')
  and nullif(btrim(coalesce(external_id, '')), '') is not null
  and public.has_approved_book_moderation(source, external_id)
);

drop policy if exists "Users can add own shelf books" on public.shelves;
create policy "Users can add own approved shelf books"
on public.shelves for insert to authenticated
with check (
  auth.uid() = user_id
  and public.can_use_moderated_book(book_id)
);

drop policy if exists "Users can update own shelf books" on public.shelves;
create policy "Users can update own approved shelf books"
on public.shelves for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.can_use_moderated_book(book_id)
);

drop policy if exists "Users can create their own reviews" on public.reviews;
create policy "Users can review approved books"
on public.reviews for insert to authenticated
with check (
  auth.uid() = user_id
  and public.can_use_moderated_book(book_id)
);

drop policy if exists "Users can update their own reviews" on public.reviews;
create policy "Users can update reviews for approved books"
on public.reviews for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.can_use_moderated_book(book_id)
);

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create posts for approved books"
on public.posts for insert to authenticated
with check (
  auth.uid() = user_id
  and (book_id is null or public.can_use_moderated_book(book_id))
);

drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update posts for approved books"
on public.posts for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (book_id is null or public.can_use_moderated_book(book_id))
);

drop policy if exists "Users can create clubs" on public.book_clubs;
create policy "Users can create clubs for approved books"
on public.book_clubs for insert to authenticated
with check (
  creator_id = auth.uid()
  and (book_id is null or public.can_use_moderated_book(book_id))
);

drop policy if exists "Hosts can edit clubs" on public.book_clubs;
create policy "Hosts can edit clubs for approved books"
on public.book_clubs for update to authenticated
using (creator_id = auth.uid())
with check (
  creator_id = auth.uid()
  and (book_id is null or public.can_use_moderated_book(book_id))
);

create or replace function public.review_book_moderation_assessment(
  p_assessment_id uuid,
  p_decision text
)
returns public.book_moderation_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.book_moderation_assessments%rowtype;
  next_status text;
  next_manual boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review book assessments.';
  end if;

  if p_decision = 'approve' then
    next_status := 'approved';
    next_manual := true;
  elsif p_decision = 'block' then
    next_status := 'blocked';
    next_manual := true;
  elsif p_decision = 'review_required' then
    next_status := 'review_required';
    next_manual := false;
  else
    raise exception 'Decision must be approve, block, or review_required.';
  end if;

  select * into target
  from public.book_moderation_assessments
  where id = p_assessment_id
  for update;

  if not found then raise exception 'Book assessment not found.'; end if;

  insert into public.book_moderation_events (
    assessment_id, event_type, actor_id, previous_status, next_status
  ) values (
    target.id,
    case p_decision
      when 'approve' then 'human_approved'
      when 'block' then 'human_blocked'
      else 'returned_to_review'
    end,
    auth.uid(), target.status, next_status
  );

  if next_manual then
    update public.book_moderation_assessments
    set status = next_status,
        manually_reviewed = true,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
    where id = target.id
    returning * into target;
  else
    -- Returning an identity to automation clears every active historical
    -- override for that identity; the immutable event rows preserve history.
    update public.book_moderation_assessments
    set manually_reviewed = false,
        reviewed_by = null,
        reviewed_at = null,
        updated_at = case when id = target.id then now() else updated_at end
    where source = target.source
      and external_id = target.external_id;

    update public.book_moderation_assessments
    set status = next_status,
        updated_at = now()
    where id = target.id
    returning * into target;
  end if;

  return target;
end;
$$;

revoke all on function public.review_book_moderation_assessment(uuid, text) from public;
grant execute on function public.review_book_moderation_assessment(uuid, text) to authenticated;

-- Resolve manual-vs-current-policy precedence before filtering or pagination.
-- This prevents a fixed client-side fetch window from hiding legitimate work.
create or replace function public.list_effective_book_moderation_assessments(
  p_status text default 'review_required',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  book_id bigint,
  source text,
  external_id text,
  status text,
  confidence double precision,
  identity_confidence double precision,
  moderation_confidence double precision,
  knowledge_source text,
  evidence_quality text,
  risk_scores jsonb,
  flags text[],
  summary text,
  synopsis text,
  themes text[],
  reason_for_review text,
  evidence jsonb,
  policy_version text,
  model_version text,
  manually_reviewed boolean,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  book_title text,
  book_author text,
  book_cover_url text,
  user_report_count bigint,
  failure_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can read book assessments.';
  end if;

  if coalesce(p_status, 'all') not in (
    'all', 'pending', 'approved', 'review_required', 'blocked', 'error'
  ) then
    raise exception 'Unknown book assessment status.';
  end if;

  return query
  with ranked as (
    select
      assessment.*,
      row_number() over (
        partition by assessment.source, assessment.external_id
        order by
          assessment.manually_reviewed desc,
          case when assessment.manually_reviewed
            then assessment.reviewed_at else assessment.updated_at end desc nulls last,
          assessment.updated_at desc,
          assessment.created_at desc,
          assessment.id desc
      ) as authority_rank
    from public.book_moderation_assessments as assessment
    where assessment.manually_reviewed
      or assessment.policy_version = 'school-books-2026-08-v3'
  )
  select
    ranked.id,
    ranked.book_id,
    ranked.source,
    ranked.external_id,
    ranked.status,
    ranked.confidence,
    ranked.identity_confidence,
    ranked.moderation_confidence,
    ranked.knowledge_source,
    ranked.evidence_quality,
    ranked.risk_scores,
    ranked.flags,
    ranked.summary,
    ranked.synopsis,
    ranked.themes,
    ranked.reason_for_review,
    ranked.evidence,
    ranked.policy_version,
    ranked.model_version,
    ranked.manually_reviewed,
    ranked.reviewed_by,
    ranked.reviewed_at,
    ranked.created_at,
    ranked.updated_at,
    catalog_book.title,
    catalog_book.author,
    catalog_book.cover_url,
    (
      select count(*)
      from public.book_moderation_events as report_event
      where report_event.assessment_id = ranked.id
        and report_event.event_type = 'user_reported_block'
    ),
    case when ranked.status = 'error'
      then coalesce(ranked.flags[1], 'moderation_error')
      else null
    end
  from ranked
  left join public.books as catalog_book on catalog_book.id = ranked.book_id
  where ranked.authority_rank = 1
    and (
      coalesce(p_status, 'all') = 'all'
      or ranked.status = p_status
    )
  order by
    case when ranked.manually_reviewed
      then ranked.reviewed_at else ranked.updated_at end desc nulls last,
    ranked.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_effective_book_moderation_assessments(
  text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_effective_book_moderation_assessments(
  text, integer, integer
) to authenticated;
