-- One-time product reset: surface every existing notification as unread again.
-- Future notifications already default to is_read = false.
update public.notifications
set is_read = false
where is_read = true;
