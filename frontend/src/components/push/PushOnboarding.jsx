import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { canOfferPushInvitation, claimPushInvitation, completePushInvitation, schedulePushInvitation } from '../../lib/pushOnboarding';
import PushInvitation from './PushInvitation';
import { preparePushWorker } from '../../lib/desktopPush';

export default function PushOnboarding({ userId, push }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const eligible = canOfferPushInvitation({ userId, readyUserId: push.readyUserId, status: push.status,
    busy: push.busy, pathname, permission: globalThis.Notification?.permission });

  useEffect(() => {
    if (!eligible) return;
    return schedulePushInvitation({ claim: () => claimPushInvitation(userId), onClaimed: () => { setOpen(true); void preparePushWorker().catch(() => {}); } });
  }, [eligible, userId]);

  function finish(outcome) {
    setOpen(false);
    // The earlier account claim guarantees no automatic repeat even when this
    // optional outcome update fails (for example after connectivity is lost).
    void completePushInvitation(userId, outcome).catch(() => {});
  }
  if (!open || /^\/login(?:\/|$)/.test(pathname)) return null;
  return <PushInvitation onDismiss={() => finish('dismissed')} onEnable={push.enable} onComplete={finish} />;
}
