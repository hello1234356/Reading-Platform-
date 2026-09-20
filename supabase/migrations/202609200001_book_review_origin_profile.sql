-- Read-only projection. Never backfill or rewrite historical attribution.
-- Resolve the current username only when an admin opens the origin audit.
create function public.get_book_review_origin_profile(p_source text, p_external_id text)
returns table(initiation_source text, initiated_by_user_id uuid, username text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can inspect review origin.';
  end if;
  return query
    select 'external_search'::text, event.initiated_by_user_id, profile.username::text
    from public.book_moderation_events event
    join public.book_moderation_assessments assessment on assessment.id = event.assessment_id
    left join public.profiles profile on profile.id = event.initiated_by_user_id
    where assessment.source = p_source and assessment.external_id = p_external_id
      and event.event_type = 'external_materialized'
    order by event.id limit 1;
end;
$$;
revoke all on function public.get_book_review_origin_profile(text,text) from public, anon, authenticated;
grant execute on function public.get_book_review_origin_profile(text,text) to authenticated;
