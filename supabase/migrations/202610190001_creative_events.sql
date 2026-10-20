begin;

-- These tables deliberately have no client grants or RLS policies. Only the
-- narrowly scoped RPCs below can read or write creative-event content.
create table public.creative_events (
  slug text primary key check (slug in ('story-relay', 'theme-marketplace')),
  kind text not null check (kind in ('relay', 'market')),
  phase text not null,
  organizer_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null default '2026-10-20 00:00:00 Asia/Shanghai',
  round_two_at timestamptz not null default '2026-11-04 00:00:00 Asia/Shanghai',
  free_at timestamptz not null default '2026-11-19 00:00:00 Asia/Shanghai',
  reveal_at timestamptz not null default '2026-11-26 00:00:00 Asia/Shanghai',
  opening_sentence text not null default '',
  claim_user uuid references public.profiles(id) on delete set null,
  claim_token uuid,
  claim_until timestamptz,
  check ((kind = 'relay' and phase in ('draft','scheduled','free','closed','revealed'))
    or (kind = 'market' and phase in ('collecting','voting','results'))),
  check (starts_at < round_two_at and round_two_at < free_at and free_at < reveal_at)
);
create table public.creative_participants (
  event_slug text references public.creative_events(slug) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  position integer not null,
  primary key(event_slug, user_id)
);
create table public.relay_turns (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references public.creative_events(slug) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  round integer not null check (round in (1,2)),
  position integer not null,
  activated_at timestamptz,
  notified_at timestamptz,
  completed_at timestamptz,
  unique(event_slug, user_id, round)
);
create table public.relay_sentences (
  id bigint generated always as identity primary key,
  event_slug text not null references public.creative_events(slug) on delete cascade,
  turn_id uuid unique references public.relay_turns(id),
  author_id uuid references public.profiles(id) on delete set null,
  sentence text not null check (char_length(sentence) between 1 and 1000),
  created_at timestamptz not null default now()
);
create table public.theme_pitches (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references public.creative_events(slug) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  theme text not null check (char_length(btrim(theme)) between 1 and 100),
  idea_one text not null check (char_length(btrim(idea_one)) between 1 and 200),
  idea_two text not null check (char_length(btrim(idea_two)) between 1 and 200),
  unique(event_slug, author_id)
);
create table public.theme_votes (
  pitch_id uuid references public.theme_pitches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  votes integer not null check (votes between 1 and 3),
  primary key(pitch_id, user_id)
);
insert into public.creative_events(slug, kind, phase) values
  ('story-relay','relay','draft'), ('theme-marketplace','market','collecting');
alter table public.creative_events enable row level security;
alter table public.creative_participants enable row level security;
alter table public.relay_turns enable row level security;
alter table public.relay_sentences enable row level security;
alter table public.theme_pitches enable row level security;
alter table public.theme_votes enable row level security;
revoke all on public.creative_events, public.creative_participants, public.relay_turns,
  public.relay_sentences, public.theme_pitches, public.theme_votes from public, anon, authenticated;
revoke all on sequence public.relay_sentences_id_seq from public, anon, authenticated;

create function public.creative_is_organizer(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.is_admin() or exists (
    select 1 from public.creative_events where slug = p_slug and organizer_id = auth.uid()));
$$;
create function public.creative_can_access(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.creative_is_organizer(p_slug) or exists (
    select 1 from public.creative_participants where event_slug = p_slug and user_id = auth.uid()));
$$;

