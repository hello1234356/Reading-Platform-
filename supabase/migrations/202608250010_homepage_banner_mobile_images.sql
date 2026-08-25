alter table public.homepage_banners
  add column if not exists mobile_image_url text,
  add column if not exists mobile_image_path text,
  add column if not exists mobile_image_position_x numeric,
  add column if not exists mobile_image_position_y numeric;

alter table public.homepage_banners
  drop constraint if exists homepage_banners_mobile_image_position_x_check,
  drop constraint if exists homepage_banners_mobile_image_position_y_check;

alter table public.homepage_banners
  add constraint homepage_banners_mobile_image_position_x_check
    check (mobile_image_position_x is null or mobile_image_position_x between 0 and 100),
  add constraint homepage_banners_mobile_image_position_y_check
    check (mobile_image_position_y is null or mobile_image_position_y between 0 and 100);
