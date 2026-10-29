import { useCallback, useEffect, useRef } from 'react';
import { markClubChannelRead } from '../../lib/clubReadState';
import { isClubChatAtLatest } from '../../lib/clubReadVisibility';

export default function useClubReadPosition({ clubId, channelId, postId, ready, list, onRead }) {
  const confirmed = useRef(null);
  const pending = useRef(new Set());
  const acknowledge = useCallback(() => {
    if (!ready || !postId || document.visibilityState !== 'visible' || !document.hasFocus()
      || !isClubChatAtLatest(list.current) || confirmed.current === postId || pending.current.has(postId)) return;
    pending.current.add(postId);
    void markClubChannelRead(clubId, channelId, postId).then(() => {
      confirmed.current = postId;
      onRead();
    }).catch(() => { /* Retry while visible; failed writes never clear local indicators. */ })
      .finally(() => pending.current.delete(postId));
  }, [clubId, channelId, postId, ready, list, onRead]);
  useEffect(() => {
    acknowledge();
    window.addEventListener('focus', acknowledge);
    document.addEventListener('visibilitychange', acknowledge);
    const timer = setInterval(acknowledge, 3000);
    return () => {
      clearInterval(timer); window.removeEventListener('focus', acknowledge);
      document.removeEventListener('visibilitychange', acknowledge);
    };
  }, [acknowledge]);
  return acknowledge;
}
