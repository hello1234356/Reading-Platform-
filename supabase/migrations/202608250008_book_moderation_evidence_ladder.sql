-- Extend the existing moderation cache for evidence-aware identity and policy confidence.
alter table public.book_moderation_assessments
  add column if not exists identity_confidence double precision not null default 0
    check (identity_confidence between 0 and 1),
  add column if not exists moderation_confidence double precision not null default 0
    check (moderation_confidence between 0 and 1),
  add column if not exists knowledge_source text not null default 'provider_evidence'
    check (knowledge_source in ('provider_evidence', 'model_prior_knowledge', 'combined')),
  add column if not exists synopsis text not null default '',
  add column if not exists themes text[] not null default '{}',
  add column if not exists reason_for_review text not null default '';

alter table public.book_moderation_assessments
drop constraint if exists book_moderation_assessments_evidence_quality_check;

alter table public.book_moderation_assessments
add constraint book_moderation_assessments_evidence_quality_check
check (evidence_quality in ('high', 'medium', 'low', 'very_low', 'insufficient'));

-- Existing confidence represented moderation confidence in V1.
update public.book_moderation_assessments
set moderation_confidence = confidence
where moderation_confidence = 0 and confidence > 0;

-- Cached provider payloads may have been written after broad-category removal.
-- Clearing this bounded search cache ensures those filtered payloads cannot survive rollout.
do $$
begin
  if to_regclass('public.book_search_cache') is not null then
    delete from public.book_search_cache;
  end if;
end;
$$;
