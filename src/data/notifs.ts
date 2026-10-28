import { dueAt, emailState, fillTemplate } from './emails';
import type { AppData, NotifPrefs, OrgUnit, Person, TachePartagee, Task } from './types';
import { nomsDestinataires } from './destinataires';
import { echeance, isOpen } from './polls';
import { finDeSemaine, jourSemaine } from './repetition';
import { aPrendreOuverte, aPrendrePourMoi, attenteAilleurs, plusPersonne, sansReponse } from './aPrendre';
import { daysUntil, fmtDate, fullName, isDone, shortName, today } from './utils';
import { hasPermission, userRoles } from './permissions';
import { convoquesDe } from './seances';
import { GENRES, chf, genre, holders, paiementTasks } from './paiements';
import type { DemandeMdp } from './cloud';
import { clesVu, modifieeDepuisMonVu, pourMoi, vuAvantModif } from './pourInfo';
import { cleCommune } from './commentaires';

// Notifications (cloche 🔔) calculées à partir des données : dans l'appli (src/notifications.ts), et sur le serveur
// pour les notifications sur téléphone, appli fermée (fonction « gsa-push », par `npm run fonction`).

export const DEFAULT_NOTIF: NotifPrefs = {
  assign: true,
  modif: true,
  echeance: true,
  echeanceJours: 3,
  retard: true,
  seance: true,
  seanceJours: 7,
  sondage: true,
  email: true,
  semaine: true,
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

export function computeNotifications(
  data: AppData, user: Person, p: NotifPrefs, demandesMdp: DemandeMdp[] = [], pourInfo: TachePartagee[] = [], units: OrgUnit[] = [], courante?: string,
  autres: { mesFiches?: Record<string, string>; lues?: Record<string, string> } = {},
): NotifItem[] {
  const seen = new Set(data.notifLues?.[user.id] ?? []);
  const items: Omit<NotifItem, 'unread'>[] = [];
  const now = new Date().toISOString();
  const mine = data.tasks.filter((t) => t.responsables.includes(user.id) && !isDone(data, t));

  // Le lundi : résumé de la semaine (une fois par semaine ; sur le téléphone, au matin).
  if (p.semaine && jourSemaine(today()) === 1) {
    const r = resumeSemaine(data, user, mine);
    if (r) items.push({ ...r, at: now });
  }

  if (p.retard) {
    const late = mine.filter((t) => !!t.delai && t.delai < today());
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
      const due = t.delai;
      if (!due) continue;
      const n = daysUntil(due);
      if (n < 0 || n > p.echeanceJours) continue;
      items.push({
        key: `echeance:${t.id}:${due}:${n === 0 ? 'j0' : 'avant'}`,
        icon: '⏰',
        text: n === 0 ? `« ${t.titre} » est à faire aujourd’hui` : `« ${t.titre} » est à faire dans ${n} jour${n > 1 ? 's' : ''}`,
        sub: `délai : ${fmtDate(due)}`,
        link: `/taches?tache=${t.id}`,
        at: now,
        kind: 'alerte',
      });
    }

  // Prochaine séance : pour ses convoqués (★ et postes du comité).
  if (p.seance && convoquesDe(data).some((x) => x.id === user.id)) {
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
      if (!isOpen(poll) || !poll.cleMoi || poll.votes[poll.cleMoi]) continue;
      items.push({
        key: `sondage:${poll.id}`,
        icon: '📊',
        text: `Sondage : « ${poll.question} »`,
        sub: poll.dateLimite ? `réponds ${poll.clotureAuto === false ? 'si possible ' : ''}avant le ${echeance(poll)}` : 'en attente de ta réponse',
        link: `/sondages?id=${poll.id}`,
        at: poll.creeLe,
        kind: 'alerte',
      });
    }

  // Emails programmés arrivés à leur heure : l'auteur est prévenu pour l'envoyer depuis sa messagerie.
  if (p.email)
    for (const e of data.emails ?? []) {
      if (e.creePar !== user.id) continue;
      const t = data.tasks.find((x) => x.id === e.taskId);
      if (!t || emailState(data, t, e) !== 'aEnvoyer') continue;
      const at = dueAt(t, e.quand)!;
      const to = nomsDestinataires(data, e, units, courante);
      items.push({
        key: `email:${e.id}:${at}`,
        icon: '📧',
        text: `Email à envoyer : « ${fillTemplate(data, t, e, e.objet)} »`,
        sub: `${to.length ? `à ${to.join(', ')} · ` : ''}prévu le ${fmtDate(at.slice(0, 10))} à ${at.slice(11).replace(':', 'h')}`,
        link: `/taches?tache=${t.id}&email=${e.id}`,
        at: now,
        kind: 'alerte',
      });
    }

  // Comité central : propositions d'amélioration de l'appli pas encore étudiées, pour ses admins.
  if (p.assign && data.propositions?.length && hasPermission(userRoles(data.roles, user), 'admin.access'))
    for (const x of data.propositions) {
      if (x.statut !== 'nouvelle') continue;
      items.push({
        key: `proposition:${x.id}`,
        icon: x.genre === 'probleme' ? '🐞' : '💡',
        text: `Proposition d’amélioration : « ${x.texte.length > 70 ? `${x.texte.slice(0, 67)}…` : x.texte} »`,
        sub: `de ${x.par}${x.unite ? ` (${x.unite})` : ''}`,
        link: '/propositions',
        at: x.le,
        kind: 'activite',
      });
    }

  // Mots de passe oubliés (version réelle) : pour les admins de l'entité, toujours affichés.
  if (hasPermission(userRoles(data.roles, user), 'admin.access'))
    for (const d of demandesMdp) {
      const fiche = data.people.find((x) => x.id === d.personId);
      items.push({
        key: `mdp:${d.id}`,
        icon: '🔑',
        text: `${fiche ? fullName(fiche) : d.email} a oublié son mot de passe`,
        sub: d.peut ? 'demande un mot de passe provisoire' : 'à valider par un admin de son entité, du comité central ou un super-admin',
        link: '/mots-de-passe',
        at: d.le,
        kind: 'alerte',
      });
    }

  // Remboursements et paiements : à traiter et virement à faire (caisse), visa demandé (signataire), réponses au demandeur.
  if (p.assign) {
    const caisse = holders(data, 'paiements.payer').includes(user.id);
    for (const t of paiementTasks(data)) {
      const { etat, montant, demandePar, visa } = t.paiement;
      const g = genre(t.paiement);
      const qui = t.paiement.externe ? `${t.paiement.externe.par} (${t.paiement.externe.unite})` : shortName(data.people.find((x) => x.id === demandePar));
      const todo =
        etat === 'recu' && caisse ? { icon: '📥', text: `${g.nom} à traiter : « ${t.titre} »`, sub: `${chf(montant)} · ${qui} · visa à demander`, at: t.paiement.demandeLe }
        : etat === 'visa' && visa?.a === user.id && demandePar !== user.id ? { icon: '✍️', text: `Visa demandé (${g.nom.toLowerCase()}) : « ${t.titre} »`, sub: `${chf(montant)} · ${qui} · par ${shortName(data.people.find((x) => x.id === visa.par))}`, at: visa.le }
        : etat === 'valide' && caisse ? { icon: '🏦', text: `Virement à faire : « ${t.titre} »`, sub: `${chf(montant)} · ${qui}`, at: t.paiement.validation?.le ?? t.paiement.demandeLe }
        : null;
      if (todo) items.push({ key: `paiement:${t.id}:${etat}`, ...todo, link: `/taches?tache=${t.id}`, kind: 'alerte' });
      const fait = etat === 'paye' ? t.paiement.paye : etat === 'refuse' ? t.paiement.refus : etat === 'valide' ? t.paiement.validation : undefined;
      if (demandePar === user.id && fait && fait.par !== user.id)
        items.push({
          key: `paiement:${t.id}:${etat}:demandeur`,
          icon: etat === 'paye' ? '✅' : etat === 'refuse' ? '❌' : '✍️',
          text:
            etat === 'paye'
              ? g === GENRES.facture ? `Facture « ${t.titre} » payée` : `Ton ticket « ${t.titre} » a été remboursé`
              : `${g.nom} « ${t.titre} » ${etat === 'refuse' ? 'refusé' : 'visé'}`,
          sub: etat === 'refuse' ? t.paiement.refus?.motif : `${chf(montant)} · par ${shortName(data.people.find((x) => x.id === fait.par))}`,
          link: `/taches?tache=${t.id}`,
          at: fait.le,
          kind: 'activite',
        });
    }
  }

  // Un message où l'on est mentionné (📣) n'est pas annoncé une seconde fois en 💬.
  const mentions = new Set(p.assign ? (data.notifications ?? []).filter((n) => n.userId === user.id && n.type === 'mention').map(memeMessage) : []);
  const voitTout = hasPermission(userRoles(data.roles, user), 'tasks.viewAll');
  for (const n of data.notifications ?? []) {
    if (n.userId !== user.id) continue;
    // Écrite par moi depuis une autre de mes entités (« x:<entité>:<fiche> ») : rien à m'annoncer.
    const [ailleurs, e, f] = (n.by ?? '').split(':');
    if (ailleurs === 'x' && !!f && autres.mesFiches?.[e] === f) continue;
    const nouvelle = ['assign', 'info', 'propose', 'pris', 'refus', 'mention', 'relance'].includes(n.type);
    if ((nouvelle && !p.assign) || (!nouvelle && !p.modif)) continue;
    if (n.type === 'comment' && mentions.has(memeMessage(n))) continue;
    // Discussion lue depuis dans l'une de mes autres entités (clé commune) : ses 💬 et 📣 sont lues ici aussi.
    if ((n.type === 'comment' || n.type === 'mention') && courante && (autres.lues?.[cleCommune(n.taskId, courante)] ?? '') >= n.at) seen.add(n.id);
    if (n.type === 'comment' || n.type === 'mention' || n.type === 'relance') {
      // Tâche d'ici, partagée (affichée ici) ou reçue pour info ; sinon (serveur : tâches partagées non lues), son titre.
      const ici = data.tasks.find((x) => x.id === n.taskId);
      const recue = ici ? undefined : pourInfo.find((x) => `x:${x.uniteId}:${x.task.id}` === n.taskId);
      const titre = ici?.titre ?? recue?.task.titre ?? n.titre;
      if (titre === undefined) continue;
      if (n.type === 'relance') {
        // Relance (052) d'une tâche « Pour info » : plus rien à faire si je l'ai vue entre-temps.
        const vue = ici ? !!ici.pourInfoVus?.[`p:${user.id}`] : !!recue && !!courante && clesVu(recue.task, recue.uniteId, courante, user.id, voitTout).every((k) => recue.task.pourInfoVus?.[k]);
        if (vue) continue;
        items.push({
          key: n.id,
          icon: '🔔',
          text: `${n.byName ?? fullName(data.people.find((x) => x.id === n.by))} te rappelle « ${titre} »`,
          sub: 'pour info · pas encore marquée « ✓ Vu »',
          link: recue ? `/taches?pourinfo=${recue.uniteId}:${recue.task.id}` : `/taches?tache=${n.taskId}`,
          at: n.at,
          kind: 'activite',
        });
        continue;
      }
      items.push({
        key: n.id,
        icon: n.type === 'mention' ? '📣' : '💬',
        text: `${n.byName ?? fullName(data.people.find((x) => x.id === n.by))} ${n.type === 'mention' ? 'te mentionne dans' : 'a commenté'} « ${titre} »`,
        sub: n.detail,
        link: recue ? `/taches?pourinfo=${recue.uniteId}:${recue.task.id}&discussion=1` : `/taches?tache=${n.taskId}&discussion=1`,
        at: n.at,
        kind: 'activite',
      });
      continue;
    }
    const t = data.tasks.find((x) => x.id === n.taskId);
    if (!t || (t.paiement && n.type === 'assign')) continue; // les tickets ont leur propre alerte
    // Tâche à prendre : plus rien à faire si quelqu'un s'en charge déjà (ou si elle est terminée).
    if (n.type === 'propose' && (!aPrendrePourMoi(t, user.id) || isDone(data, t))) continue;
    const by = n.byName ?? fullName(data.people.find((x) => x.id === n.by));
    items.push({
      key: n.id,
      icon: n.type === 'assign' ? '🆕' : n.type === 'recur' ? '🔁' : n.type === 'info' ? '👁' : n.type === 'propose' || n.type === 'pris' ? '🙋' : n.type === 'refus' ? '🙅' : n.type === 'toutVu' ? '✅' : '✏️',
      text:
        n.type === 'assign' ? `${by} t’a attribué « ${t.titre} »`
        : n.type === 'toutVu' ? `Tout le monde a vu « ${t.titre} »`
        : n.type === 'info' ? `${by} te met au courant : « ${t.titre} »`
        : n.type === 'propose' ? `${by} te propose « ${t.titre} » : tu t’en charges ?`
        : n.type === 'pris' ? `${by} se charge de « ${t.titre} »`
        : n.type === 'refus' ? `${by} n’est pas dispo pour « ${t.titre} »`
        : n.type === 'recur' ? `Tâche récurrente reconduite : « ${t.titre} »`
        : `${by} a modifié « ${t.titre} »`,
      sub:
        n.type === 'recur' ? (n.detail ? `nouveau délai : ${n.detail}` : 'sans délai')
        : n.type === 'modif' ? n.detail
        : n.type === 'refus' ? etatRefus(t)
        : n.type === 'toutVu' ? `pour info · dernier « ✓ Vu » : ${by}`
        : t.delai ? `délai : ${fmtDate(t.delai)}` : undefined,
      link: `/taches?tache=${t.id}`,
      at: n.at,
      kind: 'activite',
    });
  }

  // Tâches d'autres entités pour info (la personne ou son entité mentionnée) : tant qu'elles ne sont pas terminées.
  if (p.assign)
    for (const x of pourInfo) {
      const t = x.task;
      if (x.statuts.find((s) => s.id === t.statusId)?.done) continue;
      items.push({
        key: `info:${x.uniteId}:${t.id}`,
        icon: '👁',
        text: `Pour info : « ${t.titre} »`,
        sub: `${x.unite}${t.delai ? ` · délai : ${fmtDate(t.delai)}` : ''}`,
        link: `/taches?pourinfo=${x.uniteId}:${t.id}`,
        at: t.updatedAt,
        kind: 'activite',
      });
    }

  // Tâches « Pour info » modifiées depuis mon « ✓ Vu » (052) : à revoir (une fois par modification).
  if (p.modif) {
    for (const t of data.tasks) {
      if (!pourMoi(t, user.id) || isDone(data, t) || !vuAvantModif(t.pourInfoVus?.[`p:${user.id}`], t)) continue;
      items.push({ key: `revoir:${t.id}:${t.contenuLe}`, icon: '✏️', text: `« ${t.titre} » a changé depuis ton « ✓ Vu »`, sub: 'pour info · à revoir', link: `/taches?tache=${t.id}`, at: t.contenuLe!, kind: 'activite' });
    }
    if (courante)
      for (const x of pourInfo) {
        const t = x.task;
        if (x.statuts.find((s) => s.id === t.statusId)?.done || !modifieeDepuisMonVu(t, clesVu(t, x.uniteId, courante, user.id, voitTout))) continue;
        items.push({
          key: `revoir:${x.uniteId}:${t.id}:${t.contenuLe}`,
          icon: '✏️',
          text: `« ${t.titre} » a changé depuis ton « ✓ Vu »`,
          sub: `${x.unite} · pour info · à revoir`,
          link: `/taches?pourinfo=${x.uniteId}:${t.id}`,
          at: t.contenuLe!,
          kind: 'activite',
        });
      }
  }

  return items
    .map((x) => ({ ...x, unread: !seen.has(x.key) }))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'alerte' ? -1 : 1) : b.at.localeCompare(a.at)));
}

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const nomJour = (jour: string) => (jour === today() ? 'aujourd’hui' : JOURS[jourSemaine(jour) - 1]);
const nombre = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Résumé de la semaine (d'aujourd'hui à dimanche) : mes tâches à faire d'ici là (en retard comprises), les séances (droit
 * « Séances ») et les événements de l'entité (pas ceux qui se répètent : la routine), les sondages qui attendent ma
 * réponse. Rien s'il n'y a rien. « Cette semaine : 3 tâches à faire, Comité de novembre jeudi », le détail en dessous.
 */
