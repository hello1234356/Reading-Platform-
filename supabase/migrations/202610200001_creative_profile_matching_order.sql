begin;

-- Automatic identity proposals use only profiles.full_name. Email and display
-- names remain organizer-only context for explicit manual account selection.
create or replace function public.creative_expected_writers() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.creative_is_organizer('story-relay') then raise exception 'Organizer access required.' using errcode='42501'; end if;
  return (select jsonb_agg(jsonb_build_object('name',name,'studentId',student_id) order by n) from (values
    (1,'Yiru Yang',''),(2,'Leo Huo',''),(3,'Maxim Jiang',''),(4,'Claire Yu',''),(5,'Carrie Wang',''),
    (6,'Selina Xu',''),(7,'Albert Wang',''),(8,'Cecilia Yan',''),(9,'Yiyan Qiu','T20281125'),
    (10,'Nick Xu',''),(11,'Payson Dong',''),(12,'Eric Bin',''),(13,'Audrey Lee',''),(14,'Kristy Gai',''),(15,'Eason Pan','')) roster(n,name,student_id));
end;
$$;

create or replace function public.creative_match_writers(p_expected jsonb default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.creative_is_organizer('story-relay') then raise exception 'Organizer access required.' using errcode='42501'; end if;
  if p_expected is null then p_expected:=public.creative_expected_writers(); end if;
  if jsonb_typeof(p_expected)<>'array' or jsonb_array_length(p_expected) not between 2 and 60 then raise exception 'Supply the expected writers.'; end if;
  with expected as (
    select n,left(value->>'name',100) name,left(coalesce(value->>'studentId',''),80) student_id
    from jsonb_array_elements(p_expected) with ordinality a(value,n)
  ), candidates as (
    select x.n,p.id,p.full_name name,p.username,u.email,
      lower(regexp_replace(btrim(p.full_name),'[[:space:]]+',' ','g'))=
      lower(regexp_replace(btrim(x.name),'[[:space:]]+',' ','g')) exact
    from expected x cross join public.profiles p join auth.users u on u.id=p.id
    where nullif(btrim(x.name),'') is not null and nullif(btrim(p.full_name),'') is not null
      and (lower(regexp_replace(btrim(p.full_name),'[[:space:]]+',' ','g'))=lower(regexp_replace(btrim(x.name),'[[:space:]]+',' ','g'))
        or exists(select 1 from regexp_split_to_table(lower(btrim(x.name)),'[[:space:]]+') word
          where word=any(regexp_split_to_array(lower(btrim(p.full_name)),'[[:space:]]+'))))
  ), ranked as (
    select *,row_number() over(partition by n order by exact desc,name,id) rank from candidates
  )
  select jsonb_agg(jsonb_build_object('position',x.n,'name',x.name,'studentId',x.student_id,'pinned',x.n<=2,
    'proposedId',case when (select count(*) from candidates c where c.n=x.n and exact)=1
      then (select c.id from candidates c where c.n=x.n and exact limit 1) else null end,
    'status',case when (select count(*) from candidates c where c.n=x.n and exact)>1 then 'ambiguous'
      when (select count(*) from candidates c where c.n=x.n and exact)=1 then 'proposed' else 'unmatched' end,
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'username',r.username,'email',r.email,
      'evidence',case when r.exact then 'Profile full name' else 'Possible profile name match' end) order by r.exact desc,r.name,r.id)
      from ranked r where r.n=x.n and r.rank<=10),'[]'::jsonb)) order by x.n) into result from expected x;
  return result;
end;
$$;

create or replace function public.creative_save_writer_slots(p_slots jsonb,p_confirm boolean default false) returns void
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
    if public.creative_normalize(v_slots->0->>'name')<>'yiruyang' or public.creative_normalize(v_slots->1->>'name')<>'leohuo' or cardinality(v_ids)<2
    then raise exception 'Confirm Yiru Yang first and Leo Huo second.'; end if;
    update public.creative_events set first_writer_id=v_ids[1],second_writer_id=v_ids[2] where slug=e.slug;
    e.first_writer_id:=v_ids[1];e.second_writer_id:=v_ids[2];
  end if;
  if (e.first_writer_id is not null and (v_slots->0->>'id')::uuid is distinct from e.first_writer_id) or
     (e.second_writer_id is not null and (v_slots->1->>'id')::uuid is distinct from e.second_writer_id)
  then raise exception 'Keep Yiru Yang first and Leo Huo second.'; end if;
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
      'pinned',coalesce(s.user_id in (e.first_writer_id,e.second_writer_id),false) or public.creative_normalize(s.name) in ('yiruyang','leohuo')) order by s.position,s.id),'[]'::jsonb) from public.creative_writer_slots s where active) else null end,
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

-- Adopt the explicitly corrected order only before launch. Submitted history
-- and an already-running queue are never rewritten by this migration.
do $$
begin
  if exists(select 1 from public.creative_events where slug='story-relay' and phase='draft')
    and not exists(select 1 from public.relay_turns where event_slug='story-relay')
    and exists(select 1 from public.creative_writer_slots where active and name='Yiru Yang')
    and exists(select 1 from public.creative_writer_slots where active and name='Leo Huo') then
    with requested(name,n) as (values
      ('Yiru Yang',1),('Leo Huo',2),('Maxim Jiang',3),('Claire Yu',4),('Carrie Wang',5),
      ('Selina Xu',6),('Albert Wang',7),('Cecilia Yan',8),('Yiyan Qiu',9),('Nick Xu',10),
      ('Payson Dong',11),('Eric Bin',12),('Audrey Lee',13),('Kristy Gai',14),('Eason Pan',15)
    ), ordered as (
      select s.id,row_number() over(order by s.user_id is null,coalesce(r.n,1000+s.position),s.id) n
      from public.creative_writer_slots s left join requested r on lower(btrim(s.name))=lower(r.name) where s.active
    )
    update public.creative_writer_slots s set position=o.n from ordered o where s.id=o.id;
    update public.creative_events set
      first_writer_id=(select user_id from public.creative_writer_slots where active and name='Yiru Yang'),
      second_writer_id=(select user_id from public.creative_writer_slots where active and name='Leo Huo')
      where slug='story-relay';
    update public.creative_participants p set position=s.position from public.creative_writer_slots s
      where s.active and s.user_id=p.user_id and p.event_slug='story-relay';
  end if;
end;
$$;

commit;

