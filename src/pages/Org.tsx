import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClub, type CreatedUnit, type NewMember, type NewUnit } from '../data/club';
import { arbreEntites, CENTRAL_ACCESS, centralAccess, directory, orgMembers, parentDans, personKey, postesEntite, sousEntites, SUB_TYPES, UNIT_COLORS, UNIT_TYPES, visitLevel, type Branche, type DirectoryEntry } from '../data/units';
import type { CentralAccess, OrgMember, OrgUnit, Poste, Unit, UnitType } from '../data/types';
import { fmtRange } from '../data/utils';
import { Empty, Initials, Modal, UnitMark } from '../components/ui';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { groupesLies, roleDuLien } from '../data/liens';
import { nomMembre } from '../data/membres';
import { ImagePicker } from '../components/ImagePicker';
import { CredentialsModal } from '../components/Acces';
import { CentralAccessChoice } from '../components/CentralAccess';
import { FicheMembre, FichePersonne, NouvellePersonne } from '../components/Personnes';
import { bandeCables, CablagePanel, CablesOrganigramme, candidatDe, liensPostes, liensResponsables, margeCables, nomCandidat, ordreDesEntites, ResponsableModal, useCablable, useCandidats, useTirage, type Depart, type LienResponsable, type Source } from '../components/Cablage';
import { TraitsOrganigramme, useDisposition, type Deplacer } from '../components/Disposition';
import { coupure, EnMain, Fiche, lireCible, NomPosteModal, PosteModal, Postes, rangeesPostes, Recherche, useGlisser, type OrgaVue, type Prise } from '../components/Organiser';
import { benevolesDe, conflitLien, nomDe, type OpOrga } from '../data/organigramme';

// Organigramme du club : un arbre (comité central en haut), chaque entité reliée par un trait à celle dont elle dépend.
// Sous chaque entité, une ligne par personne (nom, puis ses fonctions) : un clic ouvre sa fiche.
// Par défaut une vue d'ensemble épurée ; « ✏️ Modifier l'organigramme » montre les outils ci-dessous (poignées,
// câblage, ⚙️, « + Ajouter une personne », disposition automatique).
// Une entité entière peut faire partie des membres d'une autre (ligne « 👥 », fenêtre LienModal) : ses membres suivent.
// « + Ajouter une personne » en bas de la liste (entité ouverte, ou entité dont on est admin : on l'ouvre d'abord).
// Un clic sur le nom d'une entité l'ouvre ; ⚙️ modifie sa fiche.
// Câbles : de la ligne du responsable (★) d'une entité dans son entité mère jusqu'à l'entité, toujours affichés.
// Disposition libre : les admins posent les cartes où ils veulent (en-tête à la souris, poignée au doigt) ;
// la place est enregistrée avec l'entité, la même pour tous (Disposition.tsx).
// Câblage (admins du comité central, ou d'une entité) : un câble tiré d'une personne jusqu'à une entité en fait
// le responsable ; « 🔌 Câbler » ajoute les poignées ● (doigt), les personnes du club qui ne sont dans aucune entité,
// et le choix sans glisser.
// Visible de tous les membres du club ; seul le comité central crée et modifie les entités,
// chaque président / responsable peut modifier la fiche de la sienne et choisir ce que le comité central
// peut faire de ses données (rien voir, consulter, ou aussi modifier / ajouter des tâches).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dated = (t: UnitType) => t === 'sous-comite' || t === 'equipe';

/** Ce qu'on peut faire depuis la carte d'une entité. */
interface Actions {
  onPersonne: (m: OrgMember) => void;
  /** Membres d'une autre entité qui en font tous partie (lien). */
  onLien: (id: string) => void;
  onAjouter?: () => void;
  ouvrir?: { label: string; aide: string; go: () => void };
  onModifier?: () => void;
  /** Organigramme câblé : lignes de personnes d'où tirer un câble, entité où le brancher. */
  cablage?: {
    onTirer: (e: ReactPointerEvent<HTMLElement>, m: OrgMember) => void;
    tireJuste: () => boolean;
    /** Mode « Câbler » : poignées ●, et un toucher choisit la personne au lieu d'ouvrir sa fiche. */
    mode: boolean;
    /** Clé de la personne choisie (personKey). */
    choisi?: string;
    onChoisir: (m: OrgMember) => void;
    cible?: { actif: boolean; survol: boolean; onDeposer: () => void; label: string };
  };
  /** Carte qu'on peut poser ailleurs sur l'organigramme (disposition libre). */
  deplacer?: Deplacer;
}

