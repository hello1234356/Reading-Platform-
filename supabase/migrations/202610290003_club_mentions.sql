begin;
alter table public.club_posts add column mentions jsonb not null default '[]'::jsonb;
-- Adapt the existing comment mention parser: token boundaries, verified profile
-- IDs, INSERT-only notifications, and the same dedupe_key notification contract.
create function public.resolve_club_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare names text; candidate text[]; recipient record; seen uuid[]:='{}';
begin
  new.mentions:='[]'::jsonb;
  select string_agg(regexp_replace(p.username,'([^[:alnum:] _-])','\\\1','g'),'|' order by length(p.username) desc)
    into names from public.club_members m join public.profiles p on p.id=m.user_id
    where m.club_id=new.club_id and nullif(p.username,'') is not null;
  if names is null then return new; end if;
  for candidate in select regexp_matches(new.message,'(^|[^[:alnum:]_.+-])@('||names||')(?=$|[^[:alnum:]_.-])','g') loop
    select p.id,p.username into recipient from public.profiles p join public.club_members m on m.user_id=p.id
      where m.club_id=new.club_id and p.username=candidate[2] limit 1;
    if found and not(recipient.id=any(seen)) then
      seen:=array_append(seen,recipient.id);
      new.mentions:=new.mentions||jsonb_build_array(jsonb_build_object('userId',recipient.id,'username',recipient.username));
    end if;
  end loop;
  return new;
end $$;
create trigger resolve_club_mentions before insert on public.club_posts for each row execute function public.resolve_club_mentions();
create function public.notify_club_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare mentioned jsonb;
begin
  for mentioned in select value from jsonb_array_elements(new.mentions) loop
    if (mentioned->>'userId')::uuid<>new.user_id then
      insert into public.notifications(recipient_id,actor_id,type,title,body,target_url,target_type,entity_type,entity_id,dedupe_key)
      values((mentioned->>'userId')::uuid,new.user_id,'mention','Mentioned you in a club',null,
        '/clubs/'||new.club_id::text||'?channel='||new.channel_id::text,'club_message','club_message',new.id::text,
        'club_mention:'||new.id::text||':'||(mentioned->>'userId'))
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  return new;
end $$;
create trigger notify_club_mentions after insert on public.club_posts for each row execute function public.notify_club_mentions();
commit;
