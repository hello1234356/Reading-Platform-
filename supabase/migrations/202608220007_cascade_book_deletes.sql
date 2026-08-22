do $$
begin
  if to_regclass('public.shelves') is not null then
    alter table public.shelves
    drop constraint if exists shelves_book_id_fkey;

    alter table public.shelves
    add constraint shelves_book_id_fkey
    foreign key (book_id)
    references public.books(id)
    on delete cascade;
  end if;

  if to_regclass('public.reviews') is not null then
    alter table public.reviews
    drop constraint if exists reviews_book_id_fkey;

    alter table public.reviews
    add constraint reviews_book_id_fkey
    foreign key (book_id)
    references public.books(id)
    on delete cascade;
  end if;

  if to_regclass('public.posts') is not null then
    alter table public.posts
    drop constraint if exists posts_book_id_fkey;

    alter table public.posts
    add constraint posts_book_id_fkey
    foreign key (book_id)
    references public.books(id)
    on delete cascade;
  end if;

  if to_regclass('public.book_clubs') is not null then
    alter table public.book_clubs
    drop constraint if exists book_clubs_book_id_fkey;

    alter table public.book_clubs
    add constraint book_clubs_book_id_fkey
    foreign key (book_id)
    references public.books(id)
    on delete cascade;
  end if;

  if to_regclass('public.book_submissions') is not null then
    alter table public.book_submissions
    drop constraint if exists book_submissions_approved_book_id_fkey;

    alter table public.book_submissions
    add constraint book_submissions_approved_book_id_fkey
    foreign key (approved_book_id)
    references public.books(id)
    on delete cascade;
  end if;

  if to_regclass('public.user_books') is not null then
    alter table public.user_books
    drop constraint if exists user_books_book_id_fkey;

    alter table public.user_books
    add constraint user_books_book_id_fkey
    foreign key (book_id)
    references public.books(id)
    on delete cascade;
  end if;
end;
$$;
