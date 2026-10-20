begin;

-- Keep the existing event tables, access model, submitted sentences and IDs.
alter table public.creative_events
  add column turns_per_writer integer not null default 2 check (turns_per_writer between 1 and 8),
  add column first_writer_id uuid references public.profiles(id),
  add column second_writer_id uuid references public.profiles(id),
  add column paused_phase text check (paused_phase in ('scheduled','free')),
  add column pitch_opens_at timestamptz,
  add column pitch_closes_at timestamptz,
  add constraint creative_pitch_window check (pitch_opens_at is null or pitch_closes_at is null or pitch_opens_at<pitch_closes_at);
-- An unmatched writer is a reserved slot, never a fabricated account.
create table public.creative_writer_slots (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(btrim(name)) between 1 and 100),
  student_id text,
  user_id uuid unique references public.profiles(id) on delete set null,
  position integer not null,
  active boolean not null default true
);
alter table public.creative_writer_slots enable row level security;
revoke all on public.creative_writer_slots from public,anon,authenticated;
alter table public.relay_turns alter column user_id drop not null;
alter table public.relay_turns add column slot_id uuid references public.creative_writer_slots(id);
alter table public.relay_turns add constraint relay_slot_round_unique unique(event_slug,slot_id,round);
-- Adopt existing memberships/turns without changing their user IDs or text.
insert into public.creative_writer_slots(name,user_id,position,active)
  select coalesce(nullif(p.full_name,''),p.username,'Writer'),u.id,coalesce(m.position,999),m.user_id is not null
  from (select user_id id from public.creative_participants where event_slug='story-relay'
    union select user_id from public.relay_turns where event_slug='story-relay') u
  join public.profiles p on p.id=u.id
  left join public.creative_participants m on m.event_slug='story-relay' and m.user_id=u.id;
update public.relay_turns t set slot_id=s.id from public.creative_writer_slots s where t.event_slug='story-relay' and t.user_id=s.user_id;

insert into public.creative_writer_slots(name,student_id,position)
  select name,nullif(student_id,''),n from (values
    (1,'Carrie Wang',''),(2,'Yiru Yang',''),(3,'Maxim Jiang',''),(4,'Claire Yu',''),(5,'Leo Huo',''),
    (6,'Selina Xu',''),(7,'Albert Wang',''),(8,'Cecilia Yan',''),(9,'Yiyan Qiu','T20281125'),
    (10,'Nick Xu',''),(11,'Payson Dong',''),(12,'Eric Bin',''),(13,'Audrey Lee',''),(14,'Kristy Gai',''),(15,'Eason Pan','')) roster(n,name,student_id)
  where not exists(select 1 from public.creative_writer_slots where active);

alter table public.relay_turns drop constraint relay_turns_round_check;
alter table public.relay_turns add constraint relay_turns_round_check check (round between 1 and 8);
-- Do not invent timestamps for legacy pitches. New submissions get a timestamp.
alter table public.theme_pitches add column created_at timestamptz;
alter table public.theme_pitches alter column created_at set default now();
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid='public.creative_events'::regclass and contype='c' and pg_get_constraintdef(oid) like '%phase%' loop
    execute format('alter table public.creative_events drop constraint %I',c.conname);
  end loop;
end;
$$;
alter table public.creative_events add constraint creative_events_phase_check check (
  (kind='relay' and phase in ('draft','scheduled','paused','free','closed','revealed')) or
  (kind='market' and phase in ('collecting','voting','results')));
alter table public.creative_events add constraint creative_paused_phase_check check (paused_phase is null or paused_phase in ('scheduled','free'));

create function public.creative_normalize(p_value text) returns text
language sql immutable set search_path=public as $$
  select regexp_replace(lower(coalesce(p_value,'')), '[^[:alnum:]]', '', 'g');
$$;

-- Suggestions are read-only. Nothing gains event access until an organizer
-- reviews and confirms the UUIDs. Private email/ID evidence stays organizer-only.
create function public.creative_expected_writers() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.creative_is_organizer('story-relay') then raise exception 'Organizer access required.' using errcode='42501'; end if;
  return (select jsonb_agg(jsonb_build_object('name',name,'studentId',student_id) order by n) from (values
    (1,'Carrie Wang',''),(2,'Yiru Yang',''),(3,'Maxim Jiang',''),(4,'Claire Yu',''),(5,'Leo Huo',''),
    (6,'Selina Xu',''),(7,'Albert Wang',''),(8,'Cecilia Yan',''),(9,'Yiyan Qiu','T20281125'),
    (10,'Nick Xu',''),(11,'Payson Dong',''),(12,'Eric Bin',''),(13,'Audrey Lee',''),(14,'Kristy Gai',''),(15,'Eason Pan','')) roster(n,name,student_id));
