import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClub, type CreatedUnit, type NewMember, type NewUnit } from '../data/club';
import { auComiteEntier, directory, orgMembers, parentDans, sousEntites, SUB_TYPES, UNIT_COLORS, UNIT_TYPES, type DirectoryEntry } from '../data/units';
import type { OrganigrammeAnnuel, OrgMember, OrgUnit, TachesDependance, Unit, UnitType } from '../data/types';
import { dateCourte, TACHES_DEPENDANCE } from '../data/partage';
import { fmtDate } from '../data/utils';
import { getMode } from '../data/mode';
import { Initials, Modal, UnitMark } from '../components/ui';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { groupesLies } from '../data/liens';
import { nomMembre } from '../data/membres';
import { ImagePicker } from '../components/ImagePicker';
import { CredentialsModal } from '../components/Acces';
import { SupprimerEntite } from '../components/SupprimerEntite';
import { FicheMembre, FichePersonne } from '../components/Personnes';
import {
  AvecModal,
  EnMain,
  Fiche,
  lireCible,
  NomPosteModal,
  PosteModal,
  quiDeMembre,
  Recherche,
  titulairesDu,
  useCandidats,
  useGlisser,
  type ActionsFiche,
  type OrgaVue,
  type Prise,
} from '../components/Organiser';
import { benevolesDe, et, fonctionsDe, memeQui, nomDe, type OpOrga } from '../data/organigramme';
import { norm } from '../data/csv';
import { OrgLignes, type EditionLignes } from '../components/OrgLignes';
import type { ActionOrga, PosteLie } from '../data/organigrammeLignes';
import { ZoneTexte } from '../components/ZoneTexte';
import { Icone } from '../components/icones';

// Organigramme du club, par postes (components/OrgLignes.tsx) : comités, groupes et événements en lignes, une carte
// par poste ; un clic sur un nom ouvre le profil de la personne, sur une entité l'ouvre. Par défaut une vue d'ensemble ;
// « ✏️ Modifier l'organigramme » : on y glisse les postes, les groupes, les événements et les personnes, on y crée un
// poste ou un comité, ⚙️ modifie la fiche d'une entité (moteur de l'organigramme : club.organiser).
// Historique : « 📅 » choisit une année passée, telle qu'à sa dernière photo (prise par le serveur), en lecture seule.
// Entités archivées : leurs fiches en bas (⚙️ pour les ressortir ou les supprimer).
// Visible de tous les membres du club ; seul le comité central crée et modifie les entités,
// chaque président / responsable peut modifier la fiche de la sienne et choisir ce que le comité dont elle dépend
// affiche de ses tâches (« Ses tâches dans … »).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dated = (t: UnitType) => t === 'sous-comite' || t === 'equipe';