-- Safe reordering is shared by the organizer and the automatic deferral. IDs
-- must be exactly the remaining queue; no contribution is discarded.
create function public.creative_reorder(p_slug text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_previous uuid; v_current uuid; v_count integer; v_id uuid;
begin
  select count(*) into v_count from public.relay_turns where event_slug = p_slug and completed_at is null;
  if p_ids is null or cardinality(p_ids) <> v_count or
    (select count(distinct u.id) from unnest(p_ids) u(id)) <> v_count or exists (
      select 1 from unnest(p_ids) u(id) where not exists (
        select 1 from public.relay_turns t where t.id = u.id and t.event_slug = p_slug and t.completed_at is null))
  then raise exception 'Supply the complete remaining queue.'; end if;
  select author_id into v_previous from public.relay_sentences where event_slug = p_slug order by id desc limit 1;
  foreach v_id in array p_ids loop
    select user_id into v_current from public.relay_turns where id = v_id;
    if v_current = v_previous then raise exception 'Keep another writer between consecutive turns.'; end if;
    v_previous := v_current;
  end loop;
  update public.relay_turns t set position = u.n, activated_at = null
    from unnest(p_ids) with ordinality u(id,n) where t.id = u.id;
end;
$$;

create function public.creative_advance(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.creative_events; t public.relay_turns; v_ids uuid[]; v_new uuid[]; v_index integer;
begin
  select * into e from public.creative_events where slug = p_slug for update;
  if e.kind <> 'relay' then return; end if;
  if e.claim_until <= now() then
    update public.creative_events set claim_user = null, claim_token = null, claim_until = null where slug = p_slug;
  end if;
  if e.phase <> 'scheduled' or now() < e.starts_at then return; end if;
  select * into t from public.relay_turns where event_slug = p_slug and completed_at is null order by position, id limit 1;
  if not found then
    if now() >= e.free_at then update public.creative_events set phase = 'free' where slug = p_slug; end if;
    return;
  end if;
  if t.activated_at <= now() - interval '24 hours' then
    select array_agg(id order by position, id) into v_ids from public.relay_turns
      where event_slug = p_slug and completed_at is null and id <> t.id;
    -- Try around five positions later. Validation also prevents adjacent turns
    -- by one writer, including the last completed contribution.
    if cardinality(v_ids) > 0 then
      for v_index in reverse least(5, cardinality(v_ids))..1 loop
        v_new := v_ids[1:v_index] || array[t.id] || v_ids[v_index+1:cardinality(v_ids)];
        begin
          perform public.creative_reorder(p_slug, v_new);
          exit;
        exception when raise_exception then null;
        end;
      end loop;
    end if;
    update public.relay_turns set activated_at = null where id = t.id;
    select * into t from public.relay_turns where event_slug = p_slug and completed_at is null order by position, id limit 1;
  end if;
  if t.activated_at is null then update public.relay_turns set activated_at = now() where id = t.id; end if;
  if t.notified_at is null then
    insert into public.notifications(recipient_id, type, title, body, target_url, entity_type, entity_id, dedupe_key)
    values (t.user_id, 'admin_announcement', 'Your story awaits.', 'One sentence. Make it worse.',
      '/events/story-relay', 'relay_turn', t.id::text, 'relay_turn:' || t.id::text || ':' || t.user_id::text)
    on conflict(dedupe_key) do nothing;
    update public.relay_turns set notified_at = now() where id = t.id;
  end if;
end;
$$;

create function public.creative_event_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'kind', kind, 'phase', phase) order by slug), '[]'::jsonb)
  from public.creative_events where public.creative_can_access(slug);
$$;

create function public.creative_event_state(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.creative_events; v_admin boolean; v_member boolean; v_queue jsonb; v_turn public.relay_turns;
  v_last public.relay_sentences; v_can_write boolean; v_pitches jsonb; v_story jsonb;
begin
  if not public.creative_can_access(p_slug) then raise exception 'This room is invitation only.' using errcode = '42501'; end if;
  perform public.creative_advance(p_slug);
  select * into strict e from public.creative_events where slug = p_slug;
  v_admin := public.creative_is_organizer(p_slug);
  v_member := exists(select 1 from public.creative_participants where event_slug = p_slug and user_id = auth.uid());
  select * into v_turn from public.relay_turns where event_slug = p_slug and completed_at is null order by position, id limit 1;
  select * into v_last from public.relay_sentences where event_slug = p_slug order by id desc limit 1;
  v_can_write := v_member and ((e.phase = 'scheduled' and now() >= e.starts_at and v_turn.user_id = auth.uid())
    or (e.phase = 'free' and e.claim_user = auth.uid() and e.claim_until > now()));
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'userId', t.user_id,
    'name', coalesce(nullif(p.full_name,''),p.username,'Writer'), 'round', t.round, 'done', t.completed_at is not null)
    order by (t.completed_at is null), t.completed_at, t.position, t.id), '[]'::jsonb)
    into v_queue from public.relay_turns t join public.profiles p on p.id = t.user_id where t.event_slug = p_slug;
  if e.phase = 'revealed' or v_admin then
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'sentence', s.sentence,
      'name', coalesce(nullif(p.full_name,''),p.username,'Writer')) order by s.id), '[]'::jsonb)
    into v_story from public.relay_sentences s left join public.profiles p on p.id = s.author_id where s.event_slug = p_slug;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'theme', p.theme, 'ideaOne', p.idea_one, 'ideaTwo', p.idea_two,
    'mine', p.author_id = auth.uid(),
    'myVotes', coalesce((select votes from public.theme_votes where pitch_id = p.id and user_id = auth.uid()),0),
    'votes', case when e.phase = 'results' then coalesce((select sum(votes) from public.theme_votes where pitch_id = p.id),0) else null end)
    order by p.id), '[]'::jsonb)
  into v_pitches from public.theme_pitches p where p.event_slug = p_slug
    and (e.phase in ('voting','results') or p.author_id = auth.uid() or v_admin);
  return jsonb_build_object('slug', e.slug, 'kind', e.kind, 'phase', e.phase, 'organizer', v_admin, 'member', v_member,
    'startsAt', e.starts_at, 'roundTwoAt', e.round_two_at, 'freeAt', e.free_at, 'revealAt', e.reveal_at,
    'openingSentence', case when v_admin or e.phase = 'revealed' then e.opening_sentence else null end,
    'queue', v_queue, 'canWrite', coalesce(v_can_write,false),
    'writeToken', case when v_can_write then coalesce(v_turn.id::text, e.claim_token::text) else null end,
    'previous', case when v_can_write then coalesce(v_last.sentence, e.opening_sentence) else null end,
    'canClaim', v_member and e.phase = 'free' and e.claim_user is null and v_last.author_id is distinct from auth.uid(),
    'claimUntil', e.claim_until, 'story', v_story, 'pitches', v_pitches,
    'participants', case when v_admin then (select coalesce(jsonb_agg(jsonb_build_object('id', p.user_id,
      'name', coalesce(nullif(u.full_name,''),u.username,'Writer')) order by p.position), '[]'::jsonb)
      from public.creative_participants p join public.profiles u on u.id = p.user_id where p.event_slug = p_slug) else null end);
