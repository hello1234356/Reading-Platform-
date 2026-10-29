begin;

alter table public.club_members add column nickname text;
create policy club_members_join_without_nickname on public.club_members as restrictive for insert to authenticated with check(nickname is null);
alter table public.club_members add constraint club_nickname_length check(nickname is null or (nickname=btrim(nickname) and char_length(nickname) between 1 and 30));

-- Raw client updates remain denied by club_members_update_guard. Only the
-- authenticated server endpoint can save moderated nicknames and tags together.
create function public.guard_club_member_identity() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.club_id,new.user_id,new.joined_at) is distinct from (old.club_id,old.user_id,old.joined_at) then raise exception 'Membership identity is immutable'; end if;
  if new.nickname is not null and (new.nickname ~ '[[:cntrl:]]' or new.nickname ~ U&'[\200B-\200F\2028-\202E\2060-\206F\FEFF]' or lower(new.nickname) in ('host','admin','administrator','moderator','system','主持人','管理员','系統','系统')) then raise exception 'Invalid nickname'; end if;
  return new;
end $$;
create trigger club_member_identity_guard before update on public.club_members for each row execute function public.guard_club_member_identity();

create function public.save_club_member_profile(p_club_id bigint,p_user_id uuid,p_nickname text,p_tag_ids bigint[])
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_nickname text:=nullif(btrim(p_nickname),''); v_ids bigint[]:=coalesce(p_tag_ids,'{}');
begin
  -- Serialize with tag removal and membership/capacity changes.
  perform 1 from public.book_clubs where id=p_club_id for update;
  if not exists(select 1 from public.club_members where club_id=p_club_id and user_id=p_user_id) then raise exception 'Membership required'; end if;
  if cardinality(v_ids)>3 or cardinality(v_ids)<>(select count(distinct id) from unnest(v_ids) id)
    or exists(select 1 from unnest(v_ids) as wanted(tag_id) where not exists(select 1 from public.club_member_tags t where t.club_id=p_club_id and t.id=wanted.tag_id)) then raise exception 'Invalid member tags'; end if;
  update public.club_members set nickname=v_nickname where club_id=p_club_id and user_id=p_user_id;
  delete from public.club_member_tag_assignments where club_id=p_club_id and user_id=p_user_id and not(tag_id=any(v_ids));
  insert into public.club_member_tag_assignments(club_id,user_id,tag_id)
    select p_club_id,p_user_id,wanted.tag_id from unnest(v_ids) as wanted(tag_id)
    where not exists(select 1 from public.club_member_tag_assignments a where a.club_id=p_club_id and a.user_id=p_user_id and a.tag_id=wanted.tag_id);
  return jsonb_build_object('nickname',v_nickname,'tagIds',v_ids);
end $$;
revoke all on function public.save_club_member_profile(bigint,uuid,text,bigint[]) from public,anon,authenticated;
grant execute on function public.save_club_member_profile(bigint,uuid,text,bigint[]) to service_role;

-- Existing rows stay visible, but only the server can publish new moderated
-- messages. A permissive historical policy cannot bypass these guards.
create policy club_posts_server_publish on public.club_posts as restrictive for insert to public with check(false);
revoke insert,update on public.club_posts from anon,authenticated;
do $$ begin
  if to_regclass('public.club_messages') is not null then
    revoke insert,update on public.club_messages from anon,authenticated;
    create policy legacy_club_messages_server_publish on public.club_messages as restrictive for insert to public with check(false);
    create policy legacy_club_messages_no_update on public.club_messages as restrictive for update to public using(false) with check(false);
  end if;
end $$;

create function public.publish_club_message(p_club_id bigint,p_channel_id bigint,p_user_id uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_channel bigint; v_post public.club_posts%rowtype; v_profile jsonb;
begin
  perform 1 from public.club_members where club_id=p_club_id and user_id=p_user_id for key share;
  if not found then raise exception 'Membership required'; end if;
  select id into v_channel from public.club_channels where club_id=p_club_id and
    ((p_channel_id is not null and id=p_channel_id) or (p_channel_id is null and slug='general'));
  if v_channel is null then raise exception 'Invalid channel'; end if;
  if char_length(btrim(p_message)) not between 1 and 2000 or p_message is null then raise exception 'Invalid message'; end if;
  insert into public.club_posts(club_id,channel_id,user_id,message) values(p_club_id,v_channel,p_user_id,btrim(p_message)) returning * into v_post;
  select jsonb_build_object('username',username,'full_name',full_name,'avatar_url',avatar_url) into v_profile from public.profiles where id=p_user_id;
  return to_jsonb(v_post)||jsonb_build_object('profiles',v_profile);
end $$;
revoke all on function public.publish_club_message(bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.publish_club_message(bigint,bigint,uuid,text) to service_role;
grant select on public.book_clubs,public.club_members,public.profiles,public.club_channels,public.club_member_tags,public.club_member_tag_assignments,public.club_posts to service_role;
grant update on public.book_clubs to service_role;
grant update(nickname) on public.club_members to service_role;
grant insert,delete on public.club_member_tag_assignments to service_role;
grant insert on public.club_posts to service_role;
do $$ declare seq text; begin
  seq:=pg_get_serial_sequence('public.club_posts','id');
  if seq is not null then execute format('grant usage,select on sequence %s to service_role',seq); end if;
end $$;
commit;
