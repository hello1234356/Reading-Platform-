-- Identity semantics:
--   profiles.username  = editable public display name
--   profiles.full_name = restricted official school name
--   auth.users.email    = private login identity

create or replace function public.school_email_to_full_name(school_email text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  with parsed as (
    select regexp_replace(
      split_part(lower(btrim(school_email)), '@', 1),
      '_[0-9]{2}$',
      ''
    ) as local_part
  )
  select case
    when local_part ~ '^[a-z]+(\.[a-z]+)*$'
      then initcap(replace(local_part, '.', ' '))
    else null
  end
  from parsed;
$$;

create or replace function public.initial_public_username(
  school_email text,
  user_id uuid
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select left(
    coalesce(
      split_part(public.school_email_to_full_name(school_email), ' ', 1),
      'Reader'
    ),
    30
  ) || '-' || left(replace(user_id::text, '-', ''), 6);
$$;

-- Convert only rows that still have the known legacy shape. Official names
-- are derived by joining profiles.id to auth.users.id; profiles has no email.
-- username is the email local-part and full_name is the chosen public name.
-- Rows whose full_name already matches the derived official name are skipped
-- so reruns do not overwrite profiles that may already use the new semantics.
update public.profiles as profile
set
  username = btrim(profile.full_name),
  full_name = public.school_email_to_full_name(auth_user.email),
  updated_at = now()
from auth.users as auth_user
where auth_user.id = profile.id
  and public.school_email_to_full_name(auth_user.email) is not null
  and lower(regexp_replace(btrim(profile.username), '^@', '')) =
      lower(split_part(auth_user.email, '@', 1))
  and btrim(profile.full_name) <> public.school_email_to_full_name(auth_user.email)
  and char_length(btrim(profile.full_name)) between 1 and 40
  and not exists (
    select 1
    from public.profiles as other_profile
    where other_profile.id <> profile.id
      and lower(btrim(other_profile.username)) =
          lower(btrim(profile.full_name))
  );

-- Patch the function already used by the live on_auth_user_created trigger.
-- The existing grade calculation is intentionally unchanged. Only the two
-- identity values in the profile INSERT use the new semantics.
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
begin
  graduation_suffix :=
    substring(new.email from '_(\d{2})@');

  if graduation_suffix is not null then
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
    grade
  )
  values (
    new.id,
    public.initial_public_username(new.email, new.id),
    coalesce(
      public.school_email_to_full_name(new.email),
      'Reader'
    ),
    calculated_grade
  );

  return new;
end;
$function$;

-- Authenticated clients may edit public profile fields, but may not change
-- the official school name. Dashboard/service operations have
-- auth.uid() = null and can still perform controlled administrative updates.
create or replace function public.protect_profile_school_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and new.full_name is distinct from old.full_name
  then
    raise exception 'Official school name cannot be changed by profile updates';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_school_identity_before_update
on public.profiles;

create trigger protect_profile_school_identity_before_update
before update on public.profiles
for each row execute function public.protect_profile_school_identity();
