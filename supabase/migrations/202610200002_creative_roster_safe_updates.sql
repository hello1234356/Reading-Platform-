begin;

-- Supabase's API preloads safeupdate: mutations need a real WHERE scope.
-- Keep that protection enabled, including inside security-definer RPCs.
create or replace function public.creative_save_writer_slots(p_slots jsonb,p_confirm boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare e public.creative_events; item jsonb; v_slots jsonb; v_ids uuid[]; v_slot uuid; v_user uuid; v_name text;
  v_index integer:=0; v_turn_ids uuid[]; v_try uuid[]; v_valid boolean:=false; i integer;
  v_before jsonb; v_queue_changed boolean; v_current_before public.relay_turns;
begin
  if not public.creative_is_organizer('story-relay') then raise exception 'Organizer access required.' using errcode='42501'; end if;
  perform 1 from public.creative_events where slug='story-relay' for update;
  perform 1 from public.creative_events where slug='theme-marketplace' for update;
  select * into strict e from public.creative_events where slug='story-relay';
  if e.phase not in ('draft','scheduled') and not(e.phase='paused' and e.paused_phase='scheduled') then raise exception 'The scheduled roster is already closed.'; end if;
  if jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots) not between 2 and 60 then raise exception 'Select at least two roster slots.'; end if;
  select jsonb_agg(jsonb_build_object('id',user_id,'name',name) order by position,id) into v_before
    from public.creative_writer_slots where active;
  select * into v_current_before from public.relay_turns
    where event_slug=e.slug and completed_at is null and user_id is not null
      and user_id is distinct from (select author_id from public.relay_sentences where event_slug=e.slug order by id desc limit 1)
    order by position,id limit 1;
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
  v_queue_changed:=coalesce(v_before,'[]'::jsonb) is distinct from
    (select jsonb_agg(jsonb_build_object('id',nullif(value->>'id',''),'name',btrim(value->>'name')) order by n)
      from jsonb_array_elements(v_slots) with ordinality x(value,n));
  -- Keep old slots for historical credit; only current slots control access.
  update public.creative_writer_slots set active=false,user_id=null
    where active or user_id is not null;
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
  if e.phase='draft' or not v_queue_changed then return; end if;
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
  -- Linking another writer must not restart an unchanged current turn.
  if v_current_before.activated_at is not null then
    update public.relay_turns t set activated_at=v_current_before.activated_at
      where t.id=v_current_before.id and t.user_id=v_current_before.user_id and t.completed_at is null
        and t.id=(select id from public.relay_turns where event_slug=e.slug and completed_at is null and user_id is not null
          and user_id is distinct from (select author_id from public.relay_sentences where event_slug=e.slug order by id desc limit 1)
          order by position,id limit 1);
  end if;
  perform public.creative_advance(e.slug);
end;
$$;

commit;

