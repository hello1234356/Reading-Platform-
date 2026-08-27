-- Let private book notes live beside ratings/reviews without requiring a star
-- rating or forcing the book into the finished shelf.

do $$
begin
  if to_regclass('public.reviews') is not null then
    execute 'alter table public.reviews alter column rating drop not null';
  end if;
end;
$$;
