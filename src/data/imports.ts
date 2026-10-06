import type { LigneImport } from '../components/ImportCsv';
import { lireDate, liste, norm, type Colonne } from './csv';
import { compactIban, emailKey, groupesClub, ibanValide, nomMembre, nouveauMembre, trouverMembre } from './membres';
import { ADMIN_ROLE_ID } from './permissions';
import { defaultRoleId, UNIT_COLORS } from './units';
import type { AppData, ClubEvent, ClubMembre, OrgUnit, Person, Task } from './types';
import { uid } from './utils';

// Imports CSV : ce que chaque ligne deviendra (nouveau, mise à jour, ignoré, erreur), avant de valider.
// Une personne déjà connue (même email, sinon même prénom et nom) est mise à jour : les cellules remplies
// remplacent les valeurs, les cellules vides ne changent rien.

const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** Modifications d'une fiche : champs remplis qui changent. */
function changer<T extends object>(avant: T, champs: Partial<T>): { apres: T; changes: string[] } {
  const apres = { ...avant };
  const changes: string[] = [];
  (Object.keys(champs) as (keyof T)[]).forEach((k) => {
    const v = champs[k];
    if (v === undefined || v === '' || JSON.stringify(v) === JSON.stringify(avant[k])) return;
    apres[k] = v as T[keyof T];
    changes.push(String(k));
  });
  return { apres, changes };
}

const LIBELLES: Record<string, string> = { prenom: 'prénom', nom: 'nom', email: 'email', telephone: 'téléphone', iban: 'IBAN', groupes: 'groupes', poste: 'poste', roles: 'rôles', actif: 'réactivé' };
const libelles = (c: string[]) => c.map((k) => LIBELLES[k] ?? k).join(', ');

// ---------- Registre des membres du club ----------

export type ColRegistre = 'prenom' | 'nom' | 'email' | 'telephone' | 'iban' | 'groupes';
export const COLS_REGISTRE: Colonne<ColRegistre>[] = [
  { key: 'prenom', label: 'Prénom', required: true, exemple: 'Prénom' },
  { key: 'nom', label: 'Nom', aliases: ['Nom de famille'], required: true, exemple: 'Nom' },
  { key: 'email', label: 'Email', aliases: ['E-mail', 'Adresse email', 'Courriel', 'Mail'], exemple: 'prenom.nom@exemple.ch', aide: 'reconnaît une personne déjà inscrite' },
  { key: 'telephone', label: 'Téléphone', aliases: ['Tél', 'Tel', 'Portable', 'Natel', 'Mobile'], exemple: '079 000 00 00' },
  { key: 'iban', label: 'IBAN', aliases: ['Compte', 'IBAN / compte'], exemple: 'CH93 0076 2011 6238 5295 7' },
  { key: 'groupes', label: 'Groupes', aliases: ['Groupe'], exemple: 'École de cyclisme', aide: 'noms des groupes de l’organigramme, séparés par des virgules' },
];

export function analyserRegistre(lignes: Record<ColRegistre, string>[], existants: ClubMembre[], units: OrgUnit[]): LigneImport<ClubMembre>[] {
  const groupes = groupesClub(units);
  const travail = existants.map((m) => ({ ...m }));
  const deja = new Set<string>();
  return lignes.map((l) => {
    const texte = [nomMembre(l), l.email].filter(Boolean).join(' · ');
    if (!nomMembre(l)) return { statut: 'erreur', texte: l.email || '—', detail: 'Prénom ou nom manquant' };
    if (l.email && !emailOk(l.email)) return { statut: 'erreur', texte, detail: `Adresse email invalide : « ${l.email} »` };
    const avertissements: string[] = [];
    let iban: string | undefined = l.iban ? compactIban(l.iban) : undefined;
    if (iban && !ibanValide(iban)) {
      avertissements.push(`IBAN invalide (${l.iban}) : pas importé`);
      iban = undefined;
    }
    let ids: string[] | undefined;
    if (l.groupes) {
      ids = [];
      for (const g of liste(l.groupes)) {
        const u = groupes.find((x) => norm(x.nom) === norm(g));
        if (u) ids.push(u.id);
        else avertissements.push(`Groupe inconnu : « ${g} »`);
      }
      if (!ids.length) ids = undefined;
    }
    const champs: Partial<ClubMembre> = { prenom: l.prenom, nom: l.nom, email: l.email, telephone: l.telephone, iban, groupes: ids };
    const m = trouverMembre(travail, l);
    if (!m) {
      const n = nouveauMembre({ ...champs, couleur: UNIT_COLORS[travail.length % UNIT_COLORS.length] });
      travail.push(n);
      deja.add(n.id);
      return { statut: 'nouveau', texte, avertissements, valeur: n };
    }
    const { apres, changes } = changer(m, champs);
    if (!changes.length) return { statut: 'ignore', texte, detail: deja.has(m.id) ? 'Doublon d’une ligne précédente' : 'Déjà à jour', avertissements };
    Object.assign(m, apres);
    return { statut: deja.has(m.id) ? 'nouveau' : 'maj', texte, detail: `${nomMembre(m)} : ${libelles(changes)}`, avertissements, valeur: { ...m } };
  });
}

