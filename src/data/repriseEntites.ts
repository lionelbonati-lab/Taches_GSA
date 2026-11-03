import type { AppData, ClubEvent, Etiquette, Person, Poll, ScheduledEmail, Section, Task, TypeEtiquette } from './types';
import { MEMBRE_PERMS, MEMBRE_ROLE_ID } from './permissions';
import { emailKey } from './membres';
import { norm } from './csv';
import { COULEURS } from './utils';

// Reprise des anciennes entités dans l'espace du club (PLAN_APPLI_SIMPLE.md, règles du 03.11.2026) : chaque entité devient
// une étiquette du club (sous-comité, équipe d'événement → « événement », avec sa date ; groupe → « groupe »), ses
// personnes actives rejoignent le club (même fiche « Personnes du club », sinon même adresse, sinon même nom ; sinon une
// nouvelle fiche, rôle « Membre » ; une fiche inactive du club est réactivée) et deviennent membres de l'étiquette ; ses
// tâches, ses événements, ses sondages et ses emails programmés sont copiés dans l'espace du club, ses tâches avec
// l'étiquette : un groupe dans sa section, un événement dans une sous-section de « Événements ». Les tâches du club
// attribuées à une entité, partagées avec elle ou confiées à l'un de ses responsables reçoivent son étiquette (et ce
// responsable) ; un délai calé sur la date de l'entité l'est sur celle de l'étiquette. Ses séances ne sont pas reprises.
// Rien n'est effacé dans les données d'origine : la reprise rend un nouvel espace.
// Démo : faite une fois, dans le navigateur (demoClub.ts) ; version réelle : migration 059, mêmes règles.

/** Nom comparable (sans accents, ponctuation ni « de / la / … »), comme gsa_reprise_cle (059). */
const cle = (x: string) => norm(x).split(' ').filter((w) => !['de', 'du', 'des', 'la', 'le', 'les', 'd', 'l'].includes(w)).join('');
/** Même nom, ou l'un contient l'autre (4 lettres au moins). */
const proche = (a: string, b: string) => {
  const [x, y] = [cle(a), cle(b)];
  return x === y || (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)));
};

/** Champs d'une tâche du club liés aux entités, avant la reprise. */
type LiensEntite = { evenementEntite?: { uniteId?: string }; respPartage?: Record<string, string[]>; partage?: string[] };

/** Ancienne entité, telle que la démo (et le serveur) la gardait. */
export interface AncienneEntite {
  id: string;
  nom: string;
  type: string;
  couleur?: string;
  date?: string;
  dateFin?: string;
  archive?: boolean;
}

/** Anciens champs propres aux entités (partage, dépendances…), retirés des tâches reprises. */
const ANCIENS_CHAMPS_TACHE = ['partage', 'respPartage', 'placePartage', 'auCentral', 'seanceComite', 'evenementEntite', 'attribueePar', 'copieDe', 'source', 'parCentral', 'modifiePar', 'pieces'] as const;

/** Une tâche sans les anciens champs des entités ; Pour info et À prendre ramenés aux personnes d'ici. */
export function sansEntites(t: Task): Task {
  const x = { ...t } as Task & Record<string, unknown>;
  for (const k of ANCIENS_CHAMPS_TACHE) delete x[k];
  if (x.pourInfo) x.pourInfo = x.pourInfo.personnes?.length ? { personnes: x.pourInfo.personnes } : undefined;
  if (x.aPrendre) {
    const { partage: _p, ...a } = x.aPrendre as typeof x.aPrendre & { partage?: unknown };
    x.aPrendre = a.personnes?.length ? a : undefined;
  }
  if (x.pourInfoVus) x.pourInfoVus = Object.fromEntries(Object.entries(x.pourInfoVus).filter(([k]) => k.startsWith('p:')));
  if (x.commentaires) x.commentaires = x.commentaires.map(({ u: _u, ...c }: (typeof x.commentaires)[number] & { u?: string }) => c);
  if (x.documents) x.documents = x.documents.map(({ parNom: _n, ...d }: NonNullable<Task['documents']>[number] & { parNom?: string }) => d);
  return x;
}