end;
$$;

create function public.creative_match_writers(p_expected jsonb default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.creative_is_organizer('story-relay') then raise exception 'Organizer access required.' using errcode='42501'; end if;
  if p_expected is null then p_expected:=public.creative_expected_writers(); end if;
  if jsonb_typeof(p_expected)<>'array' or jsonb_array_length(p_expected) not between 2 and 60 then raise exception 'Supply the expected writers.'; end if;
  with expected as (
    select n, left(value->>'name',100) name, left(coalesce(value->>'studentId',''),80) student_id
    from jsonb_array_elements(p_expected) with ordinality a(value,n)
  ), scored as (
    select x.n,p.id,coalesce(nullif(p.full_name,''),p.username,'Writer') name,p.username,u.email,
      case
        when x.student_id<>'' and public.creative_normalize(x.student_id) in (
          public.creative_normalize(to_jsonb(p)->>'student_id'), public.creative_normalize(to_jsonb(p)->>'student_number'),
          public.creative_normalize(u.raw_user_meta_data->>'student_id'),public.creative_normalize(u.raw_user_meta_data->>'studentId'),
          public.creative_normalize(u.raw_user_meta_data->>'student_number')) then 100
        when public.creative_normalize(p.full_name)=public.creative_normalize(x.name) then 90
        when public.creative_normalize(public.school_email_to_full_name(u.email))=public.creative_normalize(x.name) then 85
        when public.creative_normalize(p.username)=public.creative_normalize(x.name) then 80
        when not exists(select 1 from regexp_split_to_table(lower(btrim(x.name)), '[[:space:]]+') word
          where position(word in lower(coalesce(p.full_name,'') || ' ' || coalesce(p.username,'') || ' ' || coalesce(u.email,'')))=0) then 40
        when position(lower(split_part(x.name,' ',1)) in lower(coalesce(p.full_name,'') || ' ' || coalesce(p.username,'') || ' ' || coalesce(u.email,'')))>0
          or position(lower(split_part(x.name,' ',2)) in lower(coalesce(p.full_name,'') || ' ' || coalesce(p.username,'') || ' ' || coalesce(u.email,'')))>0 then 20
        else 0 end score
    from expected x cross join public.profiles p join auth.users u on u.id=p.id
    where nullif(btrim(x.name),'') is not null
  ), ranked as (
    select *,row_number() over(partition by n order by score desc,name,id) rank from scored where score>0
  )
  select jsonb_agg(jsonb_build_object('position',x.n,'name',x.name,'studentId',x.student_id,'pinned',x.n<=2,
    'proposedId',case when (select count(*) from scored s where s.n=x.n and score>=80)=1
      then (select s.id from scored s where s.n=x.n and score>=80 limit 1) else null end,
    'status',case when (select count(*) from scored s where s.n=x.n and score>=80)>1 then 'ambiguous'
      when (select count(*) from scored s where s.n=x.n and score>=80)=1 then 'proposed' else 'unmatched' end,
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'username',r.username,'email',r.email,
      'evidence',case when score=100 then 'Student ID' when score=90 then 'Official name' when score=85 then 'School email' when score=80 then 'Display name' else 'Possible name match' end)
      order by score desc,name,id) from ranked r where r.n=x.n and rank<=10),'[]'::jsonb)) order by x.n)
    into result from expected x;
  return result;
end;
$$;