end;
$$;

create function public.creative_sentence_valid(p_sentence text) returns boolean
language sql immutable set search_path = public as $$
  select char_length(btrim(p_sentence)) between 2 and 1000
    and btrim(p_sentence) ~ '[.!?。！？][”’"'')]*$'
    and (select count(*) from regexp_matches(
      regexp_replace(btrim(p_sentence), '\m(Mr|Mrs|Ms|Dr|Prof|St|e\.g|i\.e)\.', '\1', 'gi'),
      '([.!?]+[”’"'')]*(?=[[:space:]]|$)|[。！？]+[”’"'')]*)', 'g')) = 1;
$$;

-- One event-row lock serializes submissions, claims, votes and phase changes.
create function public.creative_event_act(p_slug text, p_action text, p_payload jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e public.creative_events; t public.relay_turns; v_last uuid; v_ids uuid[]; v_count integer;
  v_pitch uuid; v_votes integer; v_delta integer; v_old uuid; v_sentence text; v_user uuid; v_dates timestamptz[];
begin
  if not public.creative_can_access(p_slug) then raise exception 'This room is invitation only.' using errcode = '42501'; end if;
  select * into strict e from public.creative_events where slug = p_slug for update;
  perform public.creative_advance(p_slug);
  select * into e from public.creative_events where slug = p_slug;
  if p_action in ('submit','claim','pitch','vote') and not exists (
    select 1 from public.creative_participants where event_slug = p_slug and user_id = auth.uid())
  then raise exception 'Only invited participants can contribute.'; end if;
  if p_action = 'submit' and e.kind = 'relay' then
    v_sentence := btrim(p_payload->>'sentence');
    if not coalesce(public.creative_sentence_valid(v_sentence),false) then raise exception 'Write exactly one sentence, ending with punctuation.'; end if;
    if e.phase = 'scheduled' and now() >= e.starts_at then
      select * into t from public.relay_turns where event_slug = p_slug and completed_at is null order by position, id limit 1;
      if t.user_id is distinct from auth.uid() or t.id::text is distinct from (p_payload->>'token') then raise exception 'The writing turn has changed. Refresh and try again.'; end if;
      update public.relay_turns set completed_at = now() where id = t.id;
    elsif e.phase = 'free' then
      if e.claim_user is distinct from auth.uid() or e.claim_until <= now() or e.claim_token::text is distinct from (p_payload->>'token')
      then raise exception 'Claim a fresh turn first.'; end if;
    else raise exception 'Submissions are closed.'; end if;
    insert into public.relay_sentences(event_slug, turn_id, author_id, sentence) values (p_slug, t.id, auth.uid(), v_sentence);
    update public.creative_events set claim_user = null, claim_token = null, claim_until = null where slug = p_slug;
    perform public.creative_advance(p_slug);
  elsif p_action = 'claim' and e.kind = 'relay' then
    select author_id into v_last from public.relay_sentences where event_slug = p_slug order by id desc limit 1;
    if e.phase <> 'free' or e.claim_user is not null or v_last = auth.uid() then raise exception 'Another writer goes next.'; end if;
    update public.creative_events set claim_user = auth.uid(), claim_token = gen_random_uuid(), claim_until = now() + interval '15 minutes' where slug = p_slug;
  elsif p_action = 'pitch' and e.kind = 'market' then
    if e.phase <> 'collecting' then raise exception 'Pitches are closed.'; end if;
    insert into public.theme_pitches(event_slug, author_id, theme, idea_one, idea_two)
    values(p_slug, auth.uid(), btrim(p_payload->>'theme'), btrim(p_payload->>'ideaOne'), btrim(p_payload->>'ideaTwo'))
    on conflict(event_slug, author_id) do update set theme = excluded.theme, idea_one = excluded.idea_one, idea_two = excluded.idea_two;
  elsif p_action = 'vote' and e.kind = 'market' then
    if e.phase <> 'voting' then raise exception 'Voting is closed.'; end if;
    v_pitch := (p_payload->>'id')::uuid; v_delta := (p_payload->>'delta')::integer;
    if v_delta is null or v_delta not in (-1,1) or not exists(select 1 from public.theme_pitches where id = v_pitch and event_slug = p_slug)
    then raise exception 'Choose a theme and add or return one vote.'; end if;
    select coalesce(sum(v.votes),0) into v_votes from public.theme_votes v join public.theme_pitches p on p.id = v.pitch_id
      where p.event_slug = p_slug and v.user_id = auth.uid();
    if v_delta = 1 and v_votes >= 3 then raise exception 'You have three votes to share.'; end if;
    select coalesce((select votes from public.theme_votes where pitch_id = v_pitch and user_id = auth.uid()),0) + v_delta into v_count;
    if v_count < 0 then raise exception 'No vote to return.'; end if;
    if v_count = 0 then delete from public.theme_votes where pitch_id = v_pitch and user_id = auth.uid();
    else insert into public.theme_votes values(v_pitch, auth.uid(), v_count)
      on conflict(pitch_id,user_id) do update set votes = excluded.votes; end if;
  else
    if not public.creative_is_organizer(p_slug) then raise exception 'Organizer access required.' using errcode = '42501'; end if;
    if p_action = 'participants' then
      if e.kind = 'relay' and e.phase <> 'draft' then raise exception 'Writing order is already established. Reorder remaining turns instead.'; end if;
      select coalesce(array_agg(value::uuid order by n), '{}'::uuid[]) into v_ids
        from jsonb_array_elements_text(p_payload->'ids') with ordinality a(value,n);
      if cardinality(v_ids) > 60 or (select count(distinct id) from unnest(v_ids) id) <> cardinality(v_ids) then raise exception 'Select distinct registered users.'; end if;
      if e.kind = 'market' and e.phase <> 'collecting' then raise exception 'Voting participants are fixed once the marketplace opens.'; end if;
      delete from public.creative_participants where event_slug = p_slug;
      insert into public.creative_participants select p_slug, id, n from unnest(v_ids) with ordinality a(id,n);
    elsif p_action = 'replace-writer' and e.kind = 'relay' and e.phase in ('scheduled','free','closed') then
      v_old := (p_payload->>'oldId')::uuid; v_user := (p_payload->>'newId')::uuid;
      if v_old is null or v_user is null or not exists(select 1 from public.creative_participants where event_slug=p_slug and user_id=v_old)
        or exists(select 1 from public.creative_participants where event_slug=p_slug and user_id=v_user)
      then raise exception 'Choose an invited writer and a new registered replacement.'; end if;
      update public.creative_participants set user_id=v_user where event_slug=p_slug and user_id=v_old;
      update public.relay_turns set user_id=v_user, activated_at=null, notified_at=null
        where event_slug=p_slug and user_id=v_old and completed_at is null;
      update public.creative_events set claim_user=null,claim_token=null,claim_until=null where slug=p_slug and claim_user=v_old;
      perform public.creative_advance(p_slug);
    elsif p_action = 'settings' and e.kind = 'relay' then
      v_dates := array[(p_payload->>'startsAt')::timestamptz, (p_payload->>'roundTwoAt')::timestamptz,
        (p_payload->>'freeAt')::timestamptz, (p_payload->>'revealAt')::timestamptz];
      if e.phase <> 'draft' and (p_payload->>'openingSentence') is distinct from e.opening_sentence then raise exception 'The opening sentence is already sealed.'; end if;
      if not coalesce(public.creative_sentence_valid(p_payload->>'openingSentence'),false) then raise exception 'Add one opening sentence.'; end if;
      update public.creative_events set starts_at = v_dates[1], round_two_at = v_dates[2], free_at = v_dates[3], reveal_at = v_dates[4],
        opening_sentence = btrim(p_payload->>'openingSentence') where slug = p_slug;
    elsif p_action = 'start' and e.kind = 'relay' and e.phase = 'draft' then
      select count(*) into v_count from public.creative_participants where event_slug = p_slug;
      if v_count <> 15 or not public.creative_sentence_valid(e.opening_sentence) then raise exception 'Invite 15 writers and add an opening sentence first.'; end if;
      insert into public.relay_turns(event_slug,user_id,round,position)
        select p_slug, p.user_id, r, (r-1)*v_count + row_number() over(partition by r order by p.position)
        from public.creative_participants p cross join generate_series(1,2) r where p.event_slug = p_slug;
      update public.creative_events set phase = 'scheduled' where slug = p_slug;
      perform public.creative_advance(p_slug);
    elsif p_action = 'reorder' and e.phase = 'scheduled' then
      select array_agg(value::uuid order by n) into v_ids from jsonb_array_elements_text(p_payload->'ids') with ordinality a(value,n);
      perform public.creative_reorder(p_slug, v_ids);
      perform public.creative_advance(p_slug);
    elsif p_action = 'close' and e.kind = 'relay' and e.phase in ('scheduled','free') then
      if exists(select 1 from public.relay_turns where event_slug = p_slug and completed_at is null) then raise exception 'Finish scheduled turns first.'; end if;
      update public.creative_events set phase = 'closed', claim_user = null, claim_token = null, claim_until = null where slug = p_slug;
    elsif p_action = 'reveal' and e.kind = 'relay' and e.phase = 'closed' and now() >= e.reveal_at then
      update public.creative_events set phase = 'revealed' where slug = p_slug;
    elsif p_action = 'open-voting' and e.kind = 'market' and e.phase = 'collecting' then
      if not exists(select 1 from public.theme_pitches where event_slug = p_slug) then raise exception 'Collect at least one theme first.'; end if;
      update public.creative_events set phase = 'voting' where slug = p_slug;
    elsif p_action = 'close-voting' and e.kind = 'market' and e.phase = 'voting' then
      update public.creative_events set phase = 'results' where slug = p_slug;
    else raise exception 'This action is unavailable in the current phase.'; end if;
  end if;
end;
$$;

create function public.creative_find_users(p_slug text, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.creative_is_organizer(p_slug) then raise exception 'Organizer access required.' using errcode = '42501'; end if;
  if char_length(btrim(p_query)) < 2 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(nullif(full_name,''),username),'username',username)), '[]'::jsonb)
    from (select id,full_name,username from public.profiles where full_name ilike '%' || left(p_query,80) || '%'
      or username ilike '%' || left(p_query,80) || '%' order by username limit 20) p);
