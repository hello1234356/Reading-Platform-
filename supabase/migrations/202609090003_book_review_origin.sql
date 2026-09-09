-- Origin is an event, not search history. Keep AI and human decision
-- actors separate from the immutable materialization initiator.
alter table public.book_moderation_events
  drop constraint book_moderation_events_event_type_check;
alter table public.book_moderation_events
  add constraint book_moderation_events_event_type_check check (event_type in (
    'ai_assessed', 'human_approved', 'human_blocked', 'returned_to_review',
    'policy_reassessment', 'evidence_updated', 'user_reported_block',
    'external_materialized'
  ));

create unique index book_moderation_origin_unique
  on public.book_moderation_events(assessment_id)
  where event_type = 'external_materialized';

-- No FK on the immutable UUID: account deletion must not rewrite provenance.
-- Other event actor_ids keep their existing auth.users FK and deletion behavior.
alter table public.book_moderation_events
  add column initiated_by_user_id uuid;

create function public.protect_book_review_origin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.event_type = 'external_materialized' or new.event_type = 'external_materialized' then
    raise exception 'Book review origin is immutable.';
  end if;
  return new;
end;
$$;
create trigger protect_book_review_origin
before update on public.book_moderation_events
for each row execute function public.protect_book_review_origin();

-- Called only after server-side provider verification. The UUID is supplied by
-- the Edge function's validated getUser(), never by the request body.
create function public.cache_book_evidence_for_review(
  p_source text, p_external_id text, p_evidence jsonb,
  p_verified_at timestamptz, p_expires_at timestamptz,
  p_policy_version text, p_model_version text, p_initiated_by_user_id uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  first_cache boolean := false;
  assessment_id uuid;
begin
  insert into public.book_provider_evidence_cache(source, external_id, evidence, verified_at, expires_at)
  values (p_source, p_external_id, p_evidence, p_verified_at, p_expires_at)
  on conflict (source, external_id) do nothing
  returning true into first_cache;

  -- The unique cache identity serializes concurrent discoveries. An expired
  -- cache is still an existing identity; refreshes can never acquire origin.
  if coalesce(first_cache, false)
    and not exists (select 1 from public.books where source = p_source and external_id = p_external_id)
    and not exists (select 1 from public.book_moderation_assessments where source = p_source and external_id = p_external_id)
  then
    insert into public.book_moderation_assessments(
      source, external_id, evidence, evidence_quality, policy_version, model_version
    ) values (
      p_source, p_external_id, p_evidence, coalesce(p_evidence->>'evidenceQuality', 'very_low'),
      p_policy_version, p_model_version
    ) on conflict (source, external_id, policy_version) do nothing
    returning id into assessment_id;
    if assessment_id is not null then
      insert into public.book_moderation_events(
        assessment_id, event_type, initiated_by_user_id, next_status
      ) values (assessment_id, 'external_materialized', p_initiated_by_user_id, 'pending');
    end if;
  end if;

  if not coalesce(first_cache, false) then
    update public.book_provider_evidence_cache set evidence = p_evidence,
      verified_at = p_verified_at, expires_at = p_expires_at
    where source = p_source and external_id = p_external_id;
  end if;
end;
$$;
revoke all on function public.cache_book_evidence_for_review(text,text,jsonb,timestamptz,timestamptz,text,text,uuid) from public, anon, authenticated;
grant execute on function public.cache_book_evidence_for_review(text,text,jsonb,timestamptz,timestamptz,text,text,uuid) to service_role;

-- Existing event RLS permits SELECT only to is_admin(). No public result or
-- queue RPC includes this column. Resolve across policy versions for audit.
create function public.get_book_review_origin(p_source text, p_external_id text)
returns table(initiation_source text, initiated_by_user_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only admins can inspect review origin.'; end if;
  return query select 'external_search'::text, event.initiated_by_user_id
    from public.book_moderation_events event
    join public.book_moderation_assessments assessment on assessment.id = event.assessment_id
    where assessment.source = p_source and assessment.external_id = p_external_id
      and event.event_type = 'external_materialized'
    order by event.id limit 1;
end;
$$;
revoke all on function public.get_book_review_origin(text,text) from public, anon;
grant execute on function public.get_book_review_origin(text,text) to authenticated;
