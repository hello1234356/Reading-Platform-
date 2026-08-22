create or replace function public.delete_moderation_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only owners can delete moderation reports.';
  end if;

  delete from public.moderation_reports
  where id = p_report_id;

  if not found then
    raise exception 'Moderation report not found.';
  end if;
end;
$$;

create or replace function public.delete_book_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only owners can delete book submissions.';
  end if;

  delete from public.book_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'Book submission not found.';
  end if;
end;
$$;

revoke execute on function public.delete_moderation_report(uuid)
from public;

grant execute on function public.delete_moderation_report(uuid)
to authenticated;

revoke execute on function public.delete_book_submission(uuid)
from public;

grant execute on function public.delete_book_submission(uuid)
to authenticated;
