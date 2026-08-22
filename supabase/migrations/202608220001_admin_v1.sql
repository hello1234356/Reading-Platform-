create table if not exists public.admins (
  email text primary key,
  role text not null,
  added_by_email text,
  created_at timestamptz not null default now(),
  constraint admins_email_normalized_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint admins_added_by_email_normalized_check
    check (
      added_by_email is null
      or added_by_email = lower(btrim(added_by_email))
    ),
  constraint admins_role_check
    check (role in ('owner', 'admin'))
);

create unique index if not exists admins_single_owner_unique
on public.admins(role)
where role = 'owner';

alter table public.admins enable row level security;

insert into public.admins (email, role)
values ('carrie.wang_28@tsinglan.org', 'owner')
on conflict (email) do update
set role = 'owner'
where public.admins.email = 'carrie.wang_28@tsinglan.org';

create or replace function public.current_admin_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(lower(coalesce(auth.jwt() ->> 'email', ''))), '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins
    where admins.email = public.current_admin_email()
      and admins.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admins
    where admins.email = public.current_admin_email()
      and admins.role = 'owner'
  );
$$;

create or replace function public.get_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select admins.role
  from public.admins
  where admins.email = public.current_admin_email()
  limit 1;
$$;

drop policy if exists "Admins read admins"
on public.admins;

create policy "Admins read admins"
on public.admins
for select
to authenticated
using (public.is_owner());

create or replace function public.add_admin(p_email text)
returns public.admins
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
  target_email text;
  admin_row public.admins%rowtype;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can add admins.';
  end if;

  owner_email := public.current_admin_email();
  target_email := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if target_email is null
    or target_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  then
    raise exception 'Enter a valid admin email.';
  end if;

  select *
  into admin_row
  from public.admins
  where email = target_email;

  if found then
    if admin_row.role = 'owner' then
      raise exception 'The owner is already configured.';
    end if;

    return admin_row;
  end if;

  insert into public.admins (
    email,
    role,
    added_by_email
  )
  values (
    target_email,
    'admin',
    owner_email
  )
  returning * into admin_row;

  return admin_row;
end;
$$;

create or replace function public.remove_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can remove admins.';
  end if;

  target_email := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if target_email is null then
    raise exception 'Enter an admin email to remove.';
  end if;

  if exists (
    select 1
    from public.admins
    where email = target_email
      and role = 'owner'
  ) then
    raise exception 'The owner cannot be removed.';
  end if;

  delete from public.admins
  where email = target_email
    and role = 'admin';

  if not found then
    raise exception 'Admin not found.';
  end if;
end;
$$;

drop policy if exists "Book moderators read submissions"
on public.book_submissions;

create policy "Admins read book submissions"
on public.book_submissions
for select
to authenticated
using (public.is_admin());

drop policy if exists "Book moderators read submission votes"
on public.book_submission_votes;

create policy "Admins read book submission votes"
on public.book_submission_votes
for select
to authenticated
using (public.is_admin());

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

  if target_submission.status <> 'pending' then
    raise exception 'Book submission has already been resolved.';
  end if;

  begin
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
    );
  exception
    when unique_violation then
      raise exception 'You have already voted on this book submission.';
  end;

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

alter table public.moderation_reports
add column if not exists reviewed_by_email text;

alter table public.moderation_reports
drop constraint if exists moderation_reports_status_check;

alter table public.moderation_reports
add constraint moderation_reports_status_check
check (status in ('pending', 'dismissed', 'concerning', 'resolved'));

create index if not exists moderation_reports_status_created_idx
on public.moderation_reports(status, created_at desc);

drop policy if exists "Admins read moderation reports"
on public.moderation_reports;

create policy "Admins read moderation reports"
on public.moderation_reports
for select
to authenticated
using (public.is_admin());

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

  if report_row.status in ('dismissed', 'resolved') then
    raise exception 'Moderation report has already been resolved.';
  end if;

  if report_row.status = 'pending'
    and normalized_status not in ('dismissed', 'concerning')
  then
    raise exception 'Pending reports can only be dismissed or marked concerning.';
  end if;

  if report_row.status = 'concerning'
    and normalized_status <> 'resolved'
  then
    raise exception 'Concerning reports can only be marked resolved.';
  end if;

  if report_row.status not in ('pending', 'concerning') then
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

revoke execute on function public.current_admin_email()
from public;

grant execute on function public.current_admin_email()
to authenticated;

revoke execute on function public.is_admin()
from public;

grant execute on function public.is_admin()
to authenticated;

revoke execute on function public.is_owner()
from public;

grant execute on function public.is_owner()
to authenticated;

revoke execute on function public.get_admin_role()
from public;

grant execute on function public.get_admin_role()
to authenticated;

revoke execute on function public.add_admin(text)
from public;

grant execute on function public.add_admin(text)
to authenticated;

revoke execute on function public.remove_admin(text)
from public;

grant execute on function public.remove_admin(text)
to authenticated;

revoke execute on function public.moderate_book_submission(uuid, text, text)
from public;

grant execute on function public.moderate_book_submission(uuid, text, text)
to authenticated;

revoke execute on function public.review_moderation_report(uuid, text, text)
from public;

grant execute on function public.review_moderation_report(uuid, text, text)
to authenticated;