export function resumeSemaine(data: AppData, user: Person, mine: Task[]): Omit<NotifItem, 'unread' | 'at'> | null {
  const auj = today();
  const fin = finDeSemaine(auj);
  const taches = mine.filter((t) => !!t.delai && t.delai <= fin).sort((a, b) => a.delai.localeCompare(b.delai));
  const retard = taches.filter((t) => t.delai < auj).length;
  const seances = hasPermission(userRoles(data.roles, user), 'tab.meetings')
    ? data.meetings.filter((m) => m.date >= auj && m.date <= fin).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const evenements = data.events.filter((e) => !e.repetition && e.date <= fin && (e.dateFin || e.date) >= auj).sort((a, b) => a.date.localeCompare(b.date));
  const sondages = (data.polls ?? []).filter((x) => isOpen(x) && !!x.cleMoi && !x.votes[x.cleMoi]);
  if (!taches.length && !seances.length && !evenements.length && !sondages.length) return null;
  const quandEv = (e: { date: string }) => (e.date < auj ? 'en cours' : nomJour(e.date));
  const parts = [
    taches.length && `${nombre(taches.length, 'tâche')} à faire${retard ? ` (${retard} en retard)` : ''}`,
    seances.length === 1 ? `${seances[0].titre} ${nomJour(seances[0].date)}` : seances.length && nombre(seances.length, 'séance'),
    evenements.length === 1 ? `${evenements[0].nom} ${quandEv(evenements[0])}` : evenements.length && nombre(evenements.length, 'événement'),
    sondages.length && `${nombre(sondages.length, 'sondage')} à répondre`,
  ].filter(Boolean);
  // Le détail : celles de la semaine d'abord, puis celles en retard.
  const ordre = [...taches.filter((t) => t.delai >= auj), ...taches.filter((t) => t.delai < auj)];
  const detail = taches.length
    ? ordre.slice(0, 3).map((t) => `« ${t.titre} » ${t.delai < auj ? 'en retard' : nomJour(t.delai)}`).join(' · ') + (taches.length > 3 ? ' …' : '')
    : [
        ...seances.map((m) => `${m.titre} ${nomJour(m.date)}${m.heure ? ` à ${m.heure.replace(':', 'h')}` : ''}`),
        ...evenements.map((e) => `${e.nom} ${quandEv(e)}${e.lieu ? ` · ${e.lieu}` : ''}`),
      ].slice(0, 3).join(' · ');
  return {
    key: `semaine:${auj}`,
    icon: '📅',
    text: `Cette semaine : ${parts.join(', ')}`,
    sub: detail || undefined,
    link: taches.length ? '/taches?delai=semaine' : seances.length ? '/comite' : evenements.length ? '/evenements' : '/sondages',
    kind: 'alerte',
  };
}

/** Tâche à prendre déclinée : où en est-elle ? */
function etatRefus(t: Task) {
  if (!aPrendreOuverte(t)) return 'quelqu’un s’en charge';
  if (plusPersonne(t)) return 'plus personne n’a à répondre : propose-la à d’autres';
  const n = sansReponse(t).length + attenteAilleurs(t);
  return `${n} personne${n > 1 ? 's n’ont' : ' n’a'} pas encore répondu`;
}

/** Même message (taskId, auteur, début de l'aperçu ; le serveur et l'appli coupent l'aperçu chacun à leur façon). */
const memeMessage = (n: { taskId: string; by: string; detail?: string }) => `${n.taskId}|${n.by}|${(n.detail ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)}`;
