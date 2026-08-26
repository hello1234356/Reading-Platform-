alter table public.shelves
add column if not exists pages_read integer not null default 0
check (pages_read >= 0);

alter table public.shelves
add column if not exists total_pages integer
check (total_pages is null or total_pages > 0);

update public.shelves
set
  total_pages = coalesce(total_pages, 100),
  pages_read = case
    when shelf = 'read' then coalesce(total_pages, 100)
    else least(
      coalesce(total_pages, 100),
      greatest(0, round((coalesce(progress, 0)::numeric / 100) * coalesce(total_pages, 100))::integer)
    )
  end
where total_pages is null;
