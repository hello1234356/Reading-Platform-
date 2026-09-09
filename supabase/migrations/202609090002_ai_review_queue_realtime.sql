-- Notify every connected admin when an AI assessment is created or reviewed.
do $$
begin
  alter publication supabase_realtime
  add table public.book_moderation_assessments;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
