-- Store ratings in half-star increments instead of integer-only values.
-- Support the current tables and the legacy user_books table when present.

do $$
declare
  target_table text;
  constraint_name text;
begin
  foreach target_table in array array['reviews', 'shelves', 'user_books']
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and information_schema.columns.table_name = target_table
        and column_name = 'rating'
    ) then
      continue;
    end if;

    for constraint_name in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = target_table
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%rating%'
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        target_table,
        constraint_name
      );
    end loop;

    execute format(
      'alter table public.%I alter column rating type numeric(2,1) using rating::numeric',
      target_table
    );

    execute format(
      'alter table public.%I add constraint %I check (
        rating is null or (
          rating between 0.5 and 5.0
          and rating * 2 = trunc(rating * 2)
        )
      )',
      target_table,
      target_table || '_rating_half_step_check'
    );
  end loop;
end
$$;