export interface Reprise {
  data: AppData;
  /** Ancienne place (« entité:fiche ») → fiche du club. */
  fiches: Map<string, string>;
  /** Ancienne tâche (« entité:tâche ») → tâche du club. */
  taches: Map<string, string>;
  /** Entité → son étiquette. */
  etiquettes: Map<string, string>;
}

/**
 * L'espace du club à partir de celui du comité central (`club`, gardé tel quel : ses identifiants ne changent pas) et
 * des autres entités (`entites`, avec leurs données). `nouveauId` : identifiant d'une copie (stable : le même à chaque
 * reprise des mêmes données).
 */
export function repriseEntites(club: AppData, entites: { u: AncienneEntite; d: AppData }[], nouveauId = (genre: string, u: string, id: string) => `${genre}-${u}-${id}`): Reprise {
  const data: AppData = structuredClone(club);
  const liens = new Map(club.tasks.map((t) => [t.id, t as Task & LiensEntite]));
  data.tasks = data.tasks.map(sansEntites);
  data.etiquettes = [...(data.etiquettes ?? [])].map((e) => ({ ...e, type: e.type ?? 'groupe', membres: e.membres ?? [] }));
  data.polls = data.polls ?? [];
  data.emails = data.emails ?? [];
  const fiches = new Map<string, string>();
  const taches = new Map<string, string>();
  const etiquettes = new Map<string, string>();
  const membreRole = () => {
    if (!data.roles.some((r) => r.id === MEMBRE_ROLE_ID)) data.roles.push({ id: MEMBRE_ROLE_ID, label: 'Membre', couleur: '#0f766e', permissions: [...MEMBRE_PERMS], sections: [] });
    return MEMBRE_ROLE_ID;
  };
  const ouvert = data.statuses.find((s) => !s.done) ?? data.statuses[0];

  entites.forEach(({ u, d }, i) => {
    // L'étiquette de l'entité.
    const type: TypeEtiquette = u.type === 'groupe' ? 'groupe' : 'evenement';
    const etiquette: Etiquette = {
      id: `et-${u.id}`,
      nom: u.nom,
      couleur: u.couleur ?? COULEURS[i % COULEURS.length],
      type,
      ...(type === 'evenement' && u.date ? { date: u.date, ...(u.dateFin && u.dateFin > u.date ? { dateFin: u.dateFin } : {}) } : {}),
      membres: [],
    };
    const deja = data.etiquettes!.find((e) => e.id === etiquette.id);
    if (deja) Object.assign(etiquette, deja);
    else data.etiquettes!.push(etiquette);
    etiquettes.set(u.id, etiquette.id);

    // Ses personnes, au club : même fiche du registre, sinon même adresse, sinon même nom (sans adresse).
    for (const p of d.people ?? []) {
      const trouvee =
        (p.membreId && data.people.find((x) => x.membreId === p.membreId)) ||
        (emailKey(p.email) && data.people.find((x) => emailKey(x.email) === emailKey(p.email))) ||
        (!emailKey(p.email) && data.people.find((x) => !emailKey(x.email) && norm(`${x.prenom} ${x.nom}`) === norm(`${p.prenom} ${p.nom}`))) ||
        undefined;
      let id = trouvee?.id;
      const via = !!(p as Person & { viaEntite?: string }).viaEntite;
      // Fiche inactive du club, personne active dans l'entité : réactivée avec son rôle actuel.
      if (trouvee && !trouvee.actif && p.actif && !via) trouvee.actif = true;
      if (!id && p.actif && !via) {
        const { roles: _r, ...rest } = p as Person & Record<string, unknown>;
        for (const k of ['viaEntite', 'viaFiche', 'exclu', 'parLien']) delete (rest as Record<string, unknown>)[k];
        const n: Person = { ...(rest as Omit<Person, 'roles'>), id: nouveauId('p', u.id, p.id), roles: [membreRole()], poste: p.poste?.trim() ? `${p.poste.trim()} (${u.nom})` : '' };
        data.people.push(n);
        id = n.id;
        // Ses réglages viennent avec elle.
        if (d.prefs?.[p.id] && !data.prefs[id]) data.prefs[id] = d.prefs[p.id];
      }
      if (!id) continue;
      fiches.set(`${u.id}:${p.id}`, id);
      const actif = data.people.find((x) => x.id === id)?.actif;
      if (p.actif && !via && actif && !etiquette.membres.includes(id)) etiquette.membres.push(id);
    }
    const fiche = (f?: string) => (f ? fiches.get(`${u.id}:${f}`) : undefined);
    const fichesDe = (l: string[] = []) => [...new Set(l.map(fiche).filter((x): x is string => !!x))];

    // Rangement (seulement s'il y a quelque chose à ranger) : la sous-section de « Événements » du même nom si elle
    // existe ; sinon un groupe dans sa section (même nom ou nom proche, créée au besoin), un événement dans une
    // sous-section de « Événements » (nom proche, créée au besoin). Les sections propres à l'entité ne sont pas gardées.
    let place: { sectionId: string; sousSection: string } | undefined;
    const ranger = () => {
      if (place) return place;
      let evts: Section | undefined = data.sections.find((s) => ['evenements', 'evenement'].includes(cle(s.nom)));
      const sous = evts?.sousSections
        .filter((x) => cle(x) === cle(u.nom) || (type === 'evenement' && proche(x, u.nom)))
        .sort((a, b) => +(cle(b) === cle(u.nom)) - +(cle(a) === cle(u.nom)) || a.length - b.length)[0];
      if (evts && sous) return (place = { sectionId: evts.id, sousSection: sous });
      if (type === 'groupe') {
        let s = data.sections.find((x) => cle(x.nom) === cle(u.nom)) ?? data.sections.find((x) => proche(x.nom, u.nom));
        if (!s) {
          s = { id: nouveauId('sec', u.id, 'entite'), nom: u.nom, sousSections: [] };
          data.sections.push(s);
        }
        return (place = { sectionId: s.id, sousSection: '' });
      }
      if (!evts) {
        evts = { id: 'sec-evenements', nom: 'Événements', sousSections: [] };
        data.sections.push(evts);
      }
      evts.sousSections.push(u.nom);
      return (place = { sectionId: evts.id, sousSection: u.nom });
    };

    // Ses événements : un événement du club de même nom le même jour est le même.
    const evenements = new Map<string, string>();
    for (const e of d.events ?? []) {
      const meme = data.events.find((x) => x.date === e.date && norm(x.nom) === norm(e.nom));
      if (meme) {
        evenements.set(e.id, meme.id);
        continue;
      }
      const n: ClubEvent = { ...e, id: nouveauId('e', u.id, e.id) };
      if (n.serie) n.serie = { ...n.serie, id: nouveauId('e', u.id, n.serie.id) };
      if (n.repriseDe) n.repriseDe = nouveauId('e', u.id, n.repriseDe);
      data.events.push(n);
      evenements.set(e.id, n.id);
    }

    // Ses tâches, avec l'étiquette.
    (d.tasks ?? []).forEach((t) => taches.set(`${u.id}:${t.id}`, nouveauId('t', u.id, t.id)));
    const tache = (id?: string) => (id ? taches.get(`${u.id}:${id}`) : undefined);
    const statut = (id: string) => {
      const s = (d.statuses ?? []).find((x) => x.id === id);
      return (data.statuses.find((x) => x.id === id) ?? (s && data.statuses.find((x) => norm(x.label) === norm(s.label))) ?? (s?.done ? data.statuses.find((x) => x.done) : undefined) ?? ouvert).id;
    };
    for (const t0 of d.tasks ?? []) {
      const t = sansEntites(t0);
      const p = t.paiement;
      const parSeance = !!t.meetingId;
      const x: Task = {
        ...t,
        id: tache(t.id)!,
        ...ranger(),
        statusId: statut(t.statusId),
        responsables: fichesDe(t.responsables),
        createdBy: fiche(t.createdBy) ?? '',
        eventId: t.eventId ? evenements.get(t.eventId) : undefined,
        // Les séances de l'entité ne sont pas reprises : le délai reste, sans lien.
        meetingId: undefined,
        delaiRef: parSeance && t.delaiRef?.type === 'meeting' ? undefined : t.delaiRef,
        parentId: tache(t.parentId),
        suivanteId: tache(t.suivanteId),
        etiquettes: [...new Set([...(t.etiquettes ?? []), etiquette.id])],
        pourInfo: t.pourInfo?.personnes ? { personnes: fichesDe(t.pourInfo.personnes) } : undefined,
        pourInfoVus: t.pourInfoVus ? Object.fromEntries(Object.entries(t.pourInfoVus).flatMap(([k, v]) => (fiche(k.slice(2)) ? [[`p:${fiche(k.slice(2))}`, v]] : []))) : undefined,
        aPrendre: t.aPrendre ? { ...t.aPrendre, personnes: fichesDe(t.aPrendre.personnes), refus: t.aPrendre.refus && fichesDe(t.aPrendre.refus), par: fiche(t.aPrendre.par) } : undefined,
        commentaires: t.commentaires?.map((c) => ({ ...c, par: fiche(c.par) ?? c.par })),
        paiement: p && {
          ...p,
          demandePar: fiche(p.demandePar) ?? '',
          visa: p.visa && { ...p.visa, a: fiche(p.visa.a) ?? p.visa.a, par: fiche(p.visa.par) ?? p.visa.par },
          validation: p.validation && { ...p.validation, par: fiche(p.validation.par) ?? p.validation.par },
          refus: p.refus && { ...p.refus, par: fiche(p.refus.par) ?? p.refus.par },
          paye: p.paye && { ...p.paye, par: fiche(p.paye.par) ?? p.paye.par },
        },
      };
      if (!x.eventId && x.delaiRef?.type === 'event') x.delaiRef = undefined;
      data.tasks.push(x);
    }

    // Ses sondages (les réponses des autres entités, sous « entité:fiche », ne suivent pas).
    for (const s of d.polls ?? []) {
      const { entites: _e, ...rest } = s as Poll & { entites?: string[] };
      data.polls!.push({
        ...rest,
        id: nouveauId('poll', u.id, s.id),
        votants: fichesDe(s.votants),
        votes: Object.fromEntries(Object.entries(s.votes ?? {}).flatMap(([k, v]) => (fiche(k) ? [[fiche(k)!, v]] : []))),
        textes: s.textes && Object.fromEntries(Object.entries(s.textes).flatMap(([k, v]) => (fiche(k) ? [[fiche(k)!, v]] : []))),
        creePar: fiche(s.creePar) ?? '',
        taskId: tache(s.taskId),
        sectionId: s.sectionId ? ranger().sectionId : undefined,
      });
    }

    // Ses emails programmés.
    for (const e of d.emails ?? []) {
      const { unites: _u, externes: _x, ...rest } = e as ScheduledEmail & { unites?: unknown; externes?: unknown };
      const taskId = tache(e.taskId);
      if (!taskId) continue;
      data.emails!.push({ ...rest, id: nouveauId('em', u.id, e.id), taskId, destinataires: fichesDe(e.destinataires), creePar: fiche(e.creePar) ?? '', envoyePar: fiche(e.envoyePar) });
    }
  });

  // Tâches du club liées à une entité reprise : son étiquette, ses responsables, un délai calé sur sa date.
  data.tasks = data.tasks.map((t) => {
    const l = liens.get(t.id);
    if (!l) return t;
    const ids = [l.evenementEntite?.uniteId, ...(l.partage ?? [])].filter((x): x is string => !!x && etiquettes.has(x));
    const resp = Object.entries(l.respPartage ?? {}).flatMap(([u, f]) => f.map((x) => fiches.get(`${u}:${x}`)).filter((x): x is string => !!x));
    if (!ids.length && !resp.length) return t;
    const x: Task = { ...t, etiquettes: [...new Set([...(t.etiquettes ?? []), ...ids.map((u) => etiquettes.get(u)!)])], responsables: [...new Set([...t.responsables, ...resp])] };
    const u = l.evenementEntite?.uniteId;
    if (u && etiquettes.has(u) && x.delaiRef?.type === 'event' && !x.eventId) {
      const { occurrence: _o, ...r } = x.delaiRef;
      x.delaiRef = { ...r, type: 'etiquette', etiquetteId: etiquettes.get(u) };
    }
    return x;
  });

  // Anciens champs des entités, sur l'espace lui-même.
  const brut = data as AppData & Record<string, unknown>;
  delete brut.membresDe;
  delete brut.postes;
  return { data, fiches, taches, etiquettes };
}