export function Org() {
  const club = useClub();
  const { data, can } = useStore();
  const [edit, setEdit] = useState<{ unit?: OrgUnit } | null>(null);
  const [created, setCreated] = useState<{ c: CreatedUnit; n: NewUnit } | null>(null);
  const [fiche, setFiche] = useState<{ unitId: string; personId: string } | null>(null);
  const [lien, setLien] = useState<{ unitId: string; id: string } | null>(null);
  const [ajout, setAjout] = useState(false);
  const peutAjouter = can('people.manage');
  // Mode « Modifier » : poignées, câblage, ⚙️ et « + Ajouter » ; sinon une vue d'ensemble épurée.
  const [modeModifier, setModeModifier] = useState(false);
  // Câblage : câble tiré (souris, doigt) ou personne choisie (sans glisser), fenêtre de confirmation.
  const cablable = useCablable();
  const [cablage, setCablage] = useState(false);
  const [choisi, setChoisi] = useState<Source | null>(null);
  const [depot, setDepot] = useState<{ u: OrgUnit; source: Source | null } | null>(null);
  // Arrivée depuis une autre entité (?entite=<entité>&ajouter=1 ou &personne=<fiche>, &modifier si on était en mode
  // « Modifier ») : ouvert une fois l'entité chargée.
  const [params, setParams] = useSearchParams();
  const entite = params.get('entite');
  useEffect(() => {
    if (!entite || entite !== club.current.id) return;
    const personne = params.get('personne');
    const lie = params.get('lien');
    const ajouter = params.has('ajouter');
    setParams({}, { replace: true });
    if (params.has('modifier') || (ajouter && peutAjouter)) setModeModifier(true);
    if (ajouter && peutAjouter) setAjout(true);
    if (personne) setFiche({ unitId: entite, personId: personne });
    if (lie) setLien({ unitId: entite, id: lie });
  }, [entite, club.current.id, params, peutAjouter, setParams]);
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

  // L'entité ouverte : ses membres tels qu'ils sont maintenant (modifications pas encore relues).
  const units = useMemo(
    () => club.units.map((u) => (u.id === club.current.id ? { ...u, membres: orgMembers(data), liens: data.membresDe?.map((l) => l.uniteId), postes: data.postes ?? u.postes } : u)),
    [club.units, club.current.id, data],
  );
  const active = units.filter((u) => !u.archive);
  const archived = units.filter((u) => u.archive);
  const peutCabler = active.some(cablable);
  const peutModifier = club.canManage || peutAjouter || peutCabler || units.some((u) => u.moiAdmin);
  const edition = modeModifier && peutModifier;
  const terminer = () => {
    setModeModifier(false);
    setCablage(false);
    setChoisi(null);
  };
  // Organigramme à glisser-déposer (démo) : fiches à trois zones, recherche en haut à gauche, postes liés.
  const orga = !!club.organiser;
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
  const [posteOuvert, setPosteOuvert] = useState<{ uniteId: string; posteId: string; lienPropose?: string } | null>(null);
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
  const glisser = useGlisser({
    peut: (p, c) => {
      const v = lireCible(c);
      if (p.depuis && !peutFiche(uniteDe(p.depuis.uniteId))) return false;
      if (v.zone === 'corbeille') return !!p.depuis;
      if (!peutFiche(uniteDe(v.uniteId))) return false;
      // Là où elle est déjà : rien à faire.
      const d = p.depuis;
      if (!d || d.uniteId !== v.uniteId) return true;
      if (v.zone === 'etoile') return !(d.zone === 'titre' && v.personId === d.personId);
      if (v.zone === 'poste') return !(d.zone === 'poste' && v.posteId === d.posteId) && !(d.zone === 'titre' && uniteDe(v.uniteId)?.postes?.find((x) => x.id === v.posteId)?.titulaire === d.personId);
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
        const m = po?.titulaire ? u.membres.find((x) => x.id === po.titulaire) : undefined;
        return `${po?.nom ?? 'Poste'}${m ? ` à la place de ${nomDe(m)}` : ''}`;
      }
      if (v.zone === 'nouveau') return `＋ Nouveau poste dans « ${u.nom} »`;
      const b = benevolesDe(u.type).un;
      return `${b[0].toUpperCase()}${b.slice(1)} de « ${u.nom} »`;
    },
    deposer: (p, c) => {
      const v = lireCible(c);
      if (p.cle) setQ('');
      if (v.zone === 'nouveau') return setNommer({ uniteId: v.uniteId, prise: p });
      void faire({ type: 'placer', qui: p.qui, depuis: p.depuis, vers: v });
    },
  });
  // ⛓ tiré d'un poste jusqu'à une autre fiche : le poste est lié à son ★ (si le poste et l'entité ont chacun quelqu'un : choisir).
  const lierDe = useRef('');
  const lierTirage = useTirage<{ u: OrgUnit; poste: Poste }>(
    (id, { u, poste }) => {
      if (conflitLien(units, u.id, poste.id, id)) setPosteOuvert({ uniteId: u.id, posteId: poste.id, lienPropose: id });
      else void faire({ type: 'lier', uniteId: u.id, posteId: poste.id, lien: id });
    },
    (id) => id !== lierDe.current && units.some((x) => x.id === id && !x.archive),
  );
  const vue: OrgaVue | undefined = orga
    ? {
        edition,
        peut: peutFiche,
        glisser,
        lier: {
          commencer: (e, u, poste) => {
            lierDe.current = u.id;
            lierTirage.commencer(e, () => ({ u, poste }));
          },
          tireJuste: lierTirage.tireJuste,
          survol: lierTirage.survol,
          tir: lierTirage.tir,
        },
        onPoste: (u, p) => setPosteOuvert({ uniteId: u.id, posteId: p.id }),
        onNouveauPoste: (u) => setNommer({ uniteId: u.id }),
        deplies,
        deplier,
      }
    : undefined;
  const candidats = useCandidats(units, cablage || !!depot || (orga && modeModifier));
  const cleChoisi = choisi && choisi !== 'nouvelle' ? choisi.key : undefined;
  const tirage = useTirage(
    (id, source) => {
      const u = units.find((x) => x.id === id);
      if (!u) return;
      setDepot({ u, source });
      setChoisi(null);
    },
    (id) => units.some((x) => x.id === id && cablable(x)),
  );
  // Entité dont on est admin (autre que l'ouverte) : on l'ouvre pour y ajouter ou modifier quelqu'un.
  const admin = (u: OrgUnit) => u.id !== club.current.id && u.moiAdmin && club.mine.some((x) => x.id === u.id);
  const actions = (u: OrgUnit): Actions => {
    const ouverte = u.id === club.current.id;
    const visit = !ouverte && visitLevel(u, club.central);
    return {
      onPersonne: (m) => setFiche({ unitId: u.id, personId: m.id }),
      onLien: (id) => setLien({ unitId: u.id, id }),
      onAjouter:
        !edition || u.archive ? undefined : ouverte ? (peutAjouter ? () => setAjout(true) : undefined) : admin(u) ? () => club.switchUnit(u.id, `#/organigramme?entite=${u.id}&ajouter=1`) : undefined,
      ouvrir:
        ouverte || (!u.moi && !visit)
          ? undefined
          : u.moi
            ? { label: 'Ouvrir', aide: `Ouvrir « ${u.nom} »`, go: () => club.switchUnit(u.id) }
            : { label: visit === 'lecture' ? '👁 Consulter' : '✏️ Ouvrir', aide: CENTRAL_ACCESS[visit as CentralAccess].aide, go: () => club.switchUnit(u.id) },
      onModifier: edition && (club.canManage || u.moiAdmin) ? () => setEdit({ unit: u }) : undefined,
      cablage: edition && peutCabler && !orga
        ? {
            onTirer: (e, m) => tirage.commencer(e, () => candidatDe(candidats, u, m)),
            tireJuste: tirage.tireJuste,
            mode: cablage,
            choisi: cleChoisi,
            onChoisir: (m) => {
              const c = candidatDe(candidats, u, m);
              setChoisi(cleChoisi === c.key ? null : c);
            },
            cible: cablable(u)
              ? {
                  actif: tirage.tir,
                  survol: tirage.survol === u.id,
                  onDeposer: () => {
                    setDepot({ u, source: choisi });
                    setChoisi(null);
                  },
                  label: choisi ? `★ ${choisi === 'nouvelle' ? 'Nouvelle personne' : nomCandidat(choisi)} : ${UNIT_TYPES[u.type].chef.toLowerCase()}` : `★ ${UNIT_TYPES[u.type].chef}…`,
                }
              : undefined,
          }
        : undefined,
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
            {peutCabler && !orga && (
              <button
                className={`btn ${cablage ? 'on' : ''}`}
                aria-pressed={cablage}
                title="Désigner le responsable d’une entité en y tirant un câble depuis une personne"
                onClick={() => {
                  setCablage(!cablage);
                  setChoisi(null);
                }}
              >
                🔌 Câbler
              </button>
            )}
            {club.canManage && <button className="btn" onClick={() => setEdit({})}>+ Nouvelle entité</button>}
            <button className="btn primary" onClick={terminer}>✓ Terminer</button>
          </div>
        ) : (
          peutModifier && <button className="btn" onClick={() => setModeModifier(true)}>✏️ Modifier l’organigramme</button>
        )}
      </div>
      {edition && orga ? (
        <p className="org-edition">
          <b>✏️ Modification</b>
          <span>Glisse une personne sur le titre d’une fiche (★), sur un poste ou dans ses bénévoles (au doigt : par sa poignée ⠿, ou touche-la puis touche la zone).</span>
          <span>Pour placer quelqu’un d’autre : cherche-le en haut à gauche.</span>
          <span>Tire le ⛓ d’un poste jusqu’à une autre fiche : il sera lié à son ★ (un clic sur ⛓ : nom, lien ou suppression du poste).</span>
          {active.some((u) => club.canManage || u.moiAdmin) && <span>Déplace une carte en la tirant par son nom.</span>}
        </p>
      ) : edition ? (
        <p className="org-edition">
          <b>✏️ Modification</b>
          {active.some((u) => club.canManage || u.moiAdmin) && <span>Déplace une carte en la tirant par son nom (au doigt : par sa poignée en haut).</span>}
          {peutCabler && !cablage && <span>Tire une personne jusqu’à une entité pour en faire le responsable (★).</span>}
          {units.some((u) => club.canManage || u.moiAdmin) ? <span>⚙️ modifie l’entité.</span> : peutAjouter && <span>« + Ajouter une personne » sous l’entité.</span>}
        </p>
      ) : (
        <p className="muted small-note">Clique sur une personne pour voir sa fiche, sur le nom d’une entité pour l’ouvrir.</p>
      )}
      {club.error && <p className="error small-note">{club.error}</p>}
      {edition && orga && (
        <div className="orga-barre">
          <Recherche q={q} setQ={setQ} candidats={candidats} glisser={glisser} />
          <EnMain glisser={glisser} onRetirer={(p) => p.depuis && void faire({ type: 'placer', qui: p.qui, depuis: p.depuis, vers: { zone: 'corbeille' } })} />
        </div>
      )}
      {cablage && (
        <CablagePanel
          candidats={candidats}
          choisi={choisi}
          onChoisir={setChoisi}
          onTirer={(e, s) => tirage.commencer(e, () => s)}
          tireJuste={tirage.tireJuste}
          onFin={() => {
            setCablage(false);
            setChoisi(null);
          }}
        />
      )}
      {active.length ? <Arbre units={active} actions={actions} edition={edition} orga={vue} /> : <Empty>Aucune entité.</Empty>}
      {vue ? (
        <p className="arbre-legende muted small-note">
          <span>★ titre de la fiche (président, responsable)</span>
          <span><span className="legende-cable" aria-hidden="true" /> ⛓ poste lié au ★ d’une autre entité : changer l’un change l’autre</span>
          <span><span className="error">rouge</span> : poste à pourvoir</span>
          <span title={CENTRAL_ACCESS.lecture.aide}>👁 / ✏️ le comité central peut consulter / modifier ses tâches</span>
        </p>
      ) : (
        <p className="arbre-legende muted small-note">
          <span>★ responsable</span>
          <span><span className="legende-cable" aria-hidden="true" /> câble : du responsable, dans l’entité mère</span>
          <span title={CENTRAL_ACCESS.lecture.aide}>👁 / ✏️ le comité central peut consulter / modifier ses tâches</span>
        </p>
      )}
      {archived.length > 0 && (
        <details className="org-archives">
          <summary>🗄️ Entités archivées ({archived.length})</summary>
          <div className="arbre-archives">
            {archived.map((u) => (vue ? <Fiche key={u.id} u={u} o={{ ...vue, edition: false }} a={actions(u)} /> : <Noeud key={u.id} u={u} {...actions(u)} />))}
          </div>
        </details>
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
      {ajout && <NouvellePersonne onClose={() => setAjout(false)} />}
      {depot && <ResponsableModal u={depot.u} source={depot.source} candidats={candidats} onClose={() => setDepot(null)} />}
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
      {posteOuvert && (() => {
        const u = uniteDe(posteOuvert.uniteId);
        const poste = u?.postes?.find((x) => x.id === posteOuvert.posteId);
        return u && poste ? (
          <PosteModal
            u={u}
            poste={poste}
            units={units}
            lienPropose={posteOuvert.lienPropose}
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
              ↶ Annuler
            </button>
          )}
          <button type="button" className="orga-fait-x" aria-label="Fermer" onClick={() => setFait(null)}>×</button>
        </div>
      )}
      {tirage.volant}
      {glisser.volant}
      {lierTirage.volant}
    </div>
  );
}