create function public.creative_save_writer_slots(p_slots jsonb,p_confirm boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare e public.creative_events; item jsonb; v_slots jsonb; v_ids uuid[]; v_slot uuid; v_user uuid; v_name text;
  v_index integer:=0; v_turn_ids uuid[]; v_try uuid[]; v_valid boolean:=false; i integer;
begin
  if not public.creative_is_organizer('story-relay') then raise exception 'Organizer access required.' using errcode='42501'; end if;
  perform 1 from public.creative_events where slug='story-relay' for update;
  perform 1 from public.creative_events where slug='theme-marketplace' for update;
  select * into strict e from public.creative_events where slug='story-relay';
  if e.phase not in ('draft','scheduled') and not(e.phase='paused' and e.paused_phase='scheduled') then raise exception 'The scheduled roster is already closed.'; end if;
  if jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots) not between 2 and 60 then raise exception 'Select at least two roster slots.'; end if;
  -- Real accounts first; unmatched students stay at the bottom in source order.
  select jsonb_agg(value order by nullif(value->>'id','') is null,n) into v_slots
    from jsonb_array_elements(p_slots) with ordinality a(value,n);
  if exists(select 1 from jsonb_array_elements(v_slots) a where nullif(btrim(a->>'name'),'') is null)
    or (select count(distinct public.creative_normalize(a->>'name')) from jsonb_array_elements(v_slots) a)<>jsonb_array_length(v_slots)
  then raise exception 'Give each roster slot a distinct name.'; end if;
  select coalesce(array_agg((a->>'id')::uuid order by n) filter(where nullif(a->>'id','') is not null),'{}'::uuid[]) into v_ids
    from jsonb_array_elements(v_slots) with ordinality t(a,n);
  if (select count(distinct id) from unnest(v_ids) id)<>cardinality(v_ids) or exists(select 1 from unnest(v_ids) u(id) where not exists(select 1 from public.profiles p where p.id=u.id))
  then raise exception 'Use distinct existing accounts; leave unknown accounts pending.'; end if;
  if p_confirm then
    if public.creative_normalize(v_slots->0->>'name')<>'carriewang' or public.creative_normalize(v_slots->1->>'name')<>'yiruyang' or cardinality(v_ids)<2
    then raise exception 'Confirm Carrie Wang first and Yiru Yang second.'; end if;
    update public.creative_events set first_writer_id=v_ids[1],second_writer_id=v_ids[2] where slug=e.slug;
    e.first_writer_id:=v_ids[1];e.second_writer_id:=v_ids[2];
  end if;
  if (e.first_writer_id is not null and (v_slots->0->>'id')::uuid is distinct from e.first_writer_id) or
     (e.second_writer_id is not null and (v_slots->1->>'id')::uuid is distinct from e.second_writer_id)
  then raise exception 'Keep Carrie Wang first and Yiru Yang second.'; end if;
  if e.phase<>'draft' and cardinality(v_ids)<2 then raise exception 'Keep at least two matched writers while the relay is running.'; end if;
  -- Keep old slots for historical credit; only current slots control access.
  update public.creative_writer_slots set active=false,user_id=null;
  for item in select value from jsonb_array_elements(v_slots) loop
    v_index:=v_index+1;v_name:=btrim(item->>'name');v_user:=nullif(item->>'id','')::uuid;
    select id into v_slot from public.creative_writer_slots where id=nullif(item->>'slotId','')::uuid
      or public.creative_normalize(name)=public.creative_normalize(v_name) order by (id=nullif(item->>'slotId','')::uuid) desc nulls last,id limit 1;
    if v_slot is null then
      insert into public.creative_writer_slots(name,student_id,user_id,position) values(v_name,nullif(item->>'studentId',''),v_user,v_index) returning id into v_slot;
    else
      update public.creative_writer_slots set name=v_name,student_id=coalesce(nullif(item->>'studentId',''),student_id),user_id=v_user,position=v_index,active=true where id=v_slot;
    end if;
  end loop;
  delete from public.creative_participants where event_slug=e.slug;
  insert into public.creative_participants select e.slug,user_id,position from public.creative_writer_slots where active and user_id is not null;
  if (select count(*) from public.creative_participants where event_slug='theme-marketplace')+
    (select count(*) from unnest(v_ids) u(id) where not exists(select 1 from public.creative_participants p where p.event_slug='theme-marketplace' and p.user_id=u.id))>60
  then raise exception 'The marketplace participant limit would be exceeded.'; end if;
  insert into public.creative_participants(event_slug,user_id,position)
    select 'theme-marketplace',u.id,(select coalesce(max(position),0) from public.creative_participants where event_slug='theme-marketplace')+u.n
    from unnest(v_ids) with ordinality u(id,n) on conflict(event_slug,user_id) do nothing;
  if e.phase='draft' then return; end if;
  delete from public.relay_turns t where t.event_slug=e.slug and t.completed_at is null and not exists(select 1 from public.creative_writer_slots s where s.id=t.slot_id and s.active);
  update public.relay_turns t set user_id=s.user_id,
    activated_at=case when t.user_id is distinct from s.user_id then null else t.activated_at end,
    notified_at=case when t.user_id is distinct from s.user_id then null else t.notified_at end
    from public.creative_writer_slots s where t.slot_id=s.id and t.completed_at is null;
  insert into public.relay_turns(event_slug,slot_id,user_id,round,position)
    select e.slug,s.id,s.user_id,r,(r-1)*jsonb_array_length(v_slots)+s.position
    from public.creative_writer_slots s cross join generate_series(1,e.turns_per_writer) r where s.active
      and not exists(select 1 from public.relay_turns t where t.event_slug=e.slug and t.slot_id=s.id and t.round=r);
  select array_agg(t.id order by t.user_id is null,t.round,s.position,t.id) into v_turn_ids from public.relay_turns t
    join public.creative_writer_slots s on s.id=t.slot_id where t.event_slug=e.slug and t.completed_at is null;
  if coalesce(cardinality(v_turn_ids),0)>0 then
    for i in 0..cardinality(v_turn_ids)-1 loop
      v_try:=v_turn_ids[2:i+1] || v_turn_ids[1:1] || v_turn_ids[i+2:cardinality(v_turn_ids)];
      begin perform public.creative_reorder(e.slug,v_try);v_valid:=true;exit;
      exception when raise_exception then null;end;
    end loop;
    if not v_valid then
      if exists(select 1 from public.relay_turns where event_slug=e.slug and completed_at is null and user_id is null) then
        -- Binding one late account must not require resolving every other one.
        -- Eligibility still blocks the previous author from writing twice.
        update public.relay_turns t set position=u.n,activated_at=null from unnest(v_turn_ids) with ordinality u(id,n) where t.id=u.id;
      else raise exception 'This roster leaves consecutive turns for one writer. Keep another writer in the queue.'; end if;
    end if;
  end if;
  perform public.creative_advance(e.slug);
