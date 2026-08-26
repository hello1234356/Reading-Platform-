create table if not exists public.book_provider_evidence_cache (
  source text not null check (source in ('google_books', 'open_library')),
  external_id text not null,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (source, external_id),
  check (length(external_id) between 1 and 300),
  check (expires_at > verified_at)
);

alter table public.book_provider_evidence_cache enable row level security;

revoke all on table public.book_provider_evidence_cache from anon, authenticated;
grant select, insert, update, delete on table public.book_provider_evidence_cache to service_role;

comment on table public.book_provider_evidence_cache is
  'Service-role-only canonical provider metadata, independent of moderation policy versions.';
