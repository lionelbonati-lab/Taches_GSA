import { useEffect, useState } from 'react';
import { useStore } from './data/store';
import { useClubOptional } from './data/club';
import { computeNotifications, DEFAULT_NOTIF } from './data/notifs';

// Notifications de l'appli : le calcul est dans src/data/notifs.ts (aussi utilisé par le serveur, appli fermée).
export { ago, computeNotifications, DEFAULT_NOTIF, type NotifItem } from './data/notifs';

export function useNotifications() {
  const { data, user, prefs, pourInfo } = useStore();
  const club = useClubOptional();
  // Recalcul chaque minute : un email programmé ou une échéance peut arriver pendant que l'appli est ouverte.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const p = { ...DEFAULT_NOTIF, ...prefs.notif };
  const items = user ? computeNotifications(data, user, p, club?.demandesMdp, pourInfo, club?.units, club?.current.id, { mesFiches: club?.mesFiches, lues: club?.luesAilleurs }) : [];
  return { items, unread: items.filter((x) => x.unread), prefs: p };
}

/** Affiche une notification de l'appareil (via le service worker quand il existe, indispensable sur Android). */
export async function showSystemNotification(title: string, body: string, link = '/') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = { body, icon: './icon-192.png', badge: './badge-96.png', tag: 'taches-gsa', data: { url: `./#${link}` } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
