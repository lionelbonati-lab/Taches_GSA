import { useStore } from './data/store';
import type { AppData, NotifPrefs, Person } from './data/types';
import { isOpen } from './data/polls';
import { daysUntil, fmtDate, fullName, isDone, isLate, today } from './data/utils';
import { hasPermission, userRoles } from './data/permissions';

// Notifications de la démo : calculées dans le navigateur à partir des données.
// Dans la version réelle, un serveur enverrait les mêmes messages en « push », appli fermée.

export const DEFAULT_NOTIF: NotifPrefs = {
  assign: true,
  modif: true,
  echeance: true,
  echeanceJours: 3,
  retard: true,
  seance: true,
  seanceJours: 7,
  sondage: true,
  systeme: false,
};

export interface NotifItem {
  key: string;
  icon: string;
  text: string;
  sub?: string;
  /** Lien interne (hash router), ex. /taches?tache=t12 */
  link: string;
  at: string;
  unread: boolean;
  kind: 'alerte' | 'activite';
}

export function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} jours`;
}

export function computeNotifications(data: AppData, user: Person, p: NotifPrefs): NotifItem[] {
  const seen = new Set(data.notifLues?.[user.id] ?? []);
  const items: Omit<NotifItem, 'unread'>[] = [];
  const now = new Date().toISOString();
  const mine = data.tasks.filter((t) => t.responsables.includes(user.id) && !isDone(data, t));

  if (p.retard) {
    const late = mine.filter((t) => isLate(data, t));
    if (late.length)
      items.push({
        key: `retard:${today()}:${late.length}`,
        icon: '⚠️',
        text: late.length === 1 ? `« ${late[0].titre} » est en retard` : `${late.length} de tes tâches sont en retard`,
        sub: late.length === 1 ? `délai : ${fmtDate(late[0].delai)}` : late.slice(0, 3).map((t) => t.titre).join(' · ') + (late.length > 3 ? '…' : ''),
        link: late.length === 1 ? `/taches?tache=${late[0].id}` : '/taches?statut=retard',
        at: now,
        kind: 'alerte',
      });
  }

  if (p.echeance)
    for (const t of mine) {
      if (!t.delai) continue;
      const n = daysUntil(t.delai);
      if (n < 0 || n > p.echeanceJours) continue;
      items.push({
        key: `echeance:${t.id}:${t.delai}:${n === 0 ? 'j0' : 'avant'}`,
        icon: '⏰',
        text: n === 0 ? `« ${t.titre} » est à faire aujourd’hui` : `« ${t.titre} » est à faire dans ${n} jour${n > 1 ? 's' : ''}`,
        sub: `délai : ${fmtDate(t.delai)}`,
        link: `/taches?tache=${t.id}`,
        at: now,
        kind: 'alerte',
      });
    }

  if (p.seance && hasPermission(userRoles(data.roles, user), 'tab.meetings')) {
    const next = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
    const n = next ? daysUntil(next.date) : -1;
    if (next && n <= p.seanceJours) {
      const pv = next.pvArchives?.[0];
      items.push({
        key: `seance:${next.id}:${next.date}${pv ? ':pv' : ''}`,
        icon: '🗓️',
        text: `${next.titre} ${n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : `dans ${n} jours`}`,
        sub: `${fmtDate(next.date)}${next.heure ? ` à ${next.heure.replace(':', 'h')}` : ''} · ${next.lieu || 'lieu à définir'}${pv ? ' · ordre du jour disponible' : ''}`,
        link: '/comite',
        at: now,
        kind: 'alerte',
      });
    }
  }

  if (p.seance && hasPermission(userRoles(data.roles, user), 'tab.meetings'))
    for (const m of data.meetings) {
      const pv = m.minutesArchives?.[0];
      if (!pv || pv.by === user.id || daysUntil(pv.at.slice(0, 10)) < -14) continue;
      items.push({
        key: `pvdispo:${pv.id}`,
        icon: '📝',
        text: (m.minutes?.version ?? 1) > 1 ? `PV du ${m.titre} corrigé (version ${m.minutes!.version})` : `PV du ${m.titre} disponible`,
        sub: `validé le ${fmtDate(pv.at.slice(0, 10))}`,
        link: '/comite',
        at: pv.at,
        kind: 'activite',
      });
    }

  if (p.sondage)
    for (const poll of data.polls ?? []) {
      if (!isOpen(poll) || !poll.votants.includes(user.id) || poll.votes[user.id]) continue;
      items.push({
        key: `sondage:${poll.id}`,
        icon: '📊',
        text: `Sondage : « ${poll.question} »`,
        sub: poll.dateLimite ? `réponds avant le ${fmtDate(poll.dateLimite)}` : 'en attente de ta réponse',
        link: `/sondages?id=${poll.id}`,
        at: poll.creeLe,
        kind: 'alerte',
      });
    }

  for (const n of data.notifications ?? []) {
    if (n.userId !== user.id) continue;
    if ((n.type === 'assign' && !p.assign) || (n.type !== 'assign' && !p.modif)) continue;
    const t = data.tasks.find((x) => x.id === n.taskId);
    if (!t) continue;
    const by = fullName(data.people.find((x) => x.id === n.by));
    items.push({
      key: n.id,
      icon: n.type === 'assign' ? '🆕' : n.type === 'recur' ? '🔁' : '✏️',
      text:
        n.type === 'assign' ? `${by} t’a attribué « ${t.titre} »`
        : n.type === 'recur' ? `Tâche récurrente reconduite : « ${t.titre} »`
        : `${by} a modifié « ${t.titre} »`,
      sub: n.type === 'recur' ? `nouveau délai : ${n.detail}` : n.type === 'modif' ? n.detail : t.delai ? `délai : ${fmtDate(t.delai)}` : undefined,
      link: `/taches?tache=${t.id}`,
      at: n.at,
      kind: 'activite',
    });
  }

  return items
    .map((x) => ({ ...x, unread: !seen.has(x.key) }))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'alerte' ? -1 : 1) : b.at.localeCompare(a.at)));
}

export function useNotifications() {
  const { data, user, prefs } = useStore();
  const p = { ...DEFAULT_NOTIF, ...prefs.notif };
  const items = user ? computeNotifications(data, user, p) : [];
  return { items, unread: items.filter((x) => x.unread), prefs: p };
}

/** Affiche une notification de l'appareil (via le service worker quand il existe, indispensable sur Android). */
export async function showSystemNotification(title: string, body: string, link = '/') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const options: NotificationOptions = { body, icon: './icon-192.png', badge: './icon-192.png', tag: 'taches-gsa', data: { url: `./#${link}` } };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
