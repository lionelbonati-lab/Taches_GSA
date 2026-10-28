import { useEffect, useState } from 'react';
import { useStore } from './data/store';
import { useClubOptional } from './data/club';
import { computeNotifications, lireNotif, type NotifItem } from './data/notifs';
import { useAutres } from './data/entites';
import { lienDepuisEntite } from './data/vueMoi';

// Notifications de l'appli : le calcul est dans src/data/notifs.ts (aussi utilisé par le serveur, appli fermée).
export { ago, computeNotifications, DEFAULT_NOTIF, lireNotif, type NotifItem } from './data/notifs';

/** Notification de la cloche ; `entite` : de l'une de mes autres entités, dont la page s'ouvre dans cette entité. */
export type Notif = NotifItem & { entite?: string };

export function useNotifications() {
  const { data, user, prefs, pourInfo } = useStore();
  const club = useClubOptional();
  // Vue « moi » : celles de mes autres entités aussi (ouvertes en arrière-plan), avec le nom de l'entité.
  const autres = useAutres(!club?.arrierePlan);
  // Recalcul chaque minute : un email programmé ou une échéance peut arriver pendant que l'appli est ouverte.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, []);
  const p = lireNotif(prefs.notif);
  const ici: Notif[] = user ? computeNotifications(data, user, p, club?.demandesMdp, pourInfo, club?.units, club?.current.id, { mesFiches: club?.mesFiches, lues: club?.luesAilleurs }) : [];
  // Une même demande de mot de passe (personne de plusieurs de mes entités) : une seule fois.
  const mdp = new Set(ici.filter((n) => n.key.startsWith('mdp:')).map((n) => n.key));
  const ailleurs: Notif[] = autres.flatMap((e) =>
    e.notifs.filter((n) => !n.key.startsWith('mdp:') || (!mdp.has(n.key) && !!mdp.add(n.key))).map((n) => {
      const l = lienDepuisEntite(n.link, e.id, club?.current.id ?? '');
      return { ...n, key: `@${e.id}|${n.key}`, sub: [n.sub, e.club.current.nom].filter(Boolean).join(' · '), link: l.lien, entite: l.ici ? undefined : e.id };
    }),
  );
  const items = ailleurs.length ? [...ici, ...ailleurs].sort((a, b) => (a.kind === b.kind ? b.at.localeCompare(a.at) : a.kind === 'alerte' ? -1 : 1)) : ici;
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
