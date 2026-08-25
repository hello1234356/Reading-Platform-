alter table public.book_moderation_events
drop constraint if exists book_moderation_events_event_type_check;

alter table public.book_moderation_events
add constraint book_moderation_events_event_type_check
check (
  event_type in (
    'ai_assessed', 'human_approved', 'human_blocked',
    'returned_to_review', 'policy_reassessment', 'evidence_updated',
    'user_reported_block'
  )
);

create unique index if not exists book_moderation_user_report_unique
on public.book_moderation_events(assessment_id, actor_id, event_type)
where event_type = 'user_reported_block';

create or replace function public.report_blocked_book_moderation(
  p_source text,
  p_external_id text,
  p_policy_version text,
  p_title text,
  p_author text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporting_user_id uuid := auth.uid();
  target public.book_moderation_assessments%rowtype;
  report_event_id bigint;
  resolved_title text;
  resolved_author text;
begin
  if reporting_user_id is null then
    raise exception 'You must be signed in to report a book decision.';
  end if;

  if nullif(btrim(coalesce(p_source, '')), '') is null
    or nullif(btrim(coalesce(p_external_id, '')), '') is null
    or nullif(btrim(coalesce(p_policy_version, '')), '') is null
  then
    raise exception 'Book moderation identity is incomplete.';
  end if;

  if btrim(p_source) not in ('google_books', 'open_library', 'isbn_work', 'community')
    or char_length(p_external_id) > 300
    or char_length(p_policy_version) > 200
  then
    raise exception 'Book moderation identity is invalid.';
  end if;

  select * into target
  from public.book_moderation_assessments
  where source = btrim(p_source)
    and external_id = btrim(p_external_id)
    and policy_version = btrim(p_policy_version);

  if not found then
    raise exception 'Book moderation decision was not found.';
  end if;

  if target.status <> 'blocked' or not target.manually_reviewed then
    raise exception 'Only a final blocked book decision can be reported.';
  end if;

  resolved_title := left(coalesce(
    nullif(btrim(target.evidence ->> 'title'), ''),
    nullif(btrim(coalesce(p_title, '')), ''),
    'Untitled'
  ), 300);
  resolved_author := left(coalesce(
    nullif(btrim((target.evidence -> 'authors') ->> 0), ''),
    nullif(btrim(coalesce(p_author, '')), ''),
    'Unknown author'
  ), 300);

  insert into public.book_moderation_events (
    assessment_id,
    event_type,
    actor_id,
    previous_status,
    next_status,
    details
  ) values (
    target.id,
    'user_reported_block',
    reporting_user_id,
    target.status,
    target.status,
    jsonb_build_object(
      'title', resolved_title,
      'author', resolved_author,
      'source', target.source,
      'external_id', target.external_id,
      'policy_version', target.policy_version,
      'current_moderation_decision', target.status,
      'reporting_user_id', reporting_user_id
    )
  )
  on conflict (assessment_id, actor_id, event_type)
    where event_type = 'user_reported_block'
  do update set details = excluded.details
  returning id into report_event_id;

  return report_event_id;
end;
$$;

revoke all on function public.report_blocked_book_moderation(
  text, text, text, text, text
) from public;
grant execute on function public.report_blocked_book_moderation(
  text, text, text, text, text
) to authenticated;