// Organigramme à glisser-déposer : fiches dont les bénévoles sont dépliés (sur cet appareil).
const DEPLIES = 'taches-gsa-orga-deplies';

// Largeur d'une colonne de l'arbre (carte + marges) : en dessous, l'arbre se présente de haut en bas, décalé à droite.
const COLONNE = 240;
// Une carte d'au moins tant de lignes s'élargit sur deux colonnes (de haut en bas).
const GRANDE = 10;

/** Lignes de la carte d'une entité : une par personne (fonctions groupées), une par entité membre. */
function lignesDe(u: OrgUnit, units: OrgUnit[]) {
  const t = UNIT_TYPES[u.type];
  // Membres venus d'une autre entité : regroupés sur sa ligne « 👥 », sauf s'ils ont une fonction dans celle-ci.
  const lignes = postesEntite(u.membres.filter((m) => !m.viaEntite || m.admin || m.poste || m.autresPostes), t.chef);
  const groupes = groupesLies(u, units);
  // Les rangées affichées, dans l'ordre : clé (celle de data-ligne) et texte (pour partager une grande carte en deux).
  const rangees = [
    ...(lignes.some((l) => l.chef) ? [] : [{ cle: '', texte: `★ ${t.chef} : à désigner` }]),
    ...lignes.map((l) => ({ cle: l.m.id, texte: `${l.chef ? '★ ' : ''}${l.nom}${l.postes ? ` · ${l.postes}` : ''}` })),
    ...groupes.map((g) => ({ cle: `lien:${g.id}`, texte: `👥 ${g.unite?.nom ?? 'Entité supprimée'} · ${g.membres.length} membres` })),
  ];
  return { lignes, groupes, rangees };
}

