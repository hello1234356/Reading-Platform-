create or replace function public.get_grade_leaderboard()
returns table (
  grade smallint,
  books_read bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.shelves') is not null then
    return query execute $sql$
      with grade_list(grade) as (
        values (9::smallint), (10::smallint), (11::smallint), (12::smallint)
      ),
      grade_totals as (
        select
          profiles.grade,
          count(shelves.id)::bigint as books_read
        from public.profiles
        left join public.shelves
          on shelves.user_id = profiles.id
          and shelves.shelf = 'read'
        where coalesce(profiles.account_type::text, 'student') = 'student'
          and profiles.grade is not null
        group by profiles.grade
      )
      select
        grade_list.grade,
        coalesce(grade_totals.books_read, 0)::bigint as books_read
      from grade_list
      left join grade_totals
        on grade_totals.grade = grade_list.grade
      order by books_read desc, grade_list.grade asc
    $sql$;

    return;
  end if;

  return query execute $sql$
    with grade_list(grade) as (
      values (9::smallint), (10::smallint), (11::smallint), (12::smallint)
    ),
    grade_totals as (
      select
        profiles.grade,
        count(user_books.id)::bigint as books_read
      from public.profiles
      left join public.user_books
        on user_books.user_id = profiles.id
        and user_books.status = 'Finished'
      where coalesce(profiles.account_type::text, 'student') = 'student'
        and profiles.grade is not null
      group by profiles.grade
    )
    select
      grade_list.grade,
      coalesce(grade_totals.books_read, 0)::bigint as books_read
    from grade_list
    left join grade_totals
      on grade_totals.grade = grade_list.grade
    order by books_read desc, grade_list.grade asc
  $sql$;
end;
$$;

create or replace function public.get_teacher_leaderboard()
returns table (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  books_read bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.shelves') is not null then
    return query execute $sql$
      select
        profiles.id as user_id,
        profiles.username,
        profiles.full_name,
        profiles.avatar_url,
        count(shelves.id)::bigint as books_read
      from public.profiles
      left join public.shelves
        on shelves.user_id = profiles.id
        and shelves.shelf = 'read'
      where profiles.account_type::text = 'teacher'
      group by
        profiles.id,
        profiles.username,
        profiles.full_name,
        profiles.avatar_url
      order by books_read desc, lower(coalesce(profiles.username, profiles.full_name)) asc
      limit 5
    $sql$;

    return;
  end if;

  return query execute $sql$
    select
      profiles.id as user_id,
      profiles.username,
      profiles.full_name,
      profiles.avatar_url,
      count(user_books.id)::bigint as books_read
    from public.profiles
    left join public.user_books
      on user_books.user_id = profiles.id
      and user_books.status = 'Finished'
    where profiles.account_type::text = 'teacher'
    group by
      profiles.id,
      profiles.username,
      profiles.full_name,
      profiles.avatar_url
    order by books_read desc, lower(coalesce(profiles.username, profiles.full_name)) asc
    limit 5
  $sql$;
end;
$$;

grant execute on function public.get_grade_leaderboard() to anon, authenticated;
grant execute on function public.get_teacher_leaderboard() to anon, authenticated;
