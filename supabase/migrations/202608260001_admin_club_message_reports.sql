drop policy if exists "Admins read club moderation reports"
on public.club_message_moderation_reports;

create policy "Admins read club moderation reports"
on public.club_message_moderation_reports
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins update club moderation reports"
on public.club_message_moderation_reports;

create policy "Admins update club moderation reports"
on public.club_message_moderation_reports
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

do $$
begin
  alter publication supabase_realtime
  add table public.moderation_reports;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime
  add table public.book_submissions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime
  add table public.club_message_moderation_reports;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
