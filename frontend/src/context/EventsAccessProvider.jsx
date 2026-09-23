import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { requireSupabase } from '../lib/supabase';
import { EventsAccessContext } from './eventsAccess';

async function readAccess() {
  const { data, error } = await requireSupabase().rpc('get_events_access');
  if (error) throw error;
  return data;
}

const hidden = { isLive: false, isAdmin: false, isOwner: false };
export default function EventsAccessProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const identity = user?.id || null;
  const [state, setState] = useState(null);
  const request = useRef(0);
  const refresh = useCallback(() => {
    if (authLoading) return Promise.resolve();
    const version = ++request.current;
    return readAccess().then(data => {
      if (version === request.current) setState({ identity, access: data || hidden, error: false });
    }).catch(() => {
      if (version === request.current) setState({ identity, access: hidden, error: true });
    });
  }, [authLoading, identity]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { request.current += 1; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const ready = !authLoading && state?.identity === identity;
  const access = ready ? state.access : hidden;
  async function setLive(isLive) {
    const { error } = await requireSupabase().rpc('set_events_live', { p_is_live: isLive });
    if (error) throw error;
    await refresh();
  }
  return <EventsAccessContext.Provider value={{ ...access, canView: access.isLive || access.isAdmin, loading: !ready, error: ready && state.error, refresh, setLive }}>{children}</EventsAccessContext.Provider>;
}