/** Rang, dans l'entité mère, de la ligne d'où part un câble (sinon -1). */
const rangDuLien = (l: LienResponsable, rangees: { cle: string }[]) => {
  const i = rangees.findIndex((r) => r.cle === l.ligne);
  return i >= 0 ? i : rangees.findIndex((r) => r.cle === `lien:${l.lien}`);
};

/**
 * L'arbre : de haut en bas comme un arbre généalogique, ou en liste décalée (téléphone, ou trop d'entités côte à côte).
 * De haut en bas, les cartes posées à la main sont à leur place (disposition libre) ; en mode « Modifier », on les déplace.
 */
function Arbre({ units, actions, edition, orga }: { units: OrgUnit[]; actions: (u: OrgUnit) => Actions; edition: boolean; orga?: OrgaVue }) {
  const club = useClub();
  const racines = useMemo(() => arbreEntites(units), [units]);
  const cadre = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return;
    setLargeur(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Fiches à trois zones (orga) : les rangées sont les postes ; sinon une par personne.
  const rangees = useMemo(() => new Map(units.map((u) => [u.id, orga ? rangeesPostes(u) : lignesDe(u, units).rangees])), [units, orga]);
  const grandes = useMemo(() => new Set(units.filter((u) => (rangees.get(u.id)?.length ?? 0) >= GRANDE).map((u) => u.id)), [units, rangees]);
  // Colonnes qu'il faut côte à côte : une par carte du bas (deux pour une grande carte).
  const colonnes = (b: Branche<OrgUnit>): number => Math.max(grandes.has(b.u.id) ? 2 : 1, b.enfants.reduce((n, x) => n + colonnes(x), 0));
  const vertical = largeur < racines.reduce((n, b) => n + colonnes(b), 0) * COLONNE;
  // Câbles : du responsable dans l'entité mère jusqu'à l'entité, dessinés sur le plan de l'arbre.
  const plan = useRef<HTMLDivElement>(null);
  const arbre = useRef<HTMLUListElement>(null);
  // Fiches à trois zones : du poste lié jusqu'à l'entité dont son titulaire est le ★.
  const liens = useMemo(() => (orga ? liensPostes(units) : liensResponsables(units)), [units, orga]);
  // Sous chaque entité mère : une bande pour ses câbles vers les entités en dessous (un niveau chacun) avant la barre de l'arbre.
  const bandes = useMemo(() => {
    const n = new Map<string, number>();
    const dessous = new Map<string, Set<string>>();
    for (const l of liens) {
      if (!dessous.has(l.de)) dessous.set(l.de, new Set(sousEntites(units, l.de)));
      if (dessous.get(l.de)!.has(l.vers)) n.set(l.de, (n.get(l.de) ?? 0) + 1);
    }
    return new Map([...n].map(([de, k]) => [de, bandeCables(k)]));
  }, [liens, units]);
  // Ordre des entités sous leur mère : celles reliées par un câble suivent les lignes de leur responsable, pour que
  // les câbles ne se croisent pas. De haut en bas : la ligne la plus haute vers l'entité la plus à l'extérieur
  // (grande carte : colonne de gauche à gauche, de droite à droite) ; en liste : la plus haute vers la plus éloignée.
  const ordonnees = useMemo(() => {
    const ordonner = (b: Branche<OrgUnit>): Branche<OrgUnit> => {
      const enfants = b.enfants.map(ordonner);
      const r = rangees.get(b.u.id) ?? [];
      const k = grandes.has(b.u.id) && !vertical ? coupure(r) : 0;
      const depart = new Map<string, Depart[]>();
      for (const l of liens) {
        const rang = l.de === b.u.id ? rangDuLien(l, r) : -1;
        if (rang >= 0) depart.set(l.vers, [...(depart.get(l.vers) ?? []), { rang, gauche: k ? rang < k : null }]);
      }
      const relies = enfants.filter((e) => depart.has(e.u.id));
      if (!relies.length) return { u: b.u, enfants };
      // Départ : les entités dans l'ordre des lignes de leur responsable (la plus haute à l'extérieur).
      const haut = (e: Branche<OrgUnit>) => Math.min(...depart.get(e.u.id)!.map((d) => d.rang));
      const tri = [...relies].sort((x, y) => haut(x) - haut(y));
      const debut = vertical
        ? tri.reverse()
        : k
          ? [...tri.filter((e) => haut(e) < k), ...tri.filter((e) => haut(e) >= k).reverse()]
          : [...tri.filter((_, i) => i % 2 === 0), ...tri.filter((_, i) => i % 2 === 1).reverse()];
      const { ordre, milieu } = ordreDesEntites(debut.map((e) => e.u.id), depart, vertical);
      const parId = new Map(enfants.map((e) => [e.u.id, e]));
      const o = ordre.map((id) => parId.get(id)!);
      return { u: b.u, enfants: [...o.slice(0, milieu), ...enfants.filter((e) => !depart.has(e.u.id)), ...o.slice(milieu)] };
    };
    return racines.map(ordonner);
  }, [racines, rangees, liens, grandes, vertical]);
  const disposition = useDisposition({
    plan,
    arbre,
    cadre,
    units,
    actif: !vertical,
    peut: (u) => edition && !u.archive && (club.canManage || u.moiAdmin),
    placer: club.placerCartes,
  });
  const branche = (b: Branche<OrgUnit>) => (
    <li key={b.u.id}>
      {orga ? (
        <Fiche u={b.u} o={orga} a={actions(b.u)} deplacer={disposition.deplacer(b.u)} grande={!vertical && grandes.has(b.u.id)} />
      ) : (
        <Noeud u={b.u} {...actions(b.u)} deplacer={disposition.deplacer(b.u)} grande={!vertical && grandes.has(b.u.id)} />
      )}
      {b.enfants.length > 0 && <ul style={vertical ? undefined : ({ '--bande': `${bandes.get(b.u.id) ?? bandeCables(0)}px` } as CSSProperties)}>{b.enfants.map(branche)}</ul>}
    </li>
  );
  const n = disposition.remettables.length;
  const ignorees = edition && disposition.ignorees;
  return (
    <>
      <div ref={cadre} className="arbre-cadre">
        <div
          ref={plan}
          className={`arbre-plan ${vertical ? 'vertical' : 'haut'} ${liens.length ? 'avec-cables' : ''} ${disposition.libre ? 'libre' : ''}`}
          style={vertical ? ({ '--voies': `${margeCables(liens.length)}px` } as CSSProperties) : undefined}
        >
          {disposition.libre && <TraitsOrganigramme plan={plan} units={units} bandes={bandes} />}
          <ul ref={arbre} className={`arbre ${vertical ? 'vertical' : 'haut'}`}>{ordonnees.map(branche)}</ul>
          <CablesOrganigramme plan={plan} liens={liens} vertical={vertical} units={units} />
        </div>
      </div>
      {/* Sous l'arbre : s'il apparaît, l'arbre ne bouge pas sous la carte qu'on vient de poser. */}
      {(disposition.erreur || ignorees || n > 0) && (
        <div className="arbre-outils">
          {disposition.erreur && <span className="error small-note">{disposition.erreur}</span>}
          {ignorees && <span className="muted small-note">Des cartes sont placées à la main : leur disposition s’affiche sur un écran plus large.</span>}
          {n > 0 && (
            <button
              type="button"
              className="btn small"
              title="Remettre les cartes déplacées à leur place dans l’arbre"
              onClick={() => confirm(`Remettre ${n > 1 ? `les ${n} cartes déplacées à leur place` : 'la carte déplacée à sa place'} dans l’arbre ? Pour tout le monde.`) && disposition.toutRemettre()}
            >
              ↺ Disposition automatique
            </button>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Une entité dans l'arbre : nom et type, une ligne « N membres · Ouvrir › », puis une ligne par personne
 * (son nom et ses fonctions) qui ouvre sa fiche. En mode « Modifier » : poignée, ⚙️ et « + Ajouter une personne ».
 * Une grande carte (comité central) range ses lignes sur deux colonnes.
 */
function Noeud({ u, onPersonne, onLien, onAjouter, ouvrir, onModifier, cablage, deplacer, grande }: { u: OrgUnit; grande?: boolean } & Actions) {
  const club = useClub();
  const t = UNIT_TYPES[u.type];
  const { lignes, groupes, rangees } = lignesDe(u, club.units);
  const access = centralAccess(u);
  const ouverte = u.id === club.current.id;
  const cible = cablage?.cible;
  // L'accès du comité central : déjà dit par « 👁 Consulter » / « ✏️ Ouvrir » quand on le visite à ce titre.
  const acces = access !== 'aucun' && !(ouvrir && !u.moi);
  const texte = (
    <>
      <span className="arbre-titre">
        <UnitMark className="org-icon" logo={u.logo} couleur={u.couleur} icon={t.icon} />
        <span className="arbre-texte">
          <strong>{u.nom}</strong>
          <small>{t.label}{u.date && ` · ${fmtRange(u.date, u.dateFin)}`}</small>
        </span>
      </span>
      <span className="arbre-meta">
        <span>{u.membres.length} membre{u.membres.length > 1 ? 's' : ''}</span>
        {ouverte && <span className="arbre-ouverte">ouverte</span>}
        {acces && <span className="arbre-acces" title={`Comité central : ${CENTRAL_ACCESS[access].label.toLowerCase()}`}>{CENTRAL_ACCESS[access].icon}</span>}
        {ouvrir && <span className="arbre-lien">{ouvrir.label} ›</span>}
      </span>
    </>
  );
  return (
    <div
      className={`arbre-noeud ${grande ? 'grande' : ''} ${ouverte ? 'ouverte' : ''} ${u.archive ? 'archived' : ''} ${cible?.actif || (cible && cablage?.mode) ? 'cablage-cible' : ''} ${cible?.survol ? 'cablage-survol' : ''} ${deplacer ? 'deplacable' : ''}`}
      style={{ borderTopColor: u.couleur }}
      data-noeud={u.id}
      onPointerDown={deplacer?.onPointerDown}
    >
      {deplacer && (
        <span
          className="poignee"
          data-poignee
          title={`Déplacer la carte${deplacer.remettre ? ' (double-clic : la remettre à sa place dans l’arbre)' : ''}`}
          aria-hidden="true"
          onDoubleClick={deplacer.remettre}
        />
      )}
      {ouvrir ? (
        <button type="button" className="arbre-tete" title={ouvrir.aide} onClick={() => !deplacer?.bougeJuste() && ouvrir.go()}>{texte}</button>
      ) : (
        <div className="arbre-tete">{texte}</div>
      )}
      {/* Pas de <ul> ici : les traits de l'arbre sont dessinés sur les listes. */}
      <Postes deux={grande ? coupure(rangees) : 0}>
        {!lignes.some((l) => l.chef) && <span className="poste muted">★ {t.chef} : à désigner</span>}
        {lignes.map((l) => (
          <button
            key={l.m.id}
            type="button"
            data-ligne={`${u.id}|${l.m.id}`}
            className={`poste ${l.chef ? 'chef' : ''} ${cablage ? 'tirable' : ''} ${cablage?.choisi === personKey(l.m, u.id) ? 'choisi' : ''}`}
            onPointerDown={cablage ? (e) => cablage.onTirer(e, l.m) : undefined}
            onClick={() => {
              if (cablage?.tireJuste()) return;
              if (cablage?.mode) cablage.onChoisir(l.m);
              else onPersonne(l.m);
            }}
          >
            {cablage?.mode && <span className="prise" data-prise title="Tirer le câble jusqu’à une entité" aria-hidden="true" />}
            {l.chef && <span className="org-star">★ </span>}
            {l.nom}
            {l.postes && <span className="autres"> · {l.postes}</span>}
          </button>
        ))}
        {groupes.map((g) => (
          <button key={g.id} type="button" data-ligne={`${u.id}|lien:${g.id}`} className="poste lien" title={`Tous les membres de « ${g.unite?.nom ?? '?'} » font partie de « ${u.nom} »`} onClick={() => onLien(g.id)}>
            👥 {g.unite?.nom ?? 'Entité supprimée'}
            <span className="autres"> · {g.membres.length} membre{g.membres.length > 1 ? 's' : ''}</span>
          </button>
        ))}
      </Postes>
      {cible && cablage?.mode && (
        <button type="button" className="cablage-depose" onClick={() => cible.onDeposer()}>
          {cible.label}
        </button>
      )}
      {(onAjouter || onModifier) && (
        <div className="arbre-pied">
          {onAjouter && (
            <button type="button" className="arbre-ajout" title={ouverte ? `Ajouter une personne à « ${u.nom} »` : `Ouvrir « ${u.nom} » et y ajouter une personne`} onClick={onAjouter}>
              + Ajouter une personne
            </button>
          )}
          {onModifier && <button type="button" className="arbre-regler" title={`Modifier l’entité « ${u.nom} »`} aria-label={`Modifier l’entité ${u.nom}`} onClick={onModifier}>⚙️</button>}
        </div>
      )}
    </div>
  );
}

const fromDirectory = (e: DirectoryEntry, poste: string): NewMember => ({ prenom: e.prenom, nom: e.nom, email: e.email, telephone: e.telephone, couleur: e.couleur, poste });

function UnitModal({ unit, onClose, onCreated }: { unit?: OrgUnit; onClose: () => void; onCreated: (c: CreatedUnit, n: NewUnit) => void }) {
  const club = useClub();
  const isNew = !unit;
  const isCentral = unit?.type === 'central';
  // Type et archivage : réservés au comité central.
  const manage = club.canManage && !isCentral;
  const [nom, setNom] = useState(unit?.nom ?? '');
  const [type, setType] = useState<UnitType>(unit?.type ?? 'sous-comite');
  const [couleur, setCouleur] = useState(unit?.couleur ?? UNIT_COLORS[club.units.length % UNIT_COLORS.length]);
  const [date, setDate] = useState(unit?.date ?? '');
  const [dateFin, setDateFin] = useState(unit?.dateFin ?? '');
  const [description, setDescription] = useState(unit?.description ?? '');
  const [archive, setArchive] = useState(!!unit?.archive);
  const [logo, setLogo] = useState(unit?.logo);
  // Dans l'organigramme : l'entité dont elle dépend (pas elle-même, ni une entité qui dépend d'elle).
  const actives = club.units.filter((u) => !u.archive);
  const centralUnit = actives.find((u) => u.type === 'central');
  const exclus = unit ? [unit.id, ...sousEntites(actives, unit.id)] : [];
  const possibles = actives.filter((u) => !exclus.includes(u.id));
  const [dependDe, setDependDe] = useState(() => (unit ? parentDans(actives, unit)?.id : undefined) ?? centralUnit?.id ?? '');
  // Accès du comité central : réglé par les admins de l'entité seulement.
  const [central, setCentral] = useState<CentralAccess>(unit ? centralAccess(unit) : 'aucun');
  const ownsAccess = !!unit && !isCentral && unit.moiAdmin;
  const { update } = useStore();
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
    const lien = dependDe && dependDe !== centralUnit?.id ? dependDe : undefined;
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
          membres: membres.map((k) => dir.find((e) => e.key === k)).filter((e): e is DirectoryEntry => !!e && e.key !== chefKey).map((e) => fromDirectory(e, '')),
        };
        onCreated(await club.createUnit(n), n);
      } else {
        const access = ownsAccess ? { central } : {};
        const image = logo !== unit.logo ? { logo } : {};
        await club.updateUnit(unit.id, manage ? { ...base, type, archive, dependDe: lien, ...access, ...image } : { ...base, ...access, ...image });
        if (ownsAccess && central !== centralAccess(unit) && unit.id === club.current.id) update(() => {}, `Accès du comité central : ${CENTRAL_ACCESS[central].label}`);
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
            Dépend de <small className="muted">(trait dans l’organigramme)</small>
            <select value={dependDe} onChange={(e) => setDependDe(e.target.value)}>
              {possibles.map((u) => <option key={u.id} value={u.id}>{UNIT_TYPES[u.type].icon} {u.nom}</option>)}
            </select>
          </label>
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
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ce que fait l’entité (facultatif)" />
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
                Facultatif : le {info.chef.toLowerCase()} pourra ajouter ensuite les autres membres, régler leurs rôles et créer leurs accès depuis l’organigramme (« ✏️ Modifier l’organigramme » › « + Ajouter une personne », clic sur une personne).
              </p>
            </div>
          </>
        )}

        {!isNew && !isCentral && (
          <div className="full">
            <span className="field-label">Accès du comité central</span>
            <CentralAccessChoice name="central-unit" value={central} onChange={setCentral} disabled={!ownsAccess} />
            {!ownsAccess && <p className="muted small-note">Réglé par les admins (★) de l’entité.</p>}
          </div>
        )}
        {!isNew && manage && (
          <label className="full inline">
            <input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} />
            Archiver (événement passé) : l’entité disparaît des menus, ses données sont gardées.
          </label>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : isNew ? 'Créer l’entité' : 'Enregistrer'}</button>
      </div>
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
      <p className="muted">Démo : pour y entrer, connecte-toi en tant que {n.chef.prenom} (« Changer » en haut à droite).</p>
      <div className="modal-foot">
        <span className="grow" />
        {mine && <button className="btn" onClick={() => club.switchUnit(c.unitId)}>Ouvrir « {n.nom} »</button>}
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}

/**
 * Une entité dont tous les membres font partie d'une autre : la liste de ceux qui en font partie par ce lien
 * (un clic ouvre leur fiche) ; ses admins choisissent leur rôle à l'arrivée ou retirent le lien.
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
  const roles = data.roles.filter((r) => r.id !== ADMIN_ROLE_ID);
  const role = lien ? roleDuLien(data, lien.role) : undefined;
  const changerRole = (r: string) =>
    update((d) => {
      d.membresDe = (d.membresDe ?? []).map((l) => (l.uniteId === id ? { ...l, role: r } : l));
    }, `Membres de « ${nomA} » : rôle « ${roles.find((x) => x.id === r)?.label ?? r} » à leur arrivée`);
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
        Tous les membres de « {nomA} » font partie de « {u.nom} » : qui rejoint ou quitte « {nomA} » rejoint ou quitte aussi « {u.nom} », automatiquement.
        {' '}« {u.nom} » peut aussi avoir d’autres personnes (« + Ajouter une personne »).
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
      {admin && roles.length > 0 && (
        <label className="lien-role">
          Rôle de ses membres dans « {u.nom} » quand ils arrivent
          <select value={role ?? ''} onChange={(e) => changerRole(e.target.value)}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <small className="muted">Chacun garde ensuite le sien (clic sur son nom pour le changer). Jamais Admin : un admin s’ajoute lui-même.</small>
        </label>
      )}
      <div className="modal-foot">
        {admin && <button className="btn danger" onClick={retirer}>Retirer « {nomA} »</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
        {onModifier && <button className="btn primary" onClick={onModifier}>Modifier dans « {u.nom} »</button>}
      </div>
    </Modal>
  );
}