/** Dernière version de chaque membre (une personne sur plusieurs lignes). */
export const derniers = <T extends { id: string }>(list: T[]) => [...new Map(list.map((x) => [x.id, x])).values()];

// ---------- Personnes d'une entité (poste, rôles) ----------

export type ColPersonne = 'prenom' | 'nom' | 'email' | 'telephone' | 'poste' | 'roles';
export const COLS_PERSONNES: Colonne<ColPersonne>[] = [
  { key: 'prenom', label: 'Prénom', required: true, exemple: 'Prénom' },
  { key: 'nom', label: 'Nom', aliases: ['Nom de famille'], required: true, exemple: 'Nom' },
  { key: 'email', label: 'Email', aliases: ['E-mail', 'Adresse email', 'Courriel', 'Mail'], exemple: 'prenom.nom@exemple.ch', aide: 'reconnaît une personne déjà présente (ici ou ailleurs dans le club)' },
  { key: 'telephone', label: 'Téléphone', aliases: ['Tél', 'Tel', 'Portable', 'Natel', 'Mobile'], exemple: '079 000 00 00' },
  { key: 'poste', label: 'Poste', aliases: ['Fonction'], exemple: 'Bénévole' },
  { key: 'roles', label: 'Rôle', aliases: ['Rôles'], exemple: 'Membre', aide: 'noms des rôles de l’entité, séparés par des virgules (vide : rôle de base)' },
];

/**
 * Personnes à ajouter ou mettre à jour dans l'entité. Les rôles indiqués s'ajoutent à ceux de la personne ;
 * le rôle Admin n'est donné que par un admin. `registre` : membres du club, pour relier les nouvelles fiches.
 */
export function analyserPersonnes(lignes: Record<ColPersonne, string>[], d: AppData, opts: { admin: boolean; registre?: ClubMembre[] }): LigneImport<Person>[] {
  const travail = d.people.map((p) => ({ ...p, roles: [...p.roles] }));
  const nouveaux = new Set<string>();
  return lignes.map((l) => {
    const texte = [nomMembre(l), l.poste, l.email].filter(Boolean).join(' · ');
    if (!nomMembre(l)) return { statut: 'erreur', texte: l.email || '—', detail: 'Prénom ou nom manquant' };
    if (l.email && !emailOk(l.email)) return { statut: 'erreur', texte, detail: `Adresse email invalide : « ${l.email} »` };
    const avertissements: string[] = [];
    const roles: string[] = [];
    for (const r of liste(l.roles)) {
      const role = d.roles.find((x) => norm(x.label) === norm(r) || x.id === r);
      if (!role) avertissements.push(`Rôle inconnu : « ${r} »`);
      else if (role.id === ADMIN_ROLE_ID && !opts.admin) avertissements.push('Rôle Admin : seul un administrateur peut le donner');
      else roles.push(role.id);
    }
    const p = trouverMembre(travail, l);
    if (!p) {
      const m = opts.registre && trouverMembre(opts.registre, l);
      const n: Person = {
        id: uid('p'),
        prenom: l.prenom || m?.prenom || '',
        nom: l.nom || m?.nom || '',
        email: l.email || m?.email || '',
        telephone: l.telephone || m?.telephone || '',
        poste: l.poste,
        roles: roles.length ? [...new Set(roles)] : [defaultRoleId(d.roles)],
        actif: true,
        couleur: m?.couleur ?? UNIT_COLORS[travail.length % UNIT_COLORS.length],
        ...(m ? { membreId: m.id } : {}),
      };
      travail.push(n);
      nouveaux.add(n.id);
      return { statut: 'nouveau', texte, detail: m ? 'Déjà dans le registre du club : fiche reliée' : undefined, avertissements, valeur: n };
    }
    const champs: Partial<Person> = { prenom: l.prenom, nom: l.nom, email: l.email, telephone: l.telephone, poste: l.poste };
    const plus = roles.filter((r) => !p.roles.includes(r));
    if (plus.length) champs.roles = [...p.roles, ...plus];
    if (!p.actif) champs.actif = true;
    const { apres, changes } = changer(p, champs);
    if (!changes.length) return { statut: 'ignore', texte, detail: nouveaux.has(p.id) ? 'Doublon d’une ligne précédente' : 'Déjà à jour', avertissements };
    Object.assign(p, apres);
    return { statut: nouveaux.has(p.id) ? 'nouveau' : 'maj', texte, detail: `${nomMembre(p)} : ${libelles(changes)}`, avertissements, valeur: { ...p, roles: [...p.roles] } };
  });
}

