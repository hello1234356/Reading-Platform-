create table if not exists public.homepage_banners (
  id uuid primary key default gen_random_uuid(),
  eyebrow text,
  headline text,
  body text,
  image_url text not null,
  image_path text,
  image_position_x numeric not null default 50,
  image_position_y numeric not null default 50,
  text_alignment text not null default 'left',
  text_vertical_position text not null default 'center',
  font_family text not null default 'lit_serif',
  text_size text not null default 'large',
  text_color text not null default 'cream',
  custom_text_color text,
  overlay_strength text not null default 'medium',
  cta_label text,
  cta_url text,
  sort_order integer not null default 0,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homepage_banners_image_position_x_check check (image_position_x between 0 and 100),
  constraint homepage_banners_image_position_y_check check (image_position_y between 0 and 100),
  constraint homepage_banners_text_alignment_check check (text_alignment in ('left', 'center', 'right')),
  constraint homepage_banners_text_vertical_position_check check (text_vertical_position in ('top', 'center', 'bottom')),
  constraint homepage_banners_font_family_check check (font_family in ('lit_serif', 'lit_sans', 'editorial_serif', 'classic_serif', 'clean_sans')),
  constraint homepage_banners_text_size_check check (text_size in ('small', 'medium', 'large', 'huge')),
  constraint homepage_banners_text_color_check check (text_color in ('cream', 'white', 'brown', 'black', 'custom')),
  constraint homepage_banners_custom_text_color_check check (custom_text_color is null or custom_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint homepage_banners_overlay_strength_check check (overlay_strength in ('none', 'light', 'medium', 'strong')),
  constraint homepage_banners_status_check check (status in ('draft', 'published')),
  constraint homepage_banners_date_range_check check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists homepage_banners_visibility_order_idx
  on public.homepage_banners (status, sort_order, starts_at, ends_at);

create or replace function public.set_homepage_banner_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists homepage_banners_set_updated_at on public.homepage_banners;
create trigger homepage_banners_set_updated_at
before update on public.homepage_banners
for each row execute function public.set_homepage_banner_updated_at();

alter table public.homepage_banners enable row level security;

create policy "Public reads active homepage banners"
on public.homepage_banners
for select
to anon, authenticated
using (
  status = 'published'
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

create policy "Admins read all homepage banners"
on public.homepage_banners
for select
to authenticated
using (public.is_admin());

create policy "Admins create homepage banners"
on public.homepage_banners
for insert
to authenticated
with check (public.is_admin() and created_by = auth.uid());

create policy "Admins update homepage banners"
on public.homepage_banners
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins delete homepage banners"
on public.homepage_banners
for delete
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'homepage-banners',
  'homepage-banners',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public reads homepage banner images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'homepage-banners');

create policy "Admins upload homepage banner images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'homepage-banners' and public.is_admin());

create policy "Admins update homepage banner images"
on storage.objects
for update
to authenticated
using (bucket_id = 'homepage-banners' and public.is_admin())
with check (bucket_id = 'homepage-banners' and public.is_admin());

create policy "Admins delete homepage banner images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'homepage-banners' and public.is_admin());