end;
$$;

create function public.tick_story_relay() returns void
language plpgsql security definer set search_path = public as $$
begin perform public.creative_advance('story-relay'); end;
$$;

revoke all on function public.creative_is_organizer(text), public.creative_can_access(text),
  public.creative_reorder(text,uuid[]), public.creative_advance(text), public.creative_sentence_valid(text),
  public.tick_story_relay() from public, anon, authenticated;
revoke all on function public.creative_event_list(), public.creative_event_state(text),
  public.creative_event_act(text,text,jsonb), public.creative_find_users(text,text) from public, anon, authenticated;
grant execute on function public.creative_event_list(), public.creative_event_state(text),
  public.creative_event_act(text,text,jsonb), public.creative_find_users(text,text) to authenticated;

-- Invitees can enter their private rooms while public Events remains unpublished.
-- The original public-event backend policies remain unchanged.
create or replace function public.get_events_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('isLive', coalesce((select is_live from public.events_settings where id), false),
    'isAdmin', public.is_admin(), 'isOwner', public.is_owner(),
    'hasCreativeInvite', auth.uid() is not null and exists(select 1 from public.creative_participants where user_id = auth.uid()));
$$;

-- Supabase pg_cron, when available. RPC reads also advance overdue turns, so
-- installations without cron remain correct when participants open the room.
do $$
begin
  if exists(select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('litshelf-story-relay', '* * * * *', 'select public.tick_story_relay()');
  end if;
end;
$$;
commit;
