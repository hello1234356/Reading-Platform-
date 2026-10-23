begin;

-- Count the surrounding sentence independently of punctuation in balanced
-- quoted dialogue. Keep JS and PostgreSQL behavior covered by the same cases.
create or replace function public.creative_sentence_valid(p_sentence text) returns boolean
language plpgsql immutable set search_path=public as $function$
declare v_text text; v_chars text[]; v_quoted boolean[]; v_ends text[]:='{}'; v_starts integer[]:='{}';
  v_char text; v_depth integer; v_length integer; v_outside boolean:=false; v_counted text:='';
  v_terminal text[]; i integer; j integer;
begin
  if p_sentence is null then return false; end if;
  v_text:=regexp_replace(p_sentence,'^[[:space:]]+|[[:space:]]+$','','g');
  if char_length(v_text) not between 2 and 1000 or v_text !~ $rx$[.!?。！？][”’"')\]»」』}）]*$$rx$ then return false; end if;
  v_text:=regexp_replace(v_text,'\m(Mr|Mrs|Ms|Dr|Prof|St|e\.g|i\.e)\.','\1','gi');
  v_chars:=string_to_array(v_text,null);v_length:=cardinality(v_chars);v_quoted:=array_fill(false,array[v_length]);
  for i in 1..v_length loop
    v_char:=v_chars[i];v_depth:=cardinality(v_ends);
    if v_chars[i-1]=chr(92) and v_char in ('"',$q$'$q$) then continue; end if;
    if v_char in ($q$'$q$,'’') and v_chars[i-1] ~ '[[:alnum:]]' and v_chars[i+1] ~ '[[:alnum:]]' then continue; end if;
    if v_depth>0 and v_ends[v_depth]=v_char then
      for j in v_starts[v_depth]..i loop v_quoted[j]:=true; end loop;
      v_ends:=v_ends[1:v_depth-1];v_starts:=v_starts[1:v_depth-1];
    elsif v_char in ('“','‘','「','『','«','"',$q$'$q$) and not(v_char=$q$'$q$ and coalesce(v_chars[i-1] ~ '[[:alnum:]]',false)) then
      v_ends:=array_append(v_ends,case v_char when '“' then '”' when '‘' then '’' when '「' then '」' when '『' then '』' when '«' then '»' else v_char end);
      v_starts:=array_append(v_starts,i);
    end if;
  end loop;
  for i in 1..v_length loop
    if not v_quoted[i] and v_chars[i] ~ '[[:alnum:]]' then v_outside:=true;exit;end if;
  end loop;
  if v_outside then
    for i in 1..v_length loop
      v_counted:=v_counted || case when v_quoted[i] and v_chars[i] ~ '[.!?。！？]' then ' ' else v_chars[i] end;
    end loop;
    v_terminal:=regexp_match(v_text,$rx$([.!?。！？][”’"')\]»」』}）]*)$$rx$);
    if v_terminal is not null and v_quoted[v_length-char_length(v_terminal[1])+1] then v_counted:=v_counted||'.';end if;
  else v_counted:=v_text;
  end if;
  return (select count(*)=1 from regexp_matches(v_counted,$rx$([.!?]+[”’"')\]»」』}）]*(?=[[:space:]]|$)|[。！？]+[”’"')\]»」』}）]*)$rx$,'g'));
end;
$function$;

-- Once the organizer starts the relay, dates are estimates. Actual activation
-- timestamps govern turn expiry; projections are derived afresh from the queue.
create or replace function public.creative_advance(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare e public.creative_events; t public.relay_turns; v_ids uuid[]; v_new uuid[]; v_index integer;
begin
  select * into e from public.creative_events where slug = p_slug for update;
  if e.kind <> 'relay' then return; end if;
  if e.claim_until <= now() then
    update public.creative_events set claim_user = null, claim_token = null, claim_until = null where slug = p_slug;
  end if;
  if e.phase <> 'scheduled' then return; end if;
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
  v_can_write := v_member and ((e.phase = 'scheduled' and v_turn.user_id = auth.uid())
    or (e.phase = 'free' and e.claim_user = auth.uid() and e.claim_until > now()));
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'userId', t.user_id,
    'name', coalesce(nullif(p.full_name,''),p.username,s.name,'Writer'), 'slotId',t.slot_id,'pendingAccount',t.user_id is null, 'round', t.round, 'done', t.completed_at is not null, 'current',t.id=v_turn.id and e.phase='scheduled',
      'activatedAt',t.activated_at,
      'deadlineAt',case when t.id=v_turn.id and e.phase='scheduled' then t.activated_at+interval '24 hours' else null end,
      'estimatedAt',case when e.phase='scheduled' and v_turn.id is not null and t.completed_at is null and t.user_id is not null
        then coalesce(v_turn.activated_at,now())+interval '24 hours'*est.n else null end)
    order by (t.completed_at is null), t.completed_at, t.position, t.id), '[]'::jsonb)
    into v_queue from public.relay_turns t left join public.profiles p on p.id = t.user_id left join public.creative_writer_slots s on s.id=t.slot_id
      left join (select id,row_number() over(order by position,id)-1 n from public.relay_turns
        where event_slug=p_slug and completed_at is null and user_id is not null) est on est.id=t.id
      where t.event_slug = p_slug;
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
    'turnExpiresAt',case when e.phase='scheduled' then v_turn.activated_at+interval '24 hours' else null end,
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
    if not coalesce(public.creative_sentence_valid(v_sentence),false) then raise exception 'Write exactly one sentence (2–1000 characters), ending with punctuation. Punctuation inside quoted dialogue is allowed.'; end if;
    if e.phase = 'scheduled' then
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
$$;

commit;


