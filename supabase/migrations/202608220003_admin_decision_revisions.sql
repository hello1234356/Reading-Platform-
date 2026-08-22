create or replace function public.moderate_book_submission(
  p_submission_id uuid,
  p_decision text,
  p_comment text default null
)
returns public.book_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_moderator_id uuid;
  target_submission public.book_submissions%rowtype;
  resolved_book_id bigint;
  normalized_isbn text;
begin
  current_moderator_id := auth.uid();

  if current_moderator_id is null then
    raise exception 'You must be logged in to moderate book submissions.';
  end if;

  if not public.is_admin() then
    raise exception 'Only admins can moderate book submissions.';
  end if;

  if p_decision is null
    or p_decision not in ('approve', 'reject')
  then
    raise exception 'Moderation decision must be approve or reject.';
  end if;

  select *
  into target_submission
  from public.book_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Book submission not found.';
  end if;

  insert into public.book_submission_votes (
    submission_id,
    moderator_id,
    decision,
    comment
  )
  values (
    p_submission_id,
    current_moderator_id,
    p_decision,
    nullif(btrim(coalesce(p_comment, '')), '')
  )
  on conflict (submission_id, moderator_id) do update
  set
    decision = excluded.decision,
    comment = excluded.comment,
    created_at = now();

  if p_decision = 'approve' then
    normalized_isbn := nullif(
      upper(regexp_replace(
        coalesce(target_submission.isbn, ''),
        '[^0-9Xx]',
        '',
        'g'
      )),
      ''
    );

    if normalized_isbn is not null then
      select books.id
      into resolved_book_id
      from public.books
      where upper(regexp_replace(
        coalesce(books.isbn, ''),
        '[^0-9Xx]',
        '',
        'g'
      )) = normalized_isbn
      limit 1;
    end if;

    if resolved_book_id is null then
      begin
        insert into public.books (
          title,
          author,
          isbn,
          language,
          publisher,
          publication_year,
          description,
          cover_url,
          source,
          external_id
        )
        values (
          target_submission.title,
          target_submission.author,
          normalized_isbn,
          target_submission.language,
          target_submission.publisher,
          target_submission.publication_year,
          target_submission.description,
          target_submission.cover_url,
          'community',
          null
        )
        returning id into resolved_book_id;
      exception
        when unique_violation then
          if normalized_isbn is null then
            raise;
          end if;

          select books.id
          into resolved_book_id
          from public.books
          where upper(regexp_replace(
            coalesce(books.isbn, ''),
            '[^0-9Xx]',
            '',
            'g'
          )) = normalized_isbn
          limit 1;

          if resolved_book_id is null then
            raise;
          end if;
      end;
    end if;

    update public.book_submissions
    set
      status = 'approved',
      approved_book_id = resolved_book_id,
      updated_at = now()
    where id = p_submission_id
    returning * into target_submission;
  else
    update public.book_submissions
    set
      status = 'rejected',
      approved_book_id = null,
      updated_at = now()
    where id = p_submission_id
    returning * into target_submission;
  end if;

  return target_submission;
end;
$$;

create or replace function public.review_moderation_report(
  p_report_id uuid,
  p_status text,
  p_reviewer_note text default null
)
returns public.moderation_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_email text;
  normalized_status text;
  normalized_note text;
  report_row public.moderation_reports%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review moderation reports.';
  end if;

  normalized_status := nullif(btrim(lower(coalesce(p_status, ''))), '');

  if normalized_status is null then
    raise exception 'Moderation review status is required.';
  end if;

  if normalized_status not in ('dismissed', 'concerning', 'resolved') then
    raise exception 'Unknown moderation review status.';
  end if;

  normalized_note := nullif(btrim(coalesce(p_reviewer_note, '')), '');
  reviewer_email := public.current_admin_email();

  select *
  into report_row
  from public.moderation_reports
  where id = p_report_id
  for update;

  if not found then
    raise exception 'Moderation report not found.';
  end if;

  if report_row.status = 'pending'
    and normalized_status not in ('dismissed', 'concerning')
  then
    raise exception 'Pending reports can only be dismissed or marked concerning.';
  end if;

  if report_row.status not in ('pending', 'dismissed', 'concerning', 'resolved') then
    raise exception 'Moderation report status cannot be changed by this workflow.';
  end if;

  update public.moderation_reports
  set
    status = normalized_status,
    reviewed_by_email = reviewer_email,
    reviewed_at = now(),
    reviewer_note = coalesce(normalized_note, report_row.reviewer_note)
  where id = p_report_id
  returning * into report_row;

  return report_row;
end;
$$;

revoke execute on function public.moderate_book_submission(uuid, text, text)
from public;

grant execute on function public.moderate_book_submission(uuid, text, text)
to authenticated;

revoke execute on function public.review_moderation_report(uuid, text, text)
from public;

grant execute on function public.review_moderation_report(uuid, text, text)
to authenticated;
