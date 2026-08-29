-- Point the "We want your favorite books" homepage banner CTA to the
-- recommendation submission form.

update public.homepage_banners
set
  cta_url = 'https://jsj.top/f/jeLNf1',
  cta_label = coalesce(nullif(btrim(cta_label), ''), 'Submit book recs'),
  updated_at = now()
where
  lower(coalesce(headline, '')) like '%favorite book%'
  or lower(coalesce(body, '')) like '%favorite book%'
  or lower(coalesce(eyebrow, '')) like '%favorite book%';