// ---------- Tâches ----------

export type ColTache = 'titre' | 'section' | 'sous' | 'responsables' | 'delai' | 'statut' | 'remarque';
export const COLS_TACHES: Colonne<ColTache>[] = [
  { key: 'titre', label: 'Titre', aliases: ['Tâche', 'Tache', 'Description de la tâche'], required: true, exemple: 'Réserver la salle' },
  { key: 'section', label: 'Section', aliases: ['Rubrique', 'Domaine'], exemple: '', aide: 'nom d’une section existante (vide : la première)' },
  { key: 'sous', label: 'Sous-section', aliases: ['Sous section', 'Sous-rubrique'], exemple: '' },
  { key: 'responsables', label: 'Responsables', aliases: ['Responsable', 'Qui'], exemple: '', aide: 'prénoms et noms, postes ou emails, séparés par des virgules' },
  { key: 'delai', label: 'Délai', aliases: ['Date', 'Échéance', 'Pour le', 'Quand'], exemple: '31.12.2026', aide: 'date (31.12.2026 ou 2026-12-31)' },
  { key: 'statut', label: 'Statut', aliases: ['État', 'Etat'], exemple: '', aide: 'vide : premier statut « en cours »' },
  { key: 'remarque', label: 'Remarque', aliases: ['Remarques', 'Commentaire', 'Notes'], exemple: '' },
];

/** Personne désignée dans une cellule : email, « Prénom Nom », « Nom Prénom », prénom seul ou poste (sans ambiguïté). */
function trouverPersonne(people: Person[], s: string): Person | undefined {
  const k = norm(s);
  const actifs = people.filter((p) => p.actif);
  const une = (l: Person[]) => (l.length === 1 ? l[0] : undefined);
  return (
    actifs.find((p) => emailKey(p.email) === emailKey(s)) ??
    une(actifs.filter((p) => norm(`${p.prenom} ${p.nom}`) === k || norm(`${p.nom} ${p.prenom}`) === k)) ??
    une(actifs.filter((p) => norm(p.prenom) === k)) ??
    une(actifs.filter((p) => norm(p.poste) === k))
  );
}