export function Org() {
  const club = useClub();
  const { data } = useStore();
  const [edit, setEdit] = useState<{ unit?: OrgUnit; type?: UnitType } | null>(null);
  const [created, setCreated] = useState<{ c: CreatedUnit; n: NewUnit } | null>(null);
  const [fiche, setFiche] = useState<{ unitId: string; personId: string } | null>(null);
  const [lien, setLien] = useState<{ unitId: string; id: string } | null>(null);
  // Mode « Modifier » : glisser les cartes et les personnes, ＋ Poste, ⚙️ ; sinon une vue d'ensemble.
  const [modeModifier, setModeModifier] = useState(false);
  // Arrivée depuis une autre entité (?entite=<entité>&personne=<fiche> ou &lien=…, &modifier si on était en mode
  // « Modifier ») : ouvert une fois l'entité chargée.
  const [params, setParams] = useSearchParams();
  const entite = params.get('entite');
  useEffect(() => {
    if (!entite || entite !== club.current.id) return;
    const personne = params.get('personne');
    const lie = params.get('lien');
    setParams({}, { replace: true });
    if (params.has('modifier')) setModeModifier(true);
    if (personne) setFiche({ unitId: entite, personId: personne });
    if (lie) setLien({ unitId: entite, id: lie });
  }, [entite, club.current.id, params, setParams]);
  // ?modifier (console admin › Personnes et accès) : directement en mode « Modifier ».
  useEffect(() => {
    if (!params.has('modifier') || params.has('entite')) return;
    setModeModifier(true);
    const reste = new URLSearchParams(params);
    reste.delete('modifier');
    setParams(reste, { replace: true });
  }, [params, setParams]);
  // Relire l'organigramme à l'ouverture (changements faits dans d'autres entités).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    club.refresh();
  }, []);
  // Historique : organigrammes des années passées (l'année en cours est celle d'aujourd'hui).
  const [annees, setAnnees] = useState<OrganigrammeAnnuel[]>([]);
  const [annee, setAnnee] = useState<number | null>(null);
  useEffect(() => {
    let vivant = true;
    club
      .organigrammesAnnuels()
      .then((l) => vivant && setAnnees((l ?? []).filter((x) => x.annee < new Date().getFullYear())))
      .catch(() => {});
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const photo = annees.find((x) => x.annee === annee);
  // Les logos ne sont pas dans les photos : ceux d'aujourd'hui.
  const photoUnits = useMemo(() => photo?.units.map((u) => ({ ...u, logo: club.units.find((x) => x.id === u.id)?.logo })), [photo, club.units]);

  // L'entité ouverte : ses membres tels qu'ils sont maintenant (modifications pas encore relues).
  const units = useMemo(
    () => club.units.map((u) => (u.id === club.current.id ? { ...u, membres: orgMembers(data), liens: data.membresDe?.map((l) => l.uniteId), postes: data.postes ?? u.postes } : u)),
    [club.units, club.current.id, data],
  );
  const active = units.filter((u) => !u.archive);
  const archived = units.filter((u) => u.archive);
  // Il se modifie sur place avec le moteur de l'organigramme (démo et version réelle).
  const orga = !!club.organiser;
  const peutModifier = orga && (club.canManage || units.some((u) => u.moiAdmin && !u.archive));
  const edition = modeModifier && peutModifier;
  const [q, setQ] = useState('');
  const [deplies, setDeplies] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(DEPLIES) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const deplier = (id: string) =>
    setDeplies((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      try {
        localStorage.setItem(DEPLIES, JSON.stringify([...n]));
      } catch {
        /* navigation privée : repliées à la prochaine visite */
      }
      return n;
    });
  const [nommer, setNommer] = useState<{ uniteId: string; prise?: Prise } | null>(null);
  const [posteOuvert, setPosteOuvert] = useState<{ uniteId: string; posteId: string } | null>(null);
  // Une personne lâchée sur un poste occupé : avec ses titulaires, ou à la place de l'un d'eux.
  const [avec, setAvec] = useState<{ prise: Prise; uniteId: string; posteId: string } | null>(null);
  const [fait, setFait] = useState<{ message: string; annuler?: () => Promise<void>; erreur?: boolean } | null>(null);
  useEffect(() => {
    if (!fait) return;
    const t = setTimeout(() => setFait(null), 8000);
    return () => clearTimeout(t);
  }, [fait]);
  /** Une ou plusieurs modifications de l'organigramme ; ce qui a été fait s'affiche en bas, avec « Annuler ». */
  const faire = async (ops: OpOrga | OpOrga[]) => {
    if (!club.organiser) return false;
    const annulers: (() => Promise<void>)[] = [];
    const messages: string[] = [];
    try {
      for (const op of Array.isArray(ops) ? ops : [ops]) {
        const r = await club.organiser(op);
        annulers.unshift(r.annuler);
        if (r.message) messages.push(r.message);
      }
    } catch (e) {
      for (const a of annulers) await a();
      setFait({ message: e instanceof Error ? e.message : String(e), erreur: true });
      return false;
    }
    if (messages.length)
      setFait({
        message: messages.join(' · '),
        annuler: async () => {
          for (const a of annulers) await a();
          setFait({ message: 'Annulé.' });
        },
      });
    return true;
  };
  const peutFiche = (u?: OrgUnit) => !!u && !u.archive && (club.canManage || !!u.moiAdmin);
  const uniteDe = (id: string) => units.find((x) => x.id === id);
  /** Les titulaires du poste (un poste à plusieurs : tous). */
  const titulairesDe = (uniteId: string, posteId: string) => {
    const u = uniteDe(uniteId);
    const po = u?.postes?.find((x) => x.id === posteId);
    return u && po ? titulairesDu(u, po) : [];
  };
  const glisser = useGlisser({
    peut: (p, c) => {
      const v = lireCible(c);
      if (p.depuis && !peutFiche(uniteDe(p.depuis.uniteId))) return false;
      if (v.zone === 'corbeille') return !!p.depuis;
      if (!peutFiche(uniteDe(v.uniteId))) return false;
      // Déjà à ce poste (l'une de ses places), même venue d'une autre entité : rien à faire.
      if (v.zone === 'poste' && titulairesDe(v.uniteId, v.posteId).some((t) => memeQui(t.m, p.qui))) return false;
      // Là où elle est déjà : rien à faire.
      const d = p.depuis;
      if (!d || d.uniteId !== v.uniteId) return true;
      if (v.zone === 'etoile') return !(d.zone === 'titre' && v.personId === d.personId);
      if (v.zone === 'poste') return !titulairesDe(v.uniteId, v.posteId).some((t) => t.m.id === d.personId);
      return v.zone === 'nouveau' || v.zone !== d.zone;
    },
    libelle: (p, c) => {
      const v = lireCible(c);
      if (v.zone === 'corbeille') return `🗑 Retirer de « ${uniteDe(p.depuis?.uniteId ?? '')?.nom ?? '?'} »`;
      const u = uniteDe(v.uniteId);
      if (!u) return '';
      const t = UNIT_TYPES[u.type];
      if (v.zone === 'titre') return `★ ${t.chef.toLowerCase()} de « ${u.nom} »`;
      if (v.zone === 'etoile') {
        const m = u.membres.find((x) => x.id === v.personId);
        return `★ à la place de ${m ? nomDe(m) : '?'}`;
      }
      if (v.zone === 'poste') {
        const po = u.postes?.find((x) => x.id === v.posteId);
        const tit = titulairesDe(v.uniteId, v.posteId);
        return tit.length ? `${po?.nom ?? 'Poste'} : avec ${et(tit.map((t) => nomDe(t.m)))}, ou à ${tit.length > 1 ? 'la place de l’un d’eux' : 'sa place'} ?` : (po?.nom ?? 'Poste');
      }
      if (v.zone === 'nouveau') return `＋ Nouveau poste dans « ${u.nom} »`;
      const b = benevolesDe(u.type).un;
      return `${b[0].toUpperCase()}${b.slice(1)} de « ${u.nom} »`;
    },
    deposer: (p, c) => {
      const v = lireCible(c);
      if (p.cle) setQ('');
      if (v.zone === 'nouveau') return setNommer({ uniteId: v.uniteId, prise: p });
      if (v.zone === 'poste' && titulairesDe(v.uniteId, v.posteId).length) return setAvec({ prise: p, uniteId: v.uniteId, posteId: v.posteId });
      void faire({ type: 'placer', qui: p.qui, depuis: p.depuis, vers: v });
    },
  });
  // Organigramme par postes : ce que la personne connectée peut déplacer, et comment c'est fait. Les postes liés : admins
  // des fiches touchées ; la dépendance d'un événement : comité central.
  const peutAction = (a: ActionOrga) =>
    a.type === 'ranger'
      ? club.canManage || !!uniteDe(a.comite)?.moiAdmin
      : a.type === 'liaison'
        ? (!(a.creer.length || a.lier?.length) || peutFiche(uniteDe(a.vers))) &&
          [...a.retirer, ...a.delier].every((p) => peutFiche(uniteDe(p.entite))) &&
          (!a.ordre || club.canManage || !!uniteDe(a.ordre.comite)?.moiAdmin)
        : a.type === 'dependance'
          ? (!a.vers || club.canManage) && [...a.retirer, ...a.delier].every((p) => peutFiche(uniteDe(p.entite)))
          : peutFiche(a.de) && peutFiche(a.vers);
  /**
   * Fiches d'entités modifiées (dépendance, ordre des cartes), puis les modifications de l'organigramme qui vont avec
   * (`ops` : postes liés retirés) ; un seul « Annuler » remet tout comme avant.
   */
  const changerEntites = async (patches: [string, Partial<Unit>][], message: string, ops: OpOrga[] = []) => {
    const avant = patches.map(([id, p]): [string, Partial<Unit>] => {
      const u = uniteDe(id) as Partial<Unit> | undefined;
      return [id, Object.fromEntries(Object.keys(p).map((k) => [k, u?.[k as keyof Unit]]))];
    });
    const annulers: (() => Promise<void>)[] = [];
    try {
      for (const [id, p] of patches) await club.updateUnit(id, p);
      annulers.push(async () => {
        for (const [id, p] of [...avant].reverse()) await club.updateUnit(id, p);
      });
      for (const op of ops) {
        if (!club.organiser) break;
        annulers.unshift((await club.organiser(op)).annuler);
      }
    } catch (e) {
      for (const a of annulers) await a();
      setFait({ message: e instanceof Error ? e.message : String(e), erreur: true });
      return;
    }
    setFait({
      message,
      annuler: async () => {
        for (const a of annulers) await a();
        setFait({ message: 'Annulé.' });
      },
    });
  };
  const executer = (a: ActionOrga) => {
    if (a.type === 'ranger') return void changerEntites([[a.comite, { rangement: a.ordre }]], `Cartes de « ${uniteDe(a.comite)?.nom ?? '?'} » rangées`);
    // Les liens d'avant d'un événement : ses postes liés dans les groupes s'en vont, ceux des comités restent, sans lien.
    const anciens = (a: { retirer: PosteLie[]; delier: PosteLie[] }) => [
      ...a.retirer.map((p): OpOrga => ({ type: 'supprimerPoste', uniteId: p.entite, posteId: p.posteId })),
      ...a.delier.map((p): OpOrga => ({ type: 'lier', uniteId: p.entite, posteId: p.posteId, lien: null })),
    ];
    // Un événement sous un comité : il en dépend, tout le comité en est responsable.
    if (a.type === 'dependance') return void changerEntites(a.vers ? [[a.u.id, { dependDe: a.vers }]] : [], a.libelle, anciens(a));
    // Où siège le responsable d'un groupe, quel groupe organise un événement, quel poste d'un comité en est responsable :
    // ses nouveaux postes liés, puis les anciens s'en vont (sa dépendance reste).
    if (a.type === 'liaison')
      return void changerEntites(a.ordre ? [[a.ordre.comite, { rangement: a.ordre.ordre }]] : [], a.libelle, [
        ...a.creer.map((nom): OpOrga => ({ type: 'nouveauPoste', uniteId: a.vers, nom, lien: a.u.id })),
        ...(a.lier ?? []).map((p): OpOrga => ({ type: 'lier', uniteId: p.entite, posteId: p.posteId, lien: a.u.id })),
        ...anciens(a),
      ]);
    if (a.type === 'etoile')
      return void faire({ type: 'placer', qui: quiDeMembre(a.m), depuis: { uniteId: a.de.id, personId: a.m.id, zone: 'titre' }, vers: { zone: 'titre', uniteId: a.vers.id } });
    // Un poste change d'entité : le même dans l'autre (avec ses titulaires : un poste à plusieurs, toutes ses places), puis
    // il quitte la sienne (une place déjà partie avec son titulaire : rien à supprimer).
    void faire([
      ...a.places.map(
        (x): OpOrga =>
          x.titulaire
            ? { type: 'placer', qui: quiDeMembre(x.titulaire), depuis: { uniteId: a.de.id, personId: x.titulaire.id, zone: 'poste', posteId: x.posteId }, vers: { zone: 'nouveau', uniteId: a.vers.id, nom: a.nom } }
            : { type: 'nouveauPoste', uniteId: a.vers.id, nom: a.nom },
      ),
      ...a.places.map((x): OpOrga => ({ type: 'supprimerPoste', uniteId: a.de.id, posteId: x.posteId })),
    ]);
  };
  const editionLignes: EditionLignes | undefined =
    edition && orga
      ? {
          peut: peutAction,
          executer,
          peutFiche: (id) => peutFiche(uniteDe(id)),
          onPoste: (uniteId, posteId) => setPosteOuvert({ uniteId, posteId }),
          onNouveauPoste: (uniteId) => setNommer({ uniteId }),
          onNouveauComite: club.canManage ? () => setEdit({ type: 'sous-comite' }) : undefined,
          modifier: (id) => {
            const u = uniteDe(id);
            return u && !u.archive && (club.canManage || u.moiAdmin) ? () => setEdit({ unit: u }) : undefined;
          },
          glisser,
        }
      : undefined;
  // Fiches des entités archivées (lecture seule ; ⚙️ en mode « Modifier »).
  const vue: OrgaVue = { edition: false, peut: peutFiche, glisser, onPoste: () => {}, onNouveauPoste: () => {}, deplies, deplier };
  const vueAnnee: OrgaVue | undefined = photoUnits && { edition: false, peut: () => false, glisser, onPoste: () => {}, onNouveauPoste: () => {}, deplies, deplier, units: photoUnits };
  const choixAnnee = annees.length > 0 && !edition && (
    <label className="org-annee-choix" title="Organigramme d’une année passée (lecture seule)">
      <span aria-hidden="true">📅</span>
      <select
        aria-label="Année de l’organigramme"
        value={annee ?? ''}
        onChange={(e) => {
          setAnnee(e.target.value ? Number(e.target.value) : null);
          setFiche(null);
          setLien(null);
          setFait(null);
        }}
      >
        <option value="">Aujourd’hui</option>
        {annees.map((a) => (
          <option key={a.annee} value={a.annee}>
            {a.annee}
          </option>
        ))}
      </select>
    </label>
  );
  const candidats = useCandidats(units, edition);
  // Chercher une personne à placer, celle qu'on a en main (dans l'organigramme par postes : aussi en plein écran).
  const barre = edition && orga && (
    <div className="orga-barre">
      <Recherche q={q} setQ={setQ} candidats={candidats} glisser={glisser} />
      <EnMain glisser={glisser} onRetirer={(p) => p.depuis && void faire({ type: 'placer', qui: p.qui, depuis: p.depuis, vers: { zone: 'corbeille' } })} />
    </div>
  );
  // Entité dont on est admin (autre que l'ouverte) : on l'ouvre pour y ajouter ou modifier quelqu'un.
  const admin = (u: OrgUnit) => u.id !== club.current.id && u.moiAdmin && club.mine.some((x) => x.id === u.id);
  const actions = (u: OrgUnit): ActionsFiche => {
    const ouverte = u.id === club.current.id;
    return {
      onPersonne: (m) => setFiche({ unitId: u.id, personId: m.id }),
      onLien: (id) => setLien({ unitId: u.id, id }),
      ouvrir: ouverte || !u.moi ? undefined : { label: 'Ouvrir', aide: `Ouvrir « ${u.nom} »`, go: () => club.switchUnit(u.id) },
      onModifier: edition && (club.canManage || u.moiAdmin) ? () => setEdit({ unit: u }) : undefined,
    };
  };
  const ficheUnit = fiche && units.find((u) => u.id === fiche.unitId);
  const lienUnit = lien && units.find((u) => u.id === lien.unitId);
  const ficheMembre = ficheUnit?.membres.find((m) => m.id === fiche?.personId);

  return (
    <div>
      <div className="page-head">
        <h1>🏛️ Organigramme du club</h1>
        {edition ? (
          <div className="row wrap">
            {club.canManage && <button className="btn" onClick={() => setEdit({})}>+ Nouvelle entité</button>}
            <button className="btn primary" onClick={() => setModeModifier(false)}><Icone n="ok" /> Terminer</button>
          </div>
        ) : (
          (choixAnnee || peutModifier) && (
            <div className="row wrap">
              {choixAnnee}
              {peutModifier && !photo && <button className="btn" onClick={() => setModeModifier(true)}><Icone n="modifier" /> Modifier l’organigramme</button>}
            </div>
          )
        )}
      </div>
      {photo && photoUnits && vueAnnee ? (
        <OrgAnnee photo={photo} units={photoUnits} vue={vueAnnee} onRetour={() => setAnnee(null)} />
      ) : (
        <>
      {edition ? (
        <p className="org-edition">
          <b>✏️ Modification</b>
          <span>Glisse une carte (un poste, un groupe, un événement) sur un comité, un groupe ou une autre carte : ce qui se passera s’affiche avant de la lâcher. Au doigt, ou sans glisser : sa poignée ⠿ › « Déplacer… ».</span>
          <span>Un groupe glissé dans un autre comité : son responsable y siège (poste lié ⛓) ; dans « Sans comité » : il ne siège dans aucun. Un événement glissé sur un groupe : un poste du groupe lui est lié (il l’organise) ; sur un poste d’un comité : ce poste lui est lié ; dans le cadre d’un comité : il en dépend, tout le comité en est responsable. Le comité dont dépend un groupe ou un événement (ses tâches, son ordre du jour) se choisit dans ⚙️ « Dépend de ». Dans son cadre, une carte se range.</span>
          <span>Pour changer quelqu’un de poste : glisse son nom sur l’autre poste, un ★ ou des bénévoles (Ctrl : il garde aussi le sien ; sur un cadre : un nouveau poste). Sur un poste déjà occupé : « ＋ Avec … » (plusieurs personnes au même poste) ou « À la place de … ». Au doigt : touche son nom › « ✋ Déplacer ». Quelqu’un d’autre : cherche-le en haut à gauche.</span>
          <span>« ＋ Poste » dans un comité, un groupe ou un événement ; un clic sur le nom d’un poste : le renommer, le libérer, le supprimer.</span>
        </p>
      ) : (
        <p className="muted small-note">Une carte par poste : les comités en haut (avec les groupes dont le responsable y siège), les groupes en dessous, puis les événements. Clique sur un nom pour voir le profil de la personne.</p>
      )}
      {club.error && <p className="error small-note">{club.error}</p>}
      <OrgLignes units={active} onFiche={(m, uniteId) => setFiche({ unitId: uniteId, personId: m.id })} ouvrir={(u) => actions(u).ouvrir} edition={editionLignes} barre={barre} />
      <LegendePostes />
      {archived.length > 0 && (
        <details className="org-archives">
          <summary><Icone n="archives" /> Entités archivées ({archived.length})</summary>
          <div className="arbre-archives">
            {archived.map((u) => (
              <Fiche key={u.id} u={u} o={vue} a={actions(u)} />
            ))}
          </div>
        </details>
      )}
        </>
      )}

      {fiche && ficheUnit && ficheUnit.id === club.current.id && <FichePersonne id={fiche.personId} onClose={() => setFiche(null)} />}
      {fiche && ficheUnit && ficheMembre && ficheUnit.id !== club.current.id && (
        <FicheMembre
          u={ficheUnit}
          m={ficheMembre}
          onModifier={admin(ficheUnit) ? () => club.switchUnit(ficheUnit.id, `#/organigramme?entite=${ficheUnit.id}&personne=${ficheMembre.id}${edition ? '&modifier' : ''}`) : undefined}
          onClose={() => setFiche(null)}
        />
      )}
      {edit && (
        <UnitModal
          unit={edit.unit}
          typeDepart={edit.type}
          onClose={() => setEdit(null)}
          onCreated={(c, n) => {
            setEdit(null);
            setCreated({ c, n });
            club.refresh();
          }}
        />
      )}
      {created && <Created {...created} onClose={() => setCreated(null)} />}
      {lien && lienUnit && (
        <LienModal
          u={lienUnit}
          id={lien.id}
          onPersonne={(m) => {
            setLien(null);
            setFiche({ unitId: lienUnit.id, personId: m.id });
          }}
          onModifier={admin(lienUnit) ? () => club.switchUnit(lienUnit.id, `#/organigramme?entite=${lienUnit.id}&lien=${lien.id}${edition ? '&modifier' : ''}`) : undefined}
          onClose={() => setLien(null)}
        />
      )}
      {nommer && uniteDe(nommer.uniteId) && (
        <NomPosteModal
          u={uniteDe(nommer.uniteId)!}
          qui={nommer.prise?.nom}
          defaut={nommer.prise?.poste}
          onOk={(nom) =>
            faire(
              nommer.prise
                ? { type: 'placer', qui: nommer.prise.qui, depuis: nommer.prise.depuis, vers: { zone: 'nouveau', uniteId: nommer.uniteId, nom } }
                : { type: 'nouveauPoste', uniteId: nommer.uniteId, nom },
            )
          }
          onClose={() => setNommer(null)}
        />
      )}
      {avec && (() => {
        const u = uniteDe(avec.uniteId);
        const poste = u?.postes?.find((x) => x.id === avec.posteId);
        const { prise } = avec;
        return u && poste ? (
          <AvecModal
            u={u}
            poste={poste}
            nom={prise.nom}
            onAvec={() => {
              setAvec(null);
              void faire({ type: 'placer', qui: prise.qui, depuis: prise.depuis, vers: { zone: 'avec', uniteId: u.id, posteId: poste.id } });
            }}
            onPlace={(posteId) => {
              setAvec(null);
              void faire({ type: 'placer', qui: prise.qui, depuis: prise.depuis, vers: { zone: 'poste', uniteId: u.id, posteId } });
            }}
            onClose={() => setAvec(null)}
          />
        ) : null;
      })()}
      {posteOuvert && (() => {
        const u = uniteDe(posteOuvert.uniteId);
        const poste = u?.postes?.find((x) => x.id === posteOuvert.posteId);
        return u && poste ? (
          <PosteModal
            u={u}
            poste={poste}
            units={units}
            faire={faire}
            onPersonne={(m) => {
              setPosteOuvert(null);
              setFiche({ unitId: u.id, personId: m.id });
            }}
            onClose={() => setPosteOuvert(null)}
          />
        ) : null;
      })()}
      {fait && (
        <div className={`toast orga-fait ${fait.erreur ? 'erreur' : ''}`} role="status">
          <span>{fait.message}</span>
          {fait.annuler && (
            <button type="button" className="btn small" onClick={() => void fait.annuler!()}>
              <Icone n="annuler" /> Annuler
            </button>
          )}
          <button type="button" className="orga-fait-x" aria-label="Fermer" onClick={() => setFait(null)}>×</button>
        </div>
      )}
      {glisser.volant}
    </div>
  );
}

/**
 * Organigramme d'une année passée, tel qu'à sa dernière photo : en lecture seule, rien à ouvrir ni à modifier.
 * Un clic sur une personne : ses fonctions cette année-là ; sur « 👥 » : les membres venus de l'autre entité.
 */
function OrgAnnee({ photo, units, vue, onRetour }: { photo: OrganigrammeAnnuel; units: OrgUnit[]; vue: OrgaVue; onRetour: () => void }) {
  const [qui, setQui] = useState<OrgMember | null>(null);
  const [groupe, setGroupe] = useState<{ u: OrgUnit; id: string } | null>(null);
  const actives = units.filter((u) => !u.archive);
  const archivees = units.filter((u) => u.archive);
  const actions = (u: OrgUnit): ActionsFiche => ({ onPersonne: setQui, onLien: (id) => setGroupe({ u, id }) });
  const g = groupe && groupesLies(groupe.u, units).find((x) => x.id === groupe.id);
  return (
    <>
      <p className="org-annee">
        <span>
          <b>📅 Organigramme {photo.annee}</b> · tel qu’au {fmtDate(photo.maj)} · lecture seule
        </span>
        <button type="button" className="btn small" onClick={onRetour}>
          Revenir à aujourd’hui
        </button>
      </p>
      <OrgLignes key={photo.annee} units={actives} note={`Organigramme ${photo.annee}, en lecture seule.`} titre={`Organigramme ${photo.annee}`} />
      <LegendePostes />
      {archivees.length > 0 && (
        <details className="org-archives">
          <summary><Icone n="archives" /> Entités archivées ({archivees.length})</summary>
          <div className="arbre-archives">
            {archivees.map((u) => (
              <Fiche key={u.id} u={u} o={vue} a={actions(u)} />
            ))}
          </div>
        </details>
      )}
      {qui && <FonctionsAnnee annee={photo.annee} units={units} m={qui} onClose={() => setQui(null)} />}
      {groupe && (
        <Modal title={`👥 ${g?.unite?.nom ?? 'Entité supprimée'} dans « ${groupe.u.nom} » (${photo.annee})`} onClose={() => setGroupe(null)}>
          <div className="login-list lien-membres">
            {g?.membres.map((m) => (
              <button
                key={m.id}
                type="button"
                className="login-user"
                onClick={() => {
                  setGroupe(null);
                  setQui(m);
                }}
              >
                <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={32} />
                <span>
                  <strong>{nomMembre(m) || m.poste}</strong>
                  <small>{[m.poste, m.autresPostes].filter(Boolean).join(' · ')}</small>
                </span>
              </button>
            ))}
            {!g?.membres.length && <p className="muted">Aucun membre venu de cette entité cette année-là.</p>}
          </div>
          <div className="modal-foot">
            <span className="grow" />
            <button className="btn" onClick={() => setGroupe(null)}>Fermer</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Légende de l'organigramme par postes. */
function LegendePostes() {
  return (
    <p className="arbre-legende muted small-note">
      <span>★ titre de la fiche (président, responsable)</span>
      <span><span className="legende-trait" aria-hidden="true" /> trait de la couleur du comité ou du groupe d’où il part</span>
      <span><span className="error">rouge</span> : poste à pourvoir</span>
      <span>▷ bénévoles (membres d’un groupe) : les afficher</span>
      <span>− / + : replier, déplier une branche</span>
    </p>
  );
}

/** Une personne dans l'organigramme d'une année passée : ses fonctions dans chaque entité (fiche du registre, sinon même nom). */
function FonctionsAnnee({ annee, units, m, onClose }: { annee: number; units: OrgUnit[]; m: OrgMember; onClose: () => void }) {
  const meme = (x: OrgMember) => (m.membreId && x.membreId ? x.membreId === m.membreId : norm(nomDe(x)) === norm(nomDe(m)));
  const lignes = units.flatMap((u) => u.membres.filter(meme).map((x) => ({ u, x })));
  return (
    <Modal title={nomDe(m)} onClose={onClose}>
      <p className="muted small-note">Organigramme {annee}, en lecture seule.</p>
      <ul className="annee-fonctions">
        {lignes.map(({ u, x }) => {
          const t = UNIT_TYPES[u.type];
          const postes = (u.postes ?? []).filter((p) => p.titulaire === x.id).map((p) => p.nom);
          const titre = x.admin ? `★ ${x.poste || t.chef}` : '';
          const autres = (postes.length ? postes : fonctionsDe(x)).filter((f) => !x.admin || norm(f) !== norm(x.poste || t.chef));
          return (
            <li key={`${u.id}|${x.id}`}>
              <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icon={t.icon} />
              <span>
                <b>{u.nom}</b>
                {[titre, ...autres].filter(Boolean).length > 0 && <> · {[titre, ...autres].filter(Boolean).join(', ')}</>}
                {u.archive && <small className="muted"> (archivée)</small>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

// Organigramme à glisser-déposer : fiches dont les bénévoles sont dépliés (sur cet appareil).
const DEPLIES = 'taches-gsa-orga-deplies';

const fromDirectory = (e: DirectoryEntry, poste: string): NewMember => ({ prenom: e.prenom, nom: e.nom, email: e.email, telephone: e.telephone, couleur: e.couleur, poste });

/** Postes de départ d'un nouveau comité (son président est le ★ choisi à la création). */
const POSTES_COMITE = ['Secrétaire', 'Caissier'];

function UnitModal({
  unit,
  typeDepart,
  onClose,
  onCreated,
}: {
  unit?: OrgUnit;
  typeDepart?: UnitType;
  onClose: () => void;
  onCreated: (c: CreatedUnit, n: NewUnit) => void;
}) {
  const club = useClub();
  const isNew = !unit;
  const isCentral = unit?.type === 'central';
  // Type et archivage : réservés au comité central.
  const manage = club.canManage && !isCentral;
  const [nom, setNom] = useState(unit?.nom ?? '');
  const [type, setType] = useState<UnitType>(unit?.type ?? typeDepart ?? 'sous-comite');
  const [couleur, setCouleur] = useState(unit?.couleur ?? UNIT_COLORS[club.units.length % UNIT_COLORS.length]);
  const [date, setDate] = useState(unit?.date ?? '');
  const [dateFin, setDateFin] = useState(unit?.dateFin ?? '');
  const [description, setDescription] = useState(unit?.description ?? '');
  const [archive, setArchive] = useState(!!unit?.archive);
  const [supprimer, setSupprimer] = useState(false);
  const [logo, setLogo] = useState(unit?.logo);
  // « Dépend de » : un comité (le groupe qui organise un événement : un de ses postes lui est lié ⛓, dans l'organigramme) ;
  // pas elle-même, ni un comité qui dépend d'elle. C'est là que vont ses tâches (selon son réglage), et le trait de l'organigramme.
  const actives = club.units.filter((u) => !u.archive);
  const centralUnit = actives.find((u) => u.type === 'central');
  const exclus = unit ? [unit.id, ...sousEntites(actives, unit.id)] : [];
  const possibles = actives.filter((u) => !exclus.includes(u.id) && (u.type === 'central' || u.type === 'sous-comite'));
  const [dependInitial] = useState(() => (unit ? parentDans(actives, unit)?.id : undefined) ?? centralUnit?.id ?? '');
  const [dependDe, setDependDe] = useState(dependInitial);
  // Plus proposé (ex. archivé entre-temps) : le comité central.
  const dependChoisi = possibles.some((u) => u.id === dependDe) ? dependDe : (centralUnit?.id ?? '');
  // Ses tâches dans l'entité dont elle dépend : réglé par ses admins (ou ceux du comité central).
  const reglerTaches = !!unit && !isCentral && (club.canManage || unit.moiAdmin);
  const [taches, setTaches] = useState<TachesDependance>(unit?.tachesDependance ?? 'partagees');
  const nomParent = actives.find((u) => u.id === dependChoisi)?.nom ?? 'Comité central';
  // Un événement auquel aucun poste n'est lié ⛓ : tout le comité en est responsable, toutes ses tâches y sont affichées.
  const comiteEntier = !!unit && auComiteEntier(club.units, unit);
  // Dépendances passées (tenues par le serveur) : le comité actuel lit et copie les anciennes tâches, sauf droit retiré.
  const historique = unit?.historiqueDependance ?? [];
  const derniere = historique[historique.length - 1];
  const [copie, setCopie] = useState(derniere?.copie ?? true);
  const nomActuel = actives.find((u) => u.id === dependInitial)?.nom ?? 'Comité central';
  const dir = useMemo(() => directory(club.units.filter((u) => !u.archive)), [club.units]);
  const [chefKey, setChefKey] = useState('');
  const [chefNew, setChefNew] = useState({ prenom: '', nom: '', email: '' });
  const [chefPoste, setChefPoste] = useState('');
  const [membres, setMembres] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const info = UNIT_TYPES[type];

  const submit = async () => {
    setErr('');
    if (!nom.trim()) return setErr('Donne un nom à l’entité.');
    if (dated(type) && dateFin && (!date || dateFin < date)) return setErr('Le dernier jour de l’événement ne peut pas précéder le premier.');
    const jour = dated(type) && date ? date : undefined;
    const base: Partial<Unit> = { nom: nom.trim(), couleur, description: description.trim() || undefined, date: jour, dateFin: jour && dateFin > jour ? dateFin : undefined };
    // Nouveau : le choix (rien pour le comité central) ; pas changé : tel quel (une valeur d'avant qui ne vaut plus : le choix).
    const choix = dependChoisi;
    const garder = !isNew && choix === dependInitial && (!unit.dependDe || possibles.some((u) => u.id === unit.dependDe));
    const lien = isNew ? (choix && choix !== centralUnit?.id ? choix : undefined) : garder ? unit.dependDe : choix || undefined;
    setBusy(true);
    try {
      if (isNew) {
        const entry = dir.find((e) => e.key === chefKey);
        const poste = chefPoste.trim() || info.chef;
        const chef: NewMember | null = chefKey === 'new' ? { ...chefNew, prenom: chefNew.prenom.trim(), nom: chefNew.nom.trim(), email: chefNew.email.trim(), couleur, poste } : entry ? fromDirectory(entry, poste) : null;
        if (!chef) throw new Error(`Choisis le ${info.chef.toLowerCase()} de l’entité.`);
        if (!chef.prenom) throw new Error(`Indique le prénom du ${info.chef.toLowerCase()}.`);
        if (!EMAIL.test(chef.email)) throw new Error(`Il faut une adresse email valable pour le ${info.chef.toLowerCase()} : c’est elle qui lui donne accès.`);
        const n: NewUnit = {
          ...(base as Pick<Unit, 'nom' | 'couleur' | 'description' | 'date' | 'dateFin'>),
          type,
          dependDe: lien,
          chef,
          postes: type === 'sous-comite' && club.organiser ? POSTES_COMITE : undefined,
          membres: membres.map((k) => dir.find((e) => e.key === k)).filter((e): e is DirectoryEntry => !!e && e.key !== chefKey).map((e) => fromDirectory(e, '')),
        };
        onCreated(await club.createUnit(n), n);
      } else {
        const image = logo !== unit.logo ? { logo } : {};
        const reglage = reglerTaches && !comiteEntier ? { tachesDependance: taches === 'partagees' ? undefined : taches } : {};
        const droit = reglerTaches && derniere && copie !== derniere.copie ? { historiqueDependance: historique.map((p) => (p === derniere ? { ...p, copie } : p)) } : {};
        await club.updateUnit(unit.id, manage ? { ...base, type, archive, dependDe: lien, ...image, ...reglage, ...droit } : { ...base, ...image, ...reglage, ...droit });
        onClose();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addable = dir.filter((e) => e.key !== chefKey && !membres.includes(e.key));
  return (
    <Modal title={isNew ? 'Nouvelle entité du club' : `Modifier « ${unit.nom} »`} onClose={onClose} wide>
      <div className="form">
        <label className="full">
          Nom
          <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. CO Bruntrutaine, École de cyclisme, Souper de soutien…" />
        </label>
        {!isCentral && (
          <label>
            Type
            <select value={type} disabled={!isNew && !manage} onChange={(e) => setType(e.target.value as UnitType)}>
              {SUB_TYPES.map((t) => <option key={t} value={t}>{UNIT_TYPES[t].icon} {UNIT_TYPES[t].label}</option>)}
            </select>
          </label>
        )}
        {!isCentral && (isNew || manage) && possibles.length > 1 && (
          <label>
            Dépend de <small className="muted">(un comité)</small>
            <select value={dependChoisi} onChange={(e) => setDependDe(e.target.value)}>
              {possibles.map((u) => <option key={u.id} value={u.id}>{UNIT_TYPES[u.type].icon} {u.nom}</option>)}
            </select>
          </label>
        )}
        {!isNew && !isCentral && dependChoisi !== dependInitial && (
          <p className="full muted small-note">
            Changement de dépendance : rien n’est déplacé ni copié. Ses tâches restent chez elle ; « {nomActuel} » garde celles d’avant le
            changement (ses ordres du jour, PV et paiements aussi) ; « {nomParent} » pourra les consulter et en copier (📜 Anciennes tâches), sans les modifier.
            Ses tickets iront à la caisse de « {nomParent} » si elle a un caissier, sinon à la caisse centrale.
          </p>
        )}
        {reglerTaches && comiteEntier && (
          <p className="full muted small-note">
            Toutes ses tâches s’affichent dans « {nomParent} » (liste des tâches, ordre du jour, PV) : aucun poste ne lui est lié ⛓, tout le comité en est
            responsable. Dans l’organigramme, glisse-le sous un poste ou un groupe pour régler ce qu’il y affiche.
          </p>
        )}
        {reglerTaches && !comiteEntier && (
          <label className="full">
            Ses tâches dans « {nomParent} » <small className="muted">(liste des tâches, ordre du jour, PV)</small>
            <select value={taches} onChange={(e) => setTaches(e.target.value as TachesDependance)}>
              {(Object.keys(TACHES_DEPENDANCE) as TachesDependance[]).map((k) => (
                <option key={k} value={k}>
                  {TACHES_DEPENDANCE[k].label}
                </option>
              ))}
            </select>
            <small className="muted">{TACHES_DEPENDANCE[taches].aide(nomParent)}</small>
          </label>
        )}
        {!isCentral && derniere && (
          <div className="full">
            <span className="field-label">Dépendances passées</span>
            <ul className="historique-dep">
              {[...historique].reverse().map((p) => (
                <li key={p.jusqua}>
                  « {p.nom || '?'} » jusqu’au {dateCourte(p.jusqua)} <small className="muted">· garde les tâches de cette période (réglage d’alors : {TACHES_DEPENDANCE[p.reglage].label.toLowerCase()})</small>
                </li>
              ))}
            </ul>
            {reglerTaches ? (
              <label className="check-inline">
                <input type="checkbox" checked={copie} onChange={(e) => setCopie(e.target.checked)} />
                « {nomActuel} » peut consulter et copier ses {derniere.taches.length} ancienne(s) tâche(s) (d’avant le {dateCourte(derniere.jusqua)})
              </label>
            ) : (
              <small className="muted">« {nomActuel} » {derniere.copie ? 'peut' : 'ne peut plus'} consulter et copier ses anciennes tâches (d’avant le {dateCourte(derniere.jusqua)}).</small>
            )}
            {reglerTaches && <small className="muted"> Les copies déjà faites restent. Le droit cesse de lui-même si l’entité change à nouveau de dépendance.</small>}
          </div>
        )}
        {dated(type) && (
          <>
            <label>
              Date de l’événement (prochaine édition)
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Dernier jour <small className="muted">(si plusieurs jours)</small>
              <input type="date" value={dateFin} min={date || undefined} onChange={(e) => setDateFin(e.target.value)} />
            </label>
          </>
        )}
        {!isCentral && <p className="full muted small-note">{info.aide}</p>}
        <div className="full">
          <span className="field-label">Couleur</span>
          <div className="swatches">
            {UNIT_COLORS.map((c) => (
              <button key={c} type="button" className={`swatch ${c === couleur ? 'on' : ''}`} style={{ background: c }} onClick={() => setCouleur(c)} aria-label={`Couleur ${c}`} />
            ))}
          </div>
        </div>
        {!isNew && (
          <div className="full">
            <span className="field-label">{isCentral ? 'Logo du club' : 'Logo (ex. celui de la manifestation)'}</span>
            <ImagePicker kind="logo" value={logo} onChange={setLogo} empty={isCentral ? 'Pas de logo : icône de l’appli' : 'Pas de logo : celui du club'} />
            <small className="muted">Affiché en haut de l’appli et sur l’ordre du jour et le PV ; il devient aussi l’icône de l’appli.</small>
          </div>
        )}
        <label className="full">
          Description
          <ZoneTexte rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ce que fait l’entité (facultatif)" />
        </label>

        {isNew && (
          <>
            <h2>{info.chef} (admin de l’entité)</h2>
            <label className="full">
              Personne
              <select value={chefKey} onChange={(e) => setChefKey(e.target.value)}>
                <option value="">— Choisir dans l’annuaire du club —</option>
                {dir.map((e) => (
                  <option key={e.key} value={e.key} disabled={!e.email}>
                    {e.prenom} {e.nom}{e.email ? ` · ${e.postes.map((p) => p.unit.nom).join(', ')}` : ' (pas d’adresse email)'}
                  </option>
                ))}
                <option value="new">+ Nouvelle personne</option>
              </select>
            </label>
            {chefKey === 'new' && (
              <>
                <label>Prénom<input value={chefNew.prenom} onChange={(e) => setChefNew({ ...chefNew, prenom: e.target.value })} /></label>
                <label>Nom<input value={chefNew.nom} onChange={(e) => setChefNew({ ...chefNew, nom: e.target.value })} /></label>
                <label className="full">Adresse email<input type="email" value={chefNew.email} onChange={(e) => setChefNew({ ...chefNew, email: e.target.value })} /></label>
              </>
            )}
            <label className="full">
              Poste
              <input value={chefPoste} onChange={(e) => setChefPoste(e.target.value)} placeholder={info.chef} />
            </label>
            {type === 'sous-comite' && club.organiser && (
              <p className="full muted small-note">Le comité est créé avec trois postes : {info.chef.toLowerCase()} (ci-dessus), {POSTES_COMITE.map((x) => x.toLowerCase()).join(' et ')} (à pourvoir).</p>
            )}
            <h2>Membres de départ</h2>
            <div className="full">
              <div className="chips">
                {membres.map((k) => {
                  const e = dir.find((x) => x.key === k);
                  return e ? (
                    <span key={k} className="chip on">
                      {e.prenom} {e.nom}
                      <button type="button" className="chip-x" onClick={() => setMembres(membres.filter((x) => x !== k))} aria-label="Retirer">✕</button>
                    </span>
                  ) : null;
                })}
              </div>
              <select value="" onChange={(e) => e.target.value && setMembres([...membres, e.target.value])}>
                <option value="">+ Ajouter une personne de l’annuaire…</option>
                {addable.map((e) => <option key={e.key} value={e.key}>{e.prenom} {e.nom}</option>)}
              </select>
              <p className="muted small-note">
                Facultatif : le {info.chef.toLowerCase()} pourra ajouter ensuite les autres membres, régler leurs rôles et créer leurs accès depuis l’organigramme (« ✏️ Modifier l’organigramme » : chercher la personne en haut à gauche ou « ＋ Nouvelle personne », puis la glisser sur un poste ; clic sur une personne : sa fiche).
              </p>
            </div>
          </>
        )}

        {!isNew && manage && (
          <label className="full inline">
            <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} />
            Archiver (événement passé) : l’entité disparaît des menus, ses données sont gardées.
          </label>
        )}
        {!isNew && manage && unit?.archive && (
          <div className="full zone-suppression">
            <button type="button" className="btn danger small" onClick={() => setSupprimer(true)}>
              <Icone n="supprimer" /> Supprimer définitivement…
            </button>
            <small className="muted"> Efface l’entité archivée et toutes ses données, sans retour possible.</small>
          </div>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : isNew ? 'Créer l’entité' : 'Enregistrer'}</button>
      </div>
      {supprimer && unit && <SupprimerEntite id={unit.id} nom={unit.nom} onClose={() => setSupprimer(false)} onFait={onClose} />}
    </Modal>
  );
}

/** Après la création : accès du président (version réelle) ou simple confirmation (démo). */
function Created({ c, n, onClose }: { c: CreatedUnit; n: NewUnit; onClose: () => void }) {
  const club = useClub();
  const chef = UNIT_TYPES[n.type].chef.toLowerCase();
  if (c.avertissement)
    return (
      <Modal title="Entité créée" onClose={onClose}>
        <p>« {n.nom} » est créé.</p>
        <p className="error">{c.avertissement}</p>
        <div className="modal-foot"><span className="grow" /><button className="btn primary" onClick={onClose}>Fermer</button></div>
      </Modal>
    );
  if (c.email)
    return <CredentialsModal person={n.chef} email={c.email} password={c.password} existant={c.existant} intro={`« ${n.nom} » est créé. ${n.chef.prenom} en est le ${chef} : voici son accès.`} onClose={onClose} />;
  const mine = club.units.find((u) => u.id === c.unitId)?.moi;
  return (
    <Modal title="Entité créée" onClose={onClose}>
      <p>
        « {n.nom} » est créé, avec {n.chef.prenom} {n.chef.nom} comme {chef}
        {n.membres.length > 0 && ` et ${n.membres.length} membre${n.membres.length > 1 ? 's' : ''}`}.
      </p>
      {getMode() === 'demo' && <p className="muted">Démo : pour y entrer, connecte-toi en tant que {n.chef.prenom} (« Changer » en haut à droite).</p>}
      <div className="modal-foot">
        <span className="grow" />
        {mine && <button className="btn" onClick={() => club.switchUnit(c.unitId)}>Ouvrir « {n.nom} »</button>}
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

/**
 * Ancien lien « tous les membres d'une entité » (remplacé par les dépendances, 030) : la liste de ceux qui en font
 * partie par ce lien (un clic ouvre leur fiche) ; ses admins peuvent le retirer.
 */
function LienModal({ u, id, onPersonne, onModifier, onClose }: { u: OrgUnit; id: string; onPersonne: (m: OrgMember) => void; onModifier?: () => void; onClose: () => void }) {
  const club = useClub();
  const { data, user, update } = useStore();
  const a = club.units.find((x) => x.id === id);
  const nomA = a?.nom ?? 'entité supprimée';
  const membres = u.membres.filter((m) => m.viaEntite === id);
  const ouverte = u.id === club.current.id;
  const lien = ouverte ? data.membresDe?.find((l) => l.uniteId === id) : undefined;
  const admin = ouverte && !!lien && !!user?.roles.includes(ADMIN_ROLE_ID);
  const retirer = () => {
    if (!confirm(`Retirer « ${nomA} » de « ${u.nom} » ? Ses membres qui ne font pas partie de « ${u.nom} » à titre personnel en sont retirés ; leurs tâches restent.`)) return;
    update((d) => {
      d.membresDe = (d.membresDe ?? []).filter((l) => l.uniteId !== id);
    }, `« ${nomA} » retiré des membres`);
    onClose();
  };
  return (
    <Modal title={`👥 Membres de « ${nomA} »`} onClose={onClose}>
      <p className="muted">
        Ancien lien : tous les membres de « {nomA} » font partie de « {u.nom} ». Ces liens sont remplacés par les dépendances : le comité dont
        « {u.nom} » dépend voit ses tâches selon son réglage (fiche de l’entité). Ajoute à « {u.nom} » ceux qui doivent en faire partie eux-mêmes.
      </p>
      <div className="login-list lien-membres">
        {membres.map((m) => (
          <button key={m.id} type="button" className="login-user" onClick={() => onPersonne(m)}>
            <Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={32} />
            <span>
              <strong>{nomMembre(m) || m.poste}</strong>
              <small>{[m.poste, m.autresPostes, m.roles.join(', ')].filter(Boolean).join(' · ')}</small>
            </span>
          </button>
        ))}
        {!membres.length && <p className="muted">Personne pour l’instant : ses membres font déjà partie de « {u.nom} » eux-mêmes, ou « {nomA} » n’a pas encore de membre.</p>}
      </div>
      <div className="modal-foot">
        {admin && <button className="btn danger" onClick={retirer}>Retirer « {nomA} »</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
        {onModifier && <button className="btn primary" onClick={onModifier}>Modifier dans « {u.nom} »</button>}
      </div>
    </Modal>
  );
}