end;
$$;

-- Compatibility for existing organizer clients that save a UUID list.
create function public.creative_save_relay_roster(p_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
declare slots jsonb;
begin
  if p_ids is null or (select count(distinct id) from unnest(p_ids) id)<>cardinality(p_ids) then raise exception 'Select distinct registered users.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(p.full_name,''),p.username,'Writer')) order by u.n),'[]'::jsonb) into slots
    from unnest(p_ids) with ordinality u(id,n) left join public.profiles p on p.id=u.id;
  slots:=slots || (select coalesce(jsonb_agg(jsonb_build_object('slotId',id,'id',null,'name',name,'studentId',student_id) order by position),'[]'::jsonb) from public.creative_writer_slots where active and user_id is null and (exists(select 1 from public.creative_writer_slots where active and user_id is not null) or exists(select 1 from public.creative_events where slug='story-relay' and first_writer_id is not null)));
  perform public.creative_save_writer_slots(slots,false);
end;
$$;

create or replace function public.creative_reorder(p_slug text, p_ids uuid[]) returns void
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
    if v_current is null then continue; end if;
    if v_current = v_previous then raise exception 'Keep another writer between consecutive turns.'; end if;
    v_previous := v_current;
  end loop;
  update public.relay_turns t set position = u.n, activated_at = null
    from unnest(p_ids) with ordinality u(id,n) where t.id = u.id;
end;
$$;
create or replace function public.creative_advance(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.creative_events; t public.relay_turns; v_ids uuid[]; v_new uuid[]; v_index integer;
begin
  select * into e from public.creative_events where slug = p_slug for update;
  if e.kind <> 'relay' then return; end if;
  if e.claim_until <= now() then
    update public.creative_events set claim_user = null, claim_token = null, claim_until = null where slug = p_slug;
  end if;
  if e.phase <> 'scheduled' or now() < e.starts_at then return; end if;
  -- Keep unresolved accounts at the bottom; their opportunities stay reserved.
  update public.relay_turns pending_turn set position=q.n from (select id,row_number() over(order by (user_id is null),position,id) n
    from public.relay_turns where event_slug=p_slug and completed_at is null) q where pending_turn.id=q.id;
  select * into t from public.relay_turns where event_slug=p_slug and completed_at is null and user_id is not null and user_id is distinct from (select author_id from public.relay_sentences where event_slug=p_slug order by id desc limit 1) order by position,id limit 1;
  if not found then
    -- Completion never opens free writing automatically; the organizer does.
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
    select * into t from public.relay_turns where event_slug = p_slug and completed_at is null and user_id is not null and user_id is distinct from (select author_id from public.relay_sentences where event_slug=p_slug order by id desc limit 1) order by position, id limit 1;
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

create or replace function public.creative_event_state(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.creative_events; v_admin boolean; v_member boolean; v_queue jsonb; v_turn public.relay_turns;
  v_last public.relay_sentences; v_can_write boolean; v_pitches jsonb; v_story jsonb;
begin
  if not public.creative_can_access(p_slug) then raise exception 'This room is invitation only.' using errcode = '42501'; end if;
  perform public.creative_advance(p_slug);
  select * into strict e from public.creative_events where slug = p_slug;
  v_admin := public.creative_is_organizer(p_slug);
  v_member := exists(select 1 from public.creative_participants where event_slug = p_slug and user_id = auth.uid());
  select * into v_turn from public.relay_turns where event_slug = p_slug and completed_at is null and user_id is not null and user_id is distinct from (select author_id from public.relay_sentences where event_slug=p_slug order by id desc limit 1) order by position, id limit 1;
  select * into v_last from public.relay_sentences where event_slug = p_slug order by id desc limit 1;
  v_can_write := v_member and ((e.phase = 'scheduled' and now() >= e.starts_at and v_turn.user_id = auth.uid())
    or (e.phase = 'free' and e.claim_user = auth.uid() and e.claim_until > now()));
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'userId', t.user_id,
    'name', coalesce(nullif(p.full_name,''),p.username,s.name,'Writer'), 'slotId',t.slot_id,'pendingAccount',t.user_id is null, 'round', t.round, 'done', t.completed_at is not null, 'current',t.id=v_turn.id and e.phase='scheduled' and now()>=e.starts_at)
    order by (t.completed_at is null), t.completed_at, t.position, t.id), '[]'::jsonb)
    into v_queue from public.relay_turns t left join public.profiles p on p.id = t.user_id left join public.creative_writer_slots s on s.id=t.slot_id where t.event_slug = p_slug;
  if e.phase = 'revealed' or v_admin then
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'sentence', s.sentence,
      'name', coalesce(nullif(p.full_name,''),p.username,'Writer'),
      'authorId', case when v_admin then s.author_id else null end, 'createdAt', case when v_admin then s.created_at else null end) order by s.id), '[]'::jsonb)
    into v_story from public.relay_sentences s left join public.profiles p on p.id = s.author_id where s.event_slug = p_slug;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'theme', p.theme, 'ideaOne', p.idea_one, 'ideaTwo', p.idea_two,
    'mine', p.author_id = auth.uid(),
    'authorId', case when v_admin then p.author_id else null end,
    'authorName', case when v_admin then (select coalesce(nullif(full_name,''),username,'Writer') from public.profiles where id=p.author_id) else null end,
    'createdAt', case when v_admin then p.created_at else null end,
    'myVotes', coalesce((select votes from public.theme_votes where pitch_id = p.id and user_id = auth.uid()),0),
    'votes', case when e.phase = 'results' then coalesce((select sum(votes) from public.theme_votes where pitch_id = p.id),0) else null end)
    order by p.id), '[]'::jsonb)
  into v_pitches from public.theme_pitches p where p.event_slug = p_slug
    and (e.phase in ('voting','results') or p.author_id = auth.uid() or v_admin);
  return jsonb_build_object('slug', e.slug, 'kind', e.kind, 'phase', e.phase, 'organizer', v_admin, 'member', v_member,
    'startsAt', e.starts_at, 'roundTwoAt', e.round_two_at, 'freeAt', e.free_at, 'revealAt', e.reveal_at,
    'openingSentence', case when v_admin or e.phase = 'revealed' then e.opening_sentence else null end,
    'turnsPerWriter', e.turns_per_writer,
    'scheduledTotal', case when e.phase='draft' then (select count(*) from public.creative_writer_slots where active)*e.turns_per_writer else jsonb_array_length(v_queue) end,
    'rosterSlots',case when e.kind='relay' then (select coalesce(jsonb_agg(jsonb_build_object('slotId',s.id,'id',s.user_id,'name',s.name,
      'studentId',case when v_admin then s.student_id else null end,'pending',s.user_id is null,
      'pinned',coalesce(s.user_id in (e.first_writer_id,e.second_writer_id),false) or public.creative_normalize(s.name) in ('carriewang','yiruyang')) order by s.position,s.id),'[]'::jsonb) from public.creative_writer_slots s where active) else null end,
    'firstWriterId', e.first_writer_id, 'secondWriterId', e.second_writer_id,
    'pausedPhase', e.paused_phase, 'pitchOpensAt', e.pitch_opens_at, 'pitchClosesAt', e.pitch_closes_at,
    'submissionsOpen', e.phase='collecting' and (e.pitch_opens_at is null or now()>=e.pitch_opens_at) and (e.pitch_closes_at is null or now()<e.pitch_closes_at),
    'queue', v_queue, 'canWrite', coalesce(v_can_write,false),
    'writeToken', case when v_can_write then coalesce(v_turn.id::text, e.claim_token::text) else null end,
    'previous', case when v_can_write then coalesce(v_last.sentence, e.opening_sentence) else null end,
    'canClaim', v_member and e.phase = 'free' and e.claim_user is null and v_last.author_id is distinct from auth.uid(),
    'claimUntil', e.claim_until, 'story', v_story, 'pitches', v_pitches,
    'participants', (select coalesce(jsonb_agg(jsonb_build_object('id', p.user_id,
      'name', coalesce(nullif(u.full_name,''),u.username,'Writer')) order by p.position), '[]'::jsonb)
      from public.creative_participants p join public.profiles u on u.id = p.user_id where p.event_slug = p_slug));
