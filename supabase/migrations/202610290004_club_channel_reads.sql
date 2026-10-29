-- One durable cursor per member/channel; ordinary activity never creates notifications.
begin;
create table public.club_channel_reads (
  club_id bigint not null,
  channel_id bigint not null,
  user_id uuid not null,
  last_read_at timestamptz not null,
  last_read_post_id bigint not null,
  primary key(user_id,channel_id),
  foreign key(club_id,channel_id) references public.club_channels(club_id,id) on delete cascade,
  foreign key(club_id,user_id) references public.club_members(club_id,user_id) on delete cascade
);
create index club_channel_reads_channel_idx on public.club_channel_reads(club_id,channel_id);
alter table public.club_channel_reads enable row level security;
revoke all on public.club_channel_reads from anon,authenticated;
grant select on public.club_channel_reads to authenticated;
create policy club_channel_reads_self on public.club_channel_reads for select to authenticated
  using(user_id=auth.uid() and public.is_club_member(club_id));
create index club_posts_channel_mentions_idx on public.club_posts(channel_id,created_at,id)
  where mentions<>'[]'::jsonb;

create function public.get_club_channel_unreads(p_club_id bigint)
returns table(channel_id bigint,has_unread boolean,has_mention boolean)
language sql stable security invoker set search_path='' as $$
  select c.id,
    exists(select 1 from public.club_posts p where p.channel_id=c.id and p.user_id<>auth.uid()
      and (p.created_at,p.id)>(coalesce(r.last_read_at,'-infinity'::timestamptz),coalesce(r.last_read_post_id,0))),
    exists(select 1 from public.club_posts p where p.channel_id=c.id and p.user_id<>auth.uid()
      and (p.created_at,p.id)>(coalesce(r.last_read_at,'-infinity'::timestamptz),coalesce(r.last_read_post_id,0))
      and p.mentions<>'[]'::jsonb and p.mentions @> jsonb_build_array(jsonb_build_object('userId',auth.uid())))
  from public.club_channels c left join public.club_channel_reads r on r.channel_id=c.id and r.user_id=auth.uid()
  where c.club_id=p_club_id;
$$;

create function public.mark_club_channel_read(p_club_id bigint,p_channel_id bigint,p_post_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare v_post public.club_posts%rowtype; v_at timestamptz; v_id bigint;
begin
  if auth.uid() is null or not public.is_club_member(p_club_id) then raise exception 'Club membership required'; end if;
  select * into v_post from public.club_posts
    where id=p_post_id and club_id=p_club_id and channel_id=p_channel_id;
  -- A deleted message is a harmless no-op; never accept a client timestamp.
  if not found then return; end if;
  insert into public.club_channel_reads as r(club_id,channel_id,user_id,last_read_at,last_read_post_id)
    values(p_club_id,p_channel_id,auth.uid(),v_post.created_at,v_post.id)
    on conflict(user_id,channel_id) do update
      set last_read_at=excluded.last_read_at,last_read_post_id=excluded.last_read_post_id
      where (excluded.last_read_at,excluded.last_read_post_id)>(r.last_read_at,r.last_read_post_id);
  select last_read_at,last_read_post_id into v_at,v_id from public.club_channel_reads
    where user_id=auth.uid() and channel_id=p_channel_id;
  update public.notifications n set is_read=true from public.club_posts p
    where n.recipient_id=auth.uid() and not n.is_read and n.type='mention'
      and n.target_type='club_message' and n.entity_type='club_message' and n.entity_id=p.id::text
      and p.club_id=p_club_id and p.channel_id=p_channel_id and (p.created_at,p.id)<=(v_at,v_id);
end $$;
revoke all on function public.get_club_channel_unreads(bigint),public.mark_club_channel_read(bigint,bigint,bigint) from public;
grant execute on function public.get_club_channel_unreads(bigint),public.mark_club_channel_read(bigint,bigint,bigint) to authenticated;

-- Reuse the INSERT-only mention trigger and its existing deduplication key.
-- Only channel/club labels appear in the inbox, never message contents.
create or replace function public.notify_club_mentions() returns trigger language plpgsql security definer set search_path='' as $$
declare mentioned jsonb; context_label text;
begin
  select '#'||c.slug||' · '||b.title into context_label from public.club_channels c
    join public.book_clubs b on b.id=c.club_id where c.id=new.channel_id;
  for mentioned in select value from jsonb_array_elements(new.mentions) loop
    if (mentioned->>'userId')::uuid<>new.user_id then
      insert into public.notifications(recipient_id,actor_id,type,title,body,target_url,target_type,entity_type,entity_id,dedupe_key)
      values((mentioned->>'userId')::uuid,new.user_id,'mention','Mentioned you in a club',left(context_label,1000),
        '/clubs/'||new.club_id::text||'?channel='||new.channel_id::text||'&message='||new.id::text,
        'club_message','club_message',new.id::text,'club_mention:'||new.id::text||':'||(mentioned->>'userId'))
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  return new;
end $$;
-- Enrich existing mention links without changing their identity or read status.
update public.notifications n set body=left('#'||c.slug||' · '||b.title,1000),
  target_url='/clubs/'||p.club_id::text||'?channel='||p.channel_id::text||'&message='||p.id::text
from public.club_posts p join public.club_channels c on c.id=p.channel_id join public.book_clubs b on b.id=p.club_id
where n.type='mention' and n.target_type='club_message' and n.entity_type='club_message' and n.entity_id=p.id::text;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.club_channel_reads;
  end if;
end $$;
commit;
