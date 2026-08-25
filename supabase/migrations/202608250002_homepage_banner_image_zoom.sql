alter table public.homepage_banners
add column if not exists image_zoom numeric not null default 1;

alter table public.homepage_banners
drop constraint if exists homepage_banners_image_zoom_check;

alter table public.homepage_banners
add constraint homepage_banners_image_zoom_check
check (image_zoom >= 1 and image_zoom <= 2.5);