end;
$$;

create or replace function public.creative_event_act(p_slug text, p_action text, p_payload jsonb default '{}'::jsonb) returns void
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
      select * into t from public.relay_turns where event_slug = p_slug and completed_at is null and user_id is not null and user_id is distinct from (select author_id from public.relay_sentences where event_slug=p_slug order by id desc limit 1) order by position, id limit 1;
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
    if e.phase <> 'collecting' or (e.pitch_opens_at is not null and now()<e.pitch_opens_at) or (e.pitch_closes_at is not null and now()>=e.pitch_closes_at) then raise exception 'Pitches are closed.'; end if;
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
      select coalesce(array_agg(value::uuid order by n), '{}'::uuid[]) into v_ids
        from jsonb_array_elements_text(p_payload->'ids') with ordinality a(value,n);
      if e.kind='relay' then
        perform public.creative_save_relay_roster(v_ids);
      else
        if e.phase <> 'collecting' then raise exception 'Voting participants are fixed once the marketplace opens.'; end if;
        if cardinality(v_ids)>60 or (select count(distinct id) from unnest(v_ids) id)<>cardinality(v_ids) then raise exception 'Select distinct registered users.'; end if;
        delete from public.creative_participants where event_slug=p_slug;
        insert into public.creative_participants select p_slug,id,n from unnest(v_ids) with ordinality a(id,n);
      end if;
    elsif p_action = 'replace-writer' and e.kind = 'relay' and e.phase in ('scheduled','paused','free','closed') then
      v_old := (p_payload->>'oldId')::uuid; v_user := (p_payload->>'newId')::uuid;
      if v_old is null or v_user is null or not exists(select 1 from public.creative_participants where event_slug=p_slug and user_id=v_old)
        or exists(select 1 from public.creative_participants where event_slug=p_slug and user_id=v_user)
      then raise exception 'Choose an invited writer and a new registered replacement.'; end if;
      if v_old in (e.first_writer_id,e.second_writer_id) then raise exception 'Correct the first two accounts through roster matching.'; end if;
      update public.creative_writer_slots set user_id=v_user,name=(select coalesce(nullif(full_name,''),username,'Writer') from public.profiles where id=v_user) where active and user_id=v_old;
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
      if e.phase<>'draft' and (p_payload ? 'turnsPerWriter') and (p_payload->>'turnsPerWriter')::integer<>e.turns_per_writer then raise exception 'Turn count is fixed after starting.'; end if;
      update public.creative_events set turns_per_writer=coalesce((p_payload->>'turnsPerWriter')::integer,e.turns_per_writer), starts_at = v_dates[1], round_two_at = v_dates[2], free_at = v_dates[3], reveal_at = v_dates[4],
        opening_sentence = btrim(p_payload->>'openingSentence') where slug = p_slug;
    elsif p_action = 'start' and e.kind = 'relay' and e.phase = 'draft' then
      select count(*) into v_count from public.creative_writer_slots where active;
      if (select count(*) from public.creative_writer_slots where active and user_id is not null)<2 or not public.creative_sentence_valid(e.opening_sentence) then raise exception 'Select at least two writers and save an opening sentence first.'; end if;
      insert into public.relay_turns(event_slug,slot_id,user_id,round,position)
        select p_slug,s.id,s.user_id,r,(r-1)*v_count+row_number() over(partition by r order by s.position)
        from public.creative_writer_slots s cross join generate_series(1,e.turns_per_writer) r where s.active;
      update public.creative_events set phase = 'scheduled' where slug = p_slug;
      perform public.creative_advance(p_slug);
    elsif p_action = 'reorder' and (e.phase='scheduled' or (e.phase='paused' and e.paused_phase='scheduled')) then
      select array_agg(value::uuid order by n) into v_ids from jsonb_array_elements_text(p_payload->'ids') with ordinality a(value,n);
      perform public.creative_reorder(p_slug, v_ids);
      perform public.creative_advance(p_slug);
    elsif p_action='open-free' and e.kind='relay' and e.phase='scheduled' then
      if exists(select 1 from public.relay_turns where event_slug=p_slug and completed_at is null) then raise exception 'Finish all scheduled turns first.'; end if;
      update public.creative_events set phase='free' where slug=p_slug;
    elsif p_action='pause' and e.kind='relay' and e.phase in ('scheduled','free') then
      update public.creative_events set paused_phase=phase,phase='paused',claim_user=null,claim_token=null,claim_until=null where slug=p_slug;
    elsif p_action='resume' and e.kind='relay' and e.phase='paused' then
      update public.creative_events set phase=paused_phase,paused_phase=null where slug=p_slug;
      update public.relay_turns set activated_at=null where event_slug=p_slug and completed_at is null;
      perform public.creative_advance(p_slug);
    elsif p_action='market-settings' and e.kind='market' and e.phase='collecting' then
      update public.creative_events set pitch_opens_at=nullif(p_payload->>'opensAt','')::timestamptz,
        pitch_closes_at=nullif(p_payload->>'closesAt','')::timestamptz where slug=p_slug;
    elsif p_action = 'close' and e.kind = 'relay' and e.phase in ('scheduled','paused','free') then
      if exists(select 1 from public.relay_turns where event_slug = p_slug and completed_at is null) then raise exception 'Finish scheduled turns first.'; end if;
      update public.creative_events set phase = 'closed', paused_phase=null, claim_user = null, claim_token = null, claim_until = null where slug = p_slug;
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
$$;create or replace function public.creative_find_users(p_slug text,p_query text) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.creative_is_organizer(p_slug) then raise exception 'Organizer access required.' using errcode='42501'; end if;
  if char_length(btrim(p_query))<2 then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'username',username,'email',email)),'[]'::jsonb)
    from (select p.id,coalesce(nullif(p.full_name,''),p.username,'Writer') name,p.username,u.email
      from public.profiles p join auth.users u on u.id=p.id
      where coalesce(p.full_name,'') ilike '%' || left(p_query,80) || '%' or coalesce(p.username,'') ilike '%' || left(p_query,80) || '%'
        or coalesce(u.email,'') ilike '%' || left(p_query,80) || '%'
        or public.creative_normalize(p_query) in (public.creative_normalize(to_jsonb(p)->>'student_id'),public.creative_normalize(to_jsonb(p)->>'student_number'),
          public.creative_normalize(u.raw_user_meta_data->>'student_id'),public.creative_normalize(u.raw_user_meta_data->>'studentId'),public.creative_normalize(u.raw_user_meta_data->>'student_number'))
      order by p.full_name,p.id limit 20) matches);
end;
$$;

revoke all on function public.creative_expected_writers(),public.creative_normalize(text),public.creative_match_writers(jsonb),public.creative_save_relay_roster(uuid[]),public.creative_save_writer_slots(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.creative_match_writers(jsonb),public.creative_save_writer_slots(jsonb,boolean) to authenticated;
commit;
