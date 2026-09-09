-- Acknowledge only the loaded inbox snapshot, using the existing read tables.
create or replace function public.mark_notifications_read(
  p_notification_ids uuid[], p_announcement_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  update public.notifications set is_read = true
  where recipient_id = auth.uid() and not is_read
    and id = any(p_notification_ids);

  insert into public.public_announcement_reads (announcement_id, user_id, read_at)
  select id, auth.uid(), now() from public.public_announcements
  where id = any(p_announcement_ids) and is_active
    and starts_at <= now() and (ends_at is null or ends_at > now())
  on conflict (announcement_id, user_id) do nothing;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[], uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[], uuid[]) to authenticated;
