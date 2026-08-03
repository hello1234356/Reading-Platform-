create or replace function public.get_grade_leaderboard()
returns table (
  grade smallint,
  books_read bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with grade_list(grade) as (
    values
      (9::smallint),
      (10::smallint),
      (11::smallint),
      (12::smallint)
  ),
  grade_totals as (
    select
      profiles.grade,
      count(shelves.id)::bigint as books_read
    from public.profiles
    left join public.shelves
      on shelves.user_id = profiles.id
      and shelves.shelf = 'read'
    where profiles.account_type = 'student'
      and profiles.grade is not null
    group by profiles.grade
  )
  select
    grade_list.grade,
    coalesce(grade_totals.books_read, 0)::bigint as books_read
  from grade_list
  left join grade_totals
    on grade_totals.grade = grade_list.grade
  order by books_read desc, grade_list.grade asc;
$$;

create or replace function public.get_teacher_leaderboard()
returns table (
  books_read bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(shelves.id)::bigint as books_read
  from public.profiles
  left join public.shelves
    on shelves.user_id = profiles.id
    and shelves.shelf = 'read'
  where profiles.account_type = 'teacher';
$$;

grant execute
on function public.get_grade_leaderboard()
to anon, authenticated;

grant execute
on function public.get_teacher_leaderboard()
to anon, authenticated;