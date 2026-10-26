import type { AppData, NotifPrefs, Prefs, TachePartagee } from './types';
import type { DemandeMdp } from './cloud';
import { computeNotifications, DEFAULT_NOTIF, type NotifItem } from './notifs';
import { avecSondages } from './polls';

// Fonction « gsa-push » (notifications sur téléphone, appli fermée) : les notifications de la cloche 🔔 d'une personne
// dans une entité, calculées comme dans l'appli à partir des lignes lues sur le serveur comme elle (mêmes règles
// d'accès), puis les messages à envoyer : ceux qui ne l'ont pas encore été et qu'elle n'a pas déjà lus dans l'appli.
// Inclus dans la fonction par `npm run fonction` (supabase/functions/gsa-push/notifs.js).

export interface LignePush { kind: string; id: string; pos: number; data: unknown }

const LISTES = ['people', 'roles', 'sections', 'statuses', 'meetings', 'events', 'tasks', 'polls', 'emails', 'notifications', 'propositions'] as const;

/** Données de l'entité à partir de ses lignes (gsa_items) : listes, réglages et notifications lues de la personne. */
function donnees(lignes: LignePush[]) {
  const d: Record<string, unknown> = Object.fromEntries(LISTES.map((k) => [k, []]));
  const prefs: Record<string, Prefs> = {};
  const lues: Record<string, string[]> = {};
  for (const r of [...lignes].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))) {
    if (r.kind === 'prefs') prefs[r.id] = r.data as Prefs;
    else if (r.kind === 'notifLues') lues[r.id] = r.data as string[];
    else if (r.kind in d) (d[r.kind] as unknown[]).push(r.data);
  }
  return { data: { ...d, prefs, notifLues: lues } as unknown as AppData, prefs };
}

/** Notifications pas encore lues de la personne (`fiche`) dans l'entité `courante`. */
export function notificationsPush(o: { lignes: LignePush[]; fiche: string; courante: string; pourInfo?: TachePartagee[]; demandesMdp?: DemandeMdp[] }): NotifItem[] {
  const { data, prefs } = donnees(o.lignes);
  const moi = data.people.find((p) => p.id === o.fiche);
  if (!moi || moi.actif === false) return [];
  const p: NotifPrefs = { ...DEFAULT_NOTIF, ...prefs[o.fiche]?.notif };
  // Sondages : la clé de vote de la personne (ceux des autres entités ne sont pas lus ici).
  const d = avecSondages(data, [], o.courante, [], o.fiche);
  return computeNotifications(d, moi, p, o.demandesMdp ?? [], o.pourInfo ?? [], [], o.courante).filter((x) => x.unread);
}

/** Clé d'envoi : un seul rappel « en retard » par jour, quel que soit leur nombre. */
export const cleEnvoi = (cle: string) => (cle.startsWith('retard:') ? cle.split(':').slice(0, 2).join(':') : cle);

export interface NotifUnite extends NotifItem { unite: string; nomUnite: string }
export interface MessagePush { titre: string; corps: string; url: string; tag: string }

/** Lien qui ouvre l'appli sur la page de la notification, dans son entité (voir lienPartage.ts). */
export const urlPush = (unite: string, lien: string) => `./?reel=${encodeURIComponent(unite)}#${lien}`;

/**
 * Messages à envoyer : un par notification ; au-delà de trois d'un coup (le matin, après la nuit), un seul message qui
 * les résume. `plusieurs` : la personne est dans plusieurs entités (le nom de l'entité est ajouté).
 */
export function messagesPush(items: NotifUnite[], plusieurs: boolean): MessagePush[] {
  const ou = (x: NotifUnite) => (plusieurs ? x.nomUnite : '');
  if (items.length <= 3)
    return items.map((x) => ({
      titre: `${x.icon} ${x.text}`,
      corps: [x.sub, ou(x)].filter(Boolean).join(' · '),
      url: urlPush(x.unite, x.link),
      tag: `${x.unite}|${x.key}`,
    }));
  const lignes = items.slice(0, 4).map((x) => `${x.icon} ${x.text}${ou(x) ? ` (${ou(x)})` : ''}`);
  return [{
    titre: `${items.length} nouvelles notifications`,
    corps: lignes.join('\n') + (items.length > 4 ? '\n…' : ''),
    url: urlPush(items[0].unite, '/'),
    tag: 'resume',
  }];
}
