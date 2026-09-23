begin;

create table public.events_settings (
  id boolean primary key default true check (id),
  is_live boolean not null default false
);
insert into public.events_settings (id, is_live) values (true, false);
alter table public.events_settings enable row level security;
revoke all on public.events_settings from anon, authenticated;

create function public.can_access_events() returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_live from public.events_settings where id), false) or public.is_admin();
$$;
revoke all on function public.can_access_events() from public;
grant execute on function public.can_access_events() to authenticated;

create function public.get_events_access() returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'isLive', coalesce((select is_live from public.events_settings where id), false),
    'isAdmin', public.is_admin(),
    'isOwner', public.is_owner()
  );
$$;
revoke all on function public.get_events_access() from public;
grant execute on function public.get_events_access() to anon, authenticated;

create function public.set_events_live(p_is_live boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner() then raise exception 'Only owners can publish Events' using errcode = '42501'; end if;
  if p_is_live is null then raise exception 'Publication state is required'; end if;
  update public.events_settings set is_live = p_is_live where id;
end;
$$;
revoke all on function public.set_events_live(boolean) from public;
grant execute on function public.set_events_live(boolean) to authenticated;

-- Restrictive policies combine with existing ownership/admin policies.
create policy "Events must be available for submission access"
on public.library_display_submissions as restrictive for all to authenticated
using (public.can_access_events()) with check (public.can_access_events());

create policy "Events must be available for display photo access"
on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'library-display-photos' or public.can_access_events())
with check (bucket_id <> 'library-display-photos' or public.can_access_events());

commit;
