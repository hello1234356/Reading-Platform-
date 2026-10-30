-- One account-level invitation after this release. Never reset this row on logout,
-- subscription changes, or future UI updates. No changes to push delivery tables/triggers.
create table public.desktop_push_onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  presented_at timestamptz not null default now(),
  responded_at timestamptz,
  outcome text not null default 'presented'
    check (outcome in ('presented','dismissed','enabled','denied','already_enabled'))
);
alter table public.desktop_push_onboarding enable row level security;
revoke all on public.desktop_push_onboarding from public,anon,authenticated;
grant select on public.desktop_push_onboarding to authenticated;
grant all on public.desktop_push_onboarding to service_role;
create policy "Users read their own push onboarding" on public.desktop_push_onboarding
  for select to authenticated using (user_id = auth.uid());

-- A unique insert atomically consumes the invitation across all tabs/devices.
-- Only authenticated callers can use these narrowly scoped, ownership-checked RPCs.
create function public.claim_desktop_push_invitation(p_expected_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); claimed uuid; already_enabled boolean;
begin
  if uid is null or uid is distinct from p_expected_user then raise exception 'Authentication required'; end if;
  select exists(select 1 from public.desktop_push_subscriptions s
    join auth.sessions a on a.id=s.session_id and a.user_id=uid
    where s.user_id=uid and (a.not_after is null or a.not_after>now())) into already_enabled;
  insert into public.desktop_push_onboarding(user_id,outcome,responded_at)
    values(uid,case when already_enabled then 'already_enabled' else 'presented' end,
      case when already_enabled then now() else null end)
    on conflict(user_id) do nothing returning user_id into claimed;
  return claimed is not null and not already_enabled;
end $$;

create function public.complete_desktop_push_invitation(p_expected_user uuid,p_outcome text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or uid is distinct from p_expected_user then raise exception 'Authentication required'; end if;
  if p_outcome not in ('dismissed','enabled','denied') or p_outcome is null then raise exception 'Invalid invitation outcome'; end if;
  -- Completion is metadata only: even a failed/offline completion cannot re-enable
  -- an invitation, since the durable claim already exists before the UI opens.
  update public.desktop_push_onboarding set outcome=p_outcome,responded_at=now()
    where user_id=uid and outcome='presented';
end $$;
revoke all on function public.claim_desktop_push_invitation(uuid),public.complete_desktop_push_invitation(uuid,text) from public,anon;
grant execute on function public.claim_desktop_push_invitation(uuid),public.complete_desktop_push_invitation(uuid,text) to authenticated;
