-- Cleanup social/testing data while preserving users, profiles, books, shelves,
-- user_books, and private review records.
--
-- Run this in the Supabase SQL Editor for the project you want to clean.
-- It is safe to rerun: every DELETE checks whether the table exists first.

do $$
begin
  -- Feed/social data.
  if to_regclass('public.comments') is not null then
    delete from public.comments;
  end if;

  if to_regclass('public.post_likes') is not null then
    delete from public.post_likes;
  end if;

  if to_regclass('public.likes') is not null then
    delete from public.likes;
  end if;

  if to_regclass('public.posts') is not null then
    delete from public.posts;
  end if;

  -- Book club moderation/activity/chat data.
  if to_regclass('public.club_message_moderation_reports') is not null then
    delete from public.club_message_moderation_reports;
  end if;

  if to_regclass('public.club_activity_events') is not null then
    delete from public.club_activity_events;
  end if;

  if to_regclass('public.club_posts') is not null then
    delete from public.club_posts;
  end if;

  if to_regclass('public.club_messages') is not null then
    delete from public.club_messages;
  end if;

  if to_regclass('public.club_schedule') is not null then
    delete from public.club_schedule;
  end if;

  if to_regclass('public.club_members') is not null then
    delete from public.club_members;
  end if;

  if to_regclass('public.book_clubs') is not null then
    delete from public.book_clubs;
  end if;

  -- Optional editorial/test content tables that do not affect user shelves.
  if to_regclass('public.featured_content') is not null then
    delete from public.featured_content;
  end if;
end $$;
