import { useCallback, useEffect, useState } from 'react';
import { requireSupabase } from '../../lib/supabase';
import { getClubChannelUnreads } from '../../lib/clubReadState';

export default function useClubUnread(clubId, userId) {
  const [unreads, setUnreads] = useState({});
  // Also refresh immediately after this device saves a cursor.
  const refresh = useCallback(() => window.dispatchEvent(new CustomEvent('club-read-updated', { detail: clubId })), [clubId]);
  useEffect(() => {
    let cancelled = false, fetching = false, queued = false;
    async function sync() {
      if (fetching) { queued = true; return; }
      fetching = true;
      try {
        const next = await getClubChannelUnreads(clubId);
        if (!cancelled) setUnreads(next);
      } catch { /* Keep last confirmed indicators and retry on reconnect/poll. */ }
      finally {
        fetching = false;
        if (!cancelled && queued) { queued = false; void sync(); }
      }
    }
    const client = requireSupabase();
    const subscription = client.channel(`club-unreads-${clubId}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_posts', filter: `club_id=eq.${clubId}` }, sync)
      // Postgres DELETE payloads cannot reliably be filtered by club_id.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'club_posts' }, sync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'club_channel_reads', filter: `user_id=eq.${userId}` }, sync)
      .subscribe(status => { if (status === 'SUBSCRIBED') void sync(); });
    function localRead(event) { if (String(event.detail) === String(clubId)) void sync(); }
    window.addEventListener('club-read-updated', localRead);
    window.addEventListener('focus', sync);
    const timer = setInterval(sync, 15000);
    void sync();
    return () => {
      cancelled = true; clearInterval(timer);
      window.removeEventListener('club-read-updated', localRead); window.removeEventListener('focus', sync);
      void client.removeChannel(subscription);
    };
  }, [clubId, userId]);
  return [unreads, refresh];
}