export function analyserTaches(lignes: Record<ColTache, string>[], d: AppData, userId: string): LigneImport<Task>[] {
  const ouvert = d.statuses.find((s) => !s.done) ?? d.statuses[0];
  const vus = new Set(d.tasks.map((t) => `${t.sectionId}|${norm(t.titre)}`));
  const now = new Date().toISOString();
  return lignes.map((l) => {
    if (!l.titre) return { statut: 'erreur', texte: '—', detail: 'Titre manquant' };
    const avertissements: string[] = [];
    let section = d.sections[0];
    if (l.section) {
      const s = d.sections.find((x) => norm(x.nom) === norm(l.section));
      if (s) section = s;
      else avertissements.push(`Section inconnue « ${l.section} » : ${section?.nom ?? 'aucune'}`);
    }
    let sous = '';
    if (l.sous) {
      sous = section?.sousSections.find((x) => norm(x) === norm(l.sous)) ?? '';
      if (!sous) avertissements.push(`Sous-section inconnue « ${l.sous} » : ignorée`);
    }
    const responsables: string[] = [];
    for (const r of liste(l.responsables)) {
      const p = trouverPersonne(d.people, r);
      if (p) responsables.includes(p.id) || responsables.push(p.id);
      else avertissements.push(`Responsable introuvable : « ${r} »`);
    }
    let delai = lireDate(l.delai);
    if (delai === null) {
      avertissements.push(`Date illisible « ${l.delai} » : sans délai`);
      delai = '';
    }
    let statut = ouvert;
    if (l.statut) {
      const s = d.statuses.find((x) => norm(x.label) === norm(l.statut));
      if (s) statut = s;
      else avertissements.push(`Statut inconnu « ${l.statut} » : ${ouvert?.label ?? ''}`);
    }
    const texte = [l.titre, section?.nom, delai].filter(Boolean).join(' · ');
    const cle = `${section?.id ?? ''}|${norm(l.titre)}`;
    if (vus.has(cle)) return { statut: 'ignore', texte, detail: 'Une tâche de ce titre existe déjà dans la section' };
    vus.add(cle);
    return {
      statut: 'nouveau',
      texte,
      detail: responsables.length ? `Pour : ${responsables.map((id) => nomMembre(d.people.find((p) => p.id === id)!)).join(', ')}` : undefined,
      avertissements,
      valeur: {
        id: uid('t'),
        sectionId: section?.id ?? '',
        sousSection: sous,
        titre: l.titre,
        responsables,
        statusId: statut?.id ?? '',
        delai,
        remarque: l.remarque,
        checklist: [],
        createdBy: userId,
        updatedAt: now,
        ...(statut?.done ? { termineeLe: now.slice(0, 10) } : {}),
      },
    };
  });
}

// ---------- Événements ----------

export type ColEvenement = 'nom' | 'date' | 'dateFin' | 'lieu' | 'description';
export const COLS_EVENEMENTS: Colonne<ColEvenement>[] = [
  { key: 'nom', label: 'Nom', aliases: ['Événement', 'Evenement', 'Titre'], required: true, exemple: 'Course du club' },
  { key: 'date', label: 'Date', aliases: ['Date de début', 'Début', 'Le'], required: true, exemple: '05.06.2027' },
  { key: 'dateFin', label: 'Date de fin', aliases: ['Fin', 'Jusqu’au', "Jusqu'au"], exemple: '' },
  { key: 'lieu', label: 'Lieu', aliases: ['Endroit'], exemple: 'Porrentruy' },
  { key: 'description', label: 'Description', aliases: ['Remarque', 'Détails', 'Infos'], exemple: '' },
];

/** Événements à ajouter ; même nom à la même date : mis à jour. */
export function analyserEvenements(lignes: Record<ColEvenement, string>[], d: AppData): LigneImport<ClubEvent>[] {
  const travail = d.events.map((e) => ({ ...e }));
  const nouveaux = new Set<string>();
  return lignes.map((l) => {
    const date = lireDate(l.date);
    const texte = [l.nom, l.date].filter(Boolean).join(' · ');
    if (!l.nom) return { statut: 'erreur', texte: texte || '—', detail: 'Nom manquant' };
    if (!date) return { statut: 'erreur', texte, detail: l.date ? `Date illisible : « ${l.date} »` : 'Date manquante' };
    const avertissements: string[] = [];
    let fin = lireDate(l.dateFin);
    if (fin === null || (fin && fin < date)) {
      avertissements.push(`Date de fin « ${l.dateFin} » ignorée`);
      fin = '';
    }
    const e = travail.find((x) => x.date === date && norm(x.nom) === norm(l.nom));
    if (!e) {
      const n: ClubEvent = { id: uid('e'), nom: l.nom, date, lieu: l.lieu, description: l.description, ...(fin && fin > date ? { dateFin: fin } : {}) };
      travail.push(n);
      nouveaux.add(n.id);
      return { statut: 'nouveau', texte, avertissements, valeur: n };
    }
    const { apres, changes } = changer(e, { lieu: l.lieu, description: l.description, dateFin: fin && fin > date ? fin : undefined });
    if (!changes.length) return { statut: 'ignore', texte, detail: nouveaux.has(e.id) ? 'Doublon d’une ligne précédente' : 'Déjà à jour', avertissements };
    Object.assign(e, apres);
    return { statut: nouveaux.has(e.id) ? 'nouveau' : 'maj', texte, detail: `Modifié : ${changes.join(', ')}`, avertissements, valeur: { ...e } };
  });
}
