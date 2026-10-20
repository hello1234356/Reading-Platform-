begin;

-- Organizers already control invitations. Let them add only themselves without
-- replacing a participant-list snapshot or overwriting concurrent invitations.
create function public.creative_market_join() returns void
language plpgsql security definer set search_path = public as $$
declare e public.creative_events;
begin
  if not public.creative_is_organizer('theme-marketplace') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;
  select * into strict e from public.creative_events where slug = 'theme-marketplace' for update;
  if e.phase <> 'collecting' then raise exception 'Pitches are closed.'; end if;
  if exists(select 1 from public.creative_participants where event_slug = e.slug and user_id = auth.uid()) then return; end if;
  if (select count(*) from public.creative_participants where event_slug = e.slug) >= 60 then
    raise exception 'This room already has 60 participants.';
  end if;
  insert into public.creative_participants(event_slug, user_id, position)
    select e.slug, auth.uid(), coalesce(max(position),0)+1 from public.creative_participants where event_slug=e.slug
    on conflict(event_slug,user_id) do nothing;
end;
$$;
revoke all on function public.creative_market_join() from public, anon, authenticated;
grant execute on function public.creative_market_join() to authenticated;

commit;
