do $$
begin
  create type public.profile_account_type as enum ('student', 'teacher');
exception
  when duplicate_object then null;
end;
$$;

alter table public.profiles
add column if not exists account_type public.profile_account_type not null default 'student';

create or replace function public.school_email_to_account_type(school_email text)
returns public.profile_account_type
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when lower(btrim(school_email)) !~ '@tsinglan\.org$'
      then 'student'::public.profile_account_type
    when lower(btrim(school_email)) ~ '_[0-9]{2}@tsinglan\.org$'
      then 'student'::public.profile_account_type
    else 'teacher'::public.profile_account_type
  end;
$$;

update public.profiles as profile
set
  account_type = public.school_email_to_account_type(auth_user.email),
  grade = case
    when public.school_email_to_account_type(auth_user.email) = 'teacher'
      then null
    else profile.grade
  end,
  updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.id
  and (
    profile.account_type is distinct from
      public.school_email_to_account_type(auth_user.email)
    or (
      public.school_email_to_account_type(auth_user.email) = 'teacher'
      and profile.grade is not null
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  graduation_suffix text;
  graduation_year integer;
  calculated_grade integer;
  calculated_account_type public.profile_account_type;
begin
  calculated_account_type :=
    public.school_email_to_account_type(new.email);

  graduation_suffix :=
    substring(new.email from '_(\d{2})@');

  if calculated_account_type = 'student'
    and graduation_suffix is not null
  then
    graduation_year := 2000 + graduation_suffix::integer;

    calculated_grade :=
      case
        when extract(month from current_date) < 7 then
          12 - (
            graduation_year
            - extract(year from current_date)::integer
          )
        else
          13 - (
            graduation_year
            - extract(year from current_date)::integer
          )
      end;

    if calculated_grade < 9 or calculated_grade > 12 then
      calculated_grade := null;
    end if;
  else
    calculated_grade := null;
  end if;

  insert into public.profiles (
    id,
    username,
    full_name,
    grade,
    account_type
  )
  values (
    new.id,
    public.initial_public_username(new.email, new.id),
    coalesce(
      public.school_email_to_full_name(new.email),
      'Reader'
    ),
    calculated_grade,
    calculated_account_type
  );

  return new;
end;
$function$;