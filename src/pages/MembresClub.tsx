import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useClub } from '../data/club';
import { useStore } from '../data/store';
import { accessAction, type AccessInfo } from '../data/cloud';
import { downloadCsv, norm } from '../data/csv';
import { COLS_REGISTRE, analyserRegistre, derniers } from '../data/imports';
import { compactIban, emailKey, formatIban, groupesClub, nomMembre, nouveauMembre, postesDe } from '../data/membres';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { defaultRoleId } from '../data/units';
import { uid } from '../data/utils';
import type { ClubMembre, ColonnesMembres, FichesEntite, OrgUnit, Person } from '../data/types';
import { Initials, Modal } from '../components/ui';
import { ImportCsv } from '../components/ImportCsv';
import { AccessCell, CredentialsModal, type Shown } from '../components/Acces';
import { Icone } from '../components/icones';
import { Deroulante } from '../components/Deroulante';
import { IconeEntite, PastilleEntite } from '../components/IconesEntite';

// Membres du club : registre commun à toutes les entités (une fiche par personne, avec ou sans accès à l'appli).
// Réservé au droit « Membres du club » (Admin, Secrétaire…) et aux admins des entités ; les caissiers la lisent, avec les
// IBAN (eux seuls). Chacun choisit ses colonnes (ordre, affichage, tri). Une personne peut masquer ses données
// personnelles (Réglages). Les admins d'une entité y gèrent aussi les accès de ses membres (rôles, retrait, compte).

type Col = 'nom' | 'prenom' | 'telephone' | 'email' | 'postes' | 'groupes' | 'iban';
const COLONNES: { key: Col; label: string }[] = [
  { key: 'nom', label: 'Nom' },
  { key: 'prenom', label: 'Prénom' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'email', label: 'E-mail' },
  { key: 'postes', label: 'Postes' },
  { key: 'groupes', label: 'Groupes' },
  { key: 'iban', label: 'IBAN' },
];
const libelle = (k: Col) => COLONNES.find((c) => c.key === k)!.label;
const PAR_DEFAUT: ColonnesMembres = { ordre: COLONNES.map((c) => c.key), masquees: ['groupes'], tri: { col: 'nom' } };

/** Colonnes de la personne : ses choix, complétés (IBAN : caissiers seulement). */
function colonnesDe(c: ColonnesMembres | undefined, caisse: boolean) {
  const connues = COLONNES.map((x) => x.key).filter((k) => caisse || k !== 'iban');
  const ordre = [...(c?.ordre ?? []).filter((k): k is Col => connues.includes(k as Col)), ...connues.filter((k) => !c?.ordre.includes(k))];
  const masquees = new Set((c ?? PAR_DEFAUT).masquees);
  const visibles = ordre.filter((k) => !masquees.has(k));
  const tri = c?.tri && connues.includes(c.tri.col as Col) ? c.tri : PAR_DEFAUT.tri!;
  return { ordre, visibles: visibles.length ? visibles : (['nom'] as Col[]), tri };
}

// Les colonnes suivent la personne d'une entité à l'autre dans ce navigateur (les réglages, eux, sont par entité).
const CLE_LOCALE = 'gsa-membres-colonnes';
function lireLocal(qui: string): ColonnesMembres | undefined {
  try {
    const v = localStorage.getItem(`${CLE_LOCALE}:${qui}`);
    return v ? (JSON.parse(v) as ColonnesMembres) : undefined;
  } catch {
    return undefined;
  }
}
function ecrireLocal(qui: string, c: ColonnesMembres) {
  try {
    localStorage.setItem(`${CLE_LOCALE}:${qui}`, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

const ibanCourt = (s = '') => {
  const c = compactIban(s);
  return c ? `${c.slice(0, 4)} … ${c.slice(-4)}` : '';
};
const Masque = () => <span className="muted" title="Données masquées par la personne (ses réglages)">🔒 masqué</span>;

export function MembresClub() {
  const club = useClub();
  const { user, prefs, setPrefs } = useStore();
  const [list, setList] = useState<ClubMembre[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('');
  const [edit, setEdit] = useState<ClubMembre | null>(null);
  const [importer, setImporter] = useState(false);
  const [reglerColonnes, setReglerColonnes] = useState(false);
  const { membres } = club;
  const gerer = club.membresAcces;
  const caisse = club.caissier;
  const load = useCallback(
    () =>
      membres()
        .then((l) => {
          setList(l);
          setErr('');
        })
        .catch((e: Error) => setErr(e.message)),
    // Le registre se relit après chaque enregistrement (pas à chaque rafraîchissement de l'organigramme).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => void load(), [load]);

  const qui = emailKey(user?.email) || user?.id || '';
  const choix = prefs.membresColonnes ?? lireLocal(qui);
  const cols = colonnesDe(choix, caisse);
  const sauverColonnes = (c: ColonnesMembres) => {
    setPrefs({ membresColonnes: c });
    ecrireLocal(qui, c);
  };
  const trier = (k: Col) => sauverColonnes({ ordre: cols.ordre, masquees: (choix ?? PAR_DEFAUT).masquees, tri: { col: k, desc: cols.tri.col === k ? !cols.tri.desc : false } });

  const units = club.units;
  const groupes = groupesClub(units);
  const postes = useMemo(() => {
    const actives = units.filter((u) => !u.archive);
    return new Map((list ?? []).map((m) => [m.id, postesDe(m, actives)]));
  }, [list, units]);
  const postesTexte = (m: ClubMembre) => (postes.get(m.id) ?? []).map((p) => `${p.unit.nom}${p.member.poste ? ` (${p.member.poste})` : ''}`).join(', ');
  const groupesDe = (m: ClubMembre) => m.groupes.map((g) => units.find((u) => u.id === g)).filter((u): u is OrgUnit => !!u);
  const enregistrer = async (maj: ClubMembre[]) => {
    await club.saveMembres(maj);
    await load();
  };

  const valeur = (m: ClubMembre, k: Col): string =>
    k === 'postes' ? postesTexte(m) : k === 'groupes' ? groupesDe(m).map((u) => u.nom).join(', ') : k === 'iban' ? compactIban(m.iban ?? '') : m[k];
  const needle = norm(q);
  const vus = (list ?? [])
    .filter((m) => {
      const n = postes.get(m.id)?.length ?? 0;
      if (filtre === 'poste') return n > 0;
      if (filtre === 'sans') return n === 0;
      if (filtre === 'aucun-groupe') return !m.groupes.length;
      if (filtre) return m.groupes.includes(filtre);
      return true;
    })
    .filter((m) => !needle || norm(`${m.prenom} ${m.nom} ${m.email} ${m.telephone}`).includes(needle))
    .sort((a, b) => {
      const x = valeur(a, cols.tri.col as Col);
      const y = valeur(b, cols.tri.col as Col);
      // Cases vides à la fin, dans les deux sens.
      if (!x !== !y) return x ? -1 : 1;
      const r = x.localeCompare(y, 'fr', { sensitivity: 'base', numeric: true });
      return (cols.tri.desc ? -r : r) || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr');
    });

  const exporter = () =>
    downloadCsv('membres-du-club.csv', [
      ['Prénom', 'Nom', 'Email', 'Téléphone', ...(caisse ? ['IBAN'] : []), 'Groupes', 'Postes'],
      ...vus.map((m) => [
        m.prenom,
        m.nom,
        m.email,
        m.telephone,
        ...(caisse ? [formatIban(m.iban ?? '')] : []),
        groupesDe(m).map((u) => u.nom).join(', '),
        postesTexte(m),
      ]),
    ]);

  const cellule = (m: ClubMembre, k: Col): ReactNode => {
    const avatar = k === cols.visibles.find((x) => x === 'nom' || x === 'prenom');
    const texte = (s: string) => (avatar ? <span className="inline"><Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={26} /> {s}</span> : s);
    if (k === 'nom' || k === 'prenom') return texte(m[k]);
    if (m.masque && (k === 'email' || k === 'telephone' || k === 'iban')) return <Masque />;
    if (k === 'email' || k === 'telephone') return m[k];
    if (k === 'iban') return <span className="mono">{ibanCourt(m.iban)}</span>;
    if (k === 'groupes') return groupesDe(m).map((u) => <span key={u.id} className="badge" style={{ background: u.couleur }}>{u.nom}</span>);
    return (
      <small className="postes-entites">
        {(postes.get(m.id) ?? []).map((p, i) => (
          <span key={i}><IconeEntite u={p.unit} /> {p.unit.nom}{p.member.poste ? ` · ${p.member.poste}` : ''}</span>
        ))}
      </small>
    );
  };

  return (
    <div>
      <div className="page-head">
        <h1>Membres du club{list && <small className="muted"> · {list.length}</small>}</h1>
        {list && (
          <span className="row wrap">
            <button className="btn" onClick={() => setReglerColonnes(true)}><Icone n="colonnes" /> Colonnes</button>
            {gerer && <button className="btn" onClick={() => setImporter(true)}><Icone n="importer" /> Importer</button>}
            <button className="btn" disabled={!vus.length} onClick={exporter}><Icone n="exporter" /> Exporter</button>
            {gerer && <button className="btn primary" onClick={() => setEdit(nouveauMembre({}))}>+ Nouveau membre</button>}
          </span>
        )}
      </div>
      <p className="muted">
        Une fiche par personne pour tout le club, avec ou sans accès à l’appli (licenciés, parents, bénévoles…). Prénom, nom, email et
        téléphone sont les mêmes dans toutes les entités où la personne a un poste : modifiés ici, ils changent partout.
        {gerer && ' Clic sur un membre : sa fiche, et ses accès dans les entités dont tu es admin (rôles, retrait, accès à l’appli).'}
        {caisse ? ' L’IBAN n’est visible que des caissiers ; chacun enregistre le sien dans ses Réglages.' : ''} Chacun peut masquer ses
        données personnelles dans cette liste (Réglages).
      </p>
      {err && <p className="error">{err}</p>}
      {!list && !err && <p className="muted">Chargement…</p>}
      {list && (
        <>
          <div className="filters open">
            <input className="search" type="search" placeholder="Rechercher un nom, un email, un téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer">
              <option value="">Tous les membres ({list.length})</option>
              <option value="poste">Avec un poste dans une entité</option>
              <option value="sans">Sans poste</option>
              {groupes.map((g) => (
                <option key={g.id} value={g.id}>Groupe : {g.nom} ({list.filter((m) => m.groupes.includes(g.id)).length})</option>
              ))}
              {groupes.length > 0 && <option value="aucun-groupe">Sans groupe</option>}
            </select>
          </div>
          <div className="table-scroll">
            <table className={`table membres-table${gerer ? '' : ' lecture'}`}>
              <thead>
                <tr>
                  {cols.visibles.map((k) => (
                    <th key={k} className="sortable" onClick={() => trier(k)} title="Trier">
                      {libelle(k)} {cols.tri.col === k ? (cols.tri.desc ? '▼' : '▲') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vus.map((m) => (
                  <tr key={m.id} onClick={gerer ? () => setEdit(m) : undefined}>
                    {cols.visibles.map((k) => <td key={k}>{cellule(m, k)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!vus.length && <p className="muted">{list.length ? 'Aucun membre ne correspond.' : 'Le registre est vide : ajoute un membre ou importe un fichier.'}</p>}
        </>
      )}
      {reglerColonnes && (
        <ColonnesModal
          ordre={cols.ordre}
          visibles={cols.visibles}
          onSave={(ordre, visibles) => sauverColonnes({ ordre, masquees: ordre.filter((k) => !visibles.includes(k)), tri: cols.tri })}
          onReset={() => sauverColonnes(PAR_DEFAUT)}
          onClose={() => setReglerColonnes(false)}
        />
      )}
      {edit && list && (
        <MembreModal
          membre={edit}
          list={list}
          postes={postes.get(edit.id) ?? []}
          onSave={(m) => enregistrer([m])}
          onDelete={async (id) => {
            await club.deleteMembre(id);
            await load();
          }}
          onClose={() => setEdit(null)}
        />
      )}
      {importer && list && (
        <Modal title="Importer des membres du club" wide onClose={() => setImporter(false)}>
          <ImportCsv
            colonnes={COLS_REGISTRE}
            modele="modele-membres-du-club.csv"
            aide={<p className="muted">Une ligne par personne. Une personne déjà inscrite (même email, sinon même prénom et nom) est mise à jour : les cellules remplies remplacent ses valeurs, les cellules vides ne changent rien. Pas d’IBAN : chacun enregistre le sien dans ses Réglages.</p>}
            analyser={(lignes) => analyserRegistre(lignes, list, units)}
            appliquer={async (vals) => {
              const maj = derniers(vals);
              await enregistrer(maj);
              return `${maj.length} membre${maj.length > 1 ? 's' : ''} enregistré${maj.length > 1 ? 's' : ''} dans le registre du club.`;
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/** Colonnes de la liste : affichées ou non, dans quel ordre (le tri : clic sur l'en-tête d'une colonne). */
function ColonnesModal({ ordre, visibles, onSave, onReset, onClose }: { ordre: Col[]; visibles: Col[]; onSave: (ordre: Col[], visibles: Col[]) => void; onReset: () => void; onClose: () => void }) {
  const [o, setO] = useState(ordre);
  const [v, setV] = useState(visibles);
  const deplacer = (i: number, d: -1 | 1) =>
    setO((x) => {
      const n = [...x];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  return (
    <Modal title="Colonnes de la liste" onClose={onClose}>
      <p className="muted small-note">Rien que pour toi : coche les colonnes à afficher et range-les. Pour trier, clique sur l’en-tête d’une colonne (une deuxième fois : ordre inverse).</p>
      <ul className="colonnes-liste">
        {o.map((k, i) => (
          <li key={k}>
            <label className="inline">
              <input type="checkbox" checked={v.includes(k)} disabled={v.length === 1 && v.includes(k)} onChange={(e) => setV((x) => (e.target.checked ? [...x, k] : x.filter((y) => y !== k)))} />
              {libelle(k)}
            </label>
            <span className="grow" />
            <button className="btn small" disabled={i === 0} aria-label={`Monter « ${libelle(k)} »`} onClick={() => deplacer(i, -1)}><Icone n="monter" /></button>
            <button className="btn small" disabled={i === o.length - 1} aria-label={`Descendre « ${libelle(k)} »`} onClick={() => deplacer(i, 1)}><Icone n="descendre" /></button>
          </li>
        ))}
      </ul>
      <div className="modal-foot">
        <button
          className="btn"
          onClick={() => {
            onReset();
            onClose();
          }}
        >
          Par défaut
        </button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button
          className="btn primary"
          onClick={() => {
            onSave(o, o.filter((k) => v.includes(k)));
            onClose();
          }}
        >
          Enregistrer
        </button>
      </div>
    </Modal>
  );
}

function MembreModal({ membre, list, postes, onSave, onDelete, onClose }: {
  membre: ClubMembre;
  list: ClubMembre[];
  postes: ReturnType<typeof postesDe>;
  onSave: (m: ClubMembre) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const club = useClub();
  const [v, setV] = useState<ClubMembre>(membre);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nouveau = !list.some((m) => m.id === membre.id);
  const groupes = groupesClub(club.units);
  const set = (patch: Partial<ClubMembre>) => setV((x) => ({ ...x, ...patch }));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const submit = () => {
    if (!nomMembre(v)) return setErr('Indique au moins un prénom ou un nom.');
    if (!membre.masque) {
      if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return setErr('Adresse email invalide.');
      const autre = v.email.trim() && list.find((m) => m.id !== v.id && emailKey(m.email) === emailKey(v.email));
      if (autre) return setErr(`Cette adresse est déjà celle de ${nomMembre(autre)}.`);
    }
    void run(() => onSave({ ...nouveauMembre(v), iban: membre.iban }));
  };
  return (
    <Modal title={nouveau ? 'Nouveau membre du club' : nomMembre(membre)} onClose={onClose}>
      {membre.masque && (
        <p className="lien-note">🔒 {nomMembre(membre)} a masqué ses données personnelles : son email et son téléphone ne s’affichent pas ici et ne s’y modifient pas (seulement depuis sa fiche dans une entité).</p>
      )}
      <div className="form">
        <label>Prénom<input value={v.prenom} onChange={(e) => set({ prenom: e.target.value })} /></label>
        <label>Nom<input value={v.nom} onChange={(e) => set({ nom: e.target.value })} /></label>
        {!membre.masque && (
          <>
            <label>Adresse email<input type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></label>
            <label>Téléphone portable<input type="tel" value={v.telephone} onChange={(e) => set({ telephone: e.target.value })} /></label>
          </>
        )}
        {club.caissier && !nouveau && !membre.masque && (
          <p className="full">
            <span className="field-label">IBAN</span>
            {membre.iban ? <span className="mono">{formatIban(membre.iban)}</span> : <span className="muted">pas encore enregistré</span>}
            <br />
            <small className="muted">Seule la personne elle-même enregistre ou modifie son IBAN (Réglages).</small>
          </p>
        )}
        {groupes.length > 0 && (
          <div className="full">
            <span className="field-label">Groupes</span>
            <div className="chips">
              {groupes.map((g) => {
                const on = v.groupes.includes(g.id);
                return (
                  <button key={g.id} type="button" className={`chip role-chip ${on ? 'on' : ''}`} style={on ? { background: g.couleur, borderColor: g.couleur } : {}} onClick={() => set({ groupes: on ? v.groupes.filter((x) => x !== g.id) : [...v.groupes, g.id] })}>
                    {g.nom}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {!nouveau && <AccesMembre membre={membre} postes={postes} />}
      {nouveau && <p className="muted small-note">Une fois la fiche enregistrée, ouvre-la pour l’ajouter à une entité (rôle, accès à l’appli).</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!nouveau && (
          <button
            className="btn danger"
            disabled={busy || postes.length > 0}
            title={postes.length ? 'Retire-le d’abord de ses entités' : ''}
            onClick={() => confirm(`Supprimer ${nomMembre(membre)} du registre du club ?`) && void run(() => onDelete(membre.id))}
          >
            Supprimer
          </button>
        )}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </Modal>
  );
}

/** Fiche de ce membre dans une entité : liée au registre, sinon même email. */
const ficheDe = (f: FichesEntite, m: ClubMembre) => {
  const e = emailKey(m.email);
  const liees = f.people.filter((p) => p.membreId === m.id || (!p.membreId && e && emailKey(p.email) === e));
  return liees.find((p) => p.actif) ?? liees[0];
};

/**
 * Accès du membre dans les entités du club : rôles, retrait, ajout ou réactivation, accès à l'appli (version réelle).
 * Modifiables dans les entités dont la personne connectée est admin ; les autres en lecture.
 */
function AccesMembre({ membre, postes }: { membre: ClubMembre; postes: ReturnType<typeof postesDe> }) {
  const club = useClub();
  const { cloud } = useStore();
  const [fiches, setFiches] = useState<Record<string, FichesEntite | string>>({});
  const [acces, setAcces] = useState<Record<string, AccessInfo[] | string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [shown, setShown] = useState<Shown | null>(null);
  const [ajout, setAjout] = useState('');
  const [role, setRole] = useState('');
  const miennes = club.units.filter((u) => u.moiAdmin && !u.archive);
  const ici = new Set(postes.map((p) => p.unit.id));
  const possibles = miennes.filter((u) => !ici.has(u.id));

  const chargerFiches = useCallback(
    async (id: string) => {
      try {
        const f = await club.fichesEntite(id);
        setFiches((x) => ({ ...x, [id]: f }));
        return f;
      } catch (e) {
        setFiches((x) => ({ ...x, [id]: (e as Error).message }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const chargerAcces = useCallback(
    (id: string) => {
      if (!cloud) return;
      accessAction<{ acces: AccessInfo[] }>({ action: 'liste', committeeId: id })
        .then((r) => setAcces((x) => ({ ...x, [id]: r.acces })))
        .catch((e: Error) => setAcces((x) => ({ ...x, [id]: e.message })));
    },
    [cloud],
  );
  const admins = postes.filter((p) => p.unit.moiAdmin).map((p) => p.unit.id).join(',');
  useEffect(() => {
    for (const id of admins ? admins.split(',') : []) {
      void chargerFiches(id);
      chargerAcces(id);
    }
  }, [admins, chargerFiches, chargerAcces]);
  // Entité choisie pour l'ajout : ses rôles (rôle de base proposé).
  useEffect(() => {
    if (!ajout) return;
    const f = fiches[ajout];
    if (f && typeof f !== 'string') setRole(defaultRoleId(f.roles));
    else if (!f) void chargerFiches(ajout);
  }, [ajout, fiches, chargerFiches]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enregistrer = async (u: OrgUnit, p: Person) => {
    await club.enregistrerFiche(u.id, p);
    await chargerFiches(u.id);
    chargerAcces(u.id);
  };
  const ajouter = () => {
    const u = miennes.find((x) => x.id === ajout);
    const f = fiches[ajout];
    if (!u || !f || typeof f === 'string' || !role) return;
    const avant = ficheDe(f, membre);
    const p: Person = avant
      ? { ...avant, actif: true, exclu: undefined, roles: avant.roles.includes(role) ? avant.roles : [...avant.roles, role] }
      : { id: uid('p'), prenom: membre.prenom, nom: membre.nom, email: membre.email, telephone: membre.telephone, couleur: membre.couleur, poste: '', roles: [role], actif: true, membreId: membre.id };
    void run(async () => {
      await enregistrer(u, p);
      setAjout('');
    }, `✅ ${nomMembre(membre)} ${avant ? 'réactivé(e) dans' : 'ajouté(e) à'} « ${u.nom} ». Son poste se règle dans l’organigramme.`);
  };

  if (!postes.length && !possibles.length) return null;
  return (
    <div className="acces-membre">
      <span className="field-label">Entités et accès</span>
      {!postes.length && <p className="muted small-note">Aucun poste dans une entité du club (pas d’accès à l’appli).</p>}
      {postes.map(({ unit: u, member: om }) => {
        const f = fiches[u.id];
        const fiche = f && typeof f !== 'string' ? ficheDe(f, membre) : undefined;
        const tete = (
          <div className="acces-tete">
            <strong><IconeEntite u={u} /> {u.nom}</strong>
            {om.poste && <small className="muted"> · {om.poste}</small>}
          </div>
        );
        if (!u.moiAdmin)
          return (
            <div key={u.id} className="acces-ligne">
              {tete}
              <small className="muted">{om.roles.join(', ') || '—'} · géré par les admins de « {u.nom} »</small>
            </div>
          );
        if (!fiche)
          return (
            <div key={u.id} className="acces-ligne">
              {tete}
              <small className={typeof f === 'string' ? 'error' : 'muted'}>{typeof f === 'string' ? f : 'Chargement…'}</small>
            </div>
          );
        const roles = (f as FichesEntite).roles;
        const admins = (f as FichesEntite).people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));
        const soi = !!membre.moi;
        const dernierAdmin = fiche.roles.includes(ADMIN_ROLE_ID) && admins.length <= 1;
        const a = acces[u.id];
        return (
          <div key={u.id} className="acces-ligne">
            {tete}
            <div className="chips">
              {roles.map((r) => {
                const on = fiche.roles.includes(r.id);
                // Garde-fous (comme la fiche de l'entité) : le rôle Admin ne se retire ni à soi-même ni au dernier admin,
                // et ne se donne pas à une fiche liée ; au moins un rôle.
                const bloque = busy || (on && fiche.roles.length === 1) || (r.id === ADMIN_ROLE_ID && ((on && (soi || dernierAdmin)) || (!on && !!fiche.viaEntite)));
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`chip role-chip ${on ? 'on' : ''}`}
                    style={on ? { background: r.couleur, borderColor: r.couleur } : {}}
                    disabled={bloque}
                    onClick={() => void run(() => enregistrer(u, { ...fiche, roles: on ? fiche.roles.filter((x) => x !== r.id) : [...fiche.roles, r.id] }), `✅ Rôles enregistrés dans « ${u.nom} ».`)}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <div className="row wrap">
              {cloud && (typeof a === 'string' ? <small className="error">Accès : {a}</small> : <AccessCell person={fiche} access={a ?? null} committeeId={u.id} soi={soi} onChange={() => chargerAcces(u.id)} onShow={setShown} />)}
              <span className="grow" />
              <button
                className="btn small danger"
                disabled={busy || soi || dernierAdmin}
                title={soi ? 'Pas toi-même' : dernierAdmin ? 'Il reste toujours au moins un admin' : ''}
                onClick={() =>
                  confirm(`Retirer ${nomMembre(membre)} de « ${u.nom} » ?${cloud ? ' Son accès à cette entité est aussi coupé.' : ''} Ses tâches restent ; tu pourras le réactiver d’ici.`) &&
                  void run(() => enregistrer(u, { ...fiche, actif: false, ...(fiche.viaEntite ? { exclu: true } : {}) }), `✅ ${nomMembre(membre)} retiré(e) de « ${u.nom} ».`)
                }
              >
                Retirer de l’entité
              </button>
            </div>
          </div>
        );
      })}
      {possibles.length > 0 && (
        <div className="acces-ajout row wrap">
          <Deroulante value={ajout} onChange={setAjout} aria-label="Ajouter à une entité" options={[{ value: '', label: 'Ajouter à une entité…' }, ...possibles.map((u) => ({ value: u.id, label: u.nom, icone: <PastilleEntite u={u} /> }))]} />
          {ajout && typeof fiches[ajout] === 'object' && (
            <>
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rôle">
                {(fiches[ajout] as FichesEntite).roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              <button className="btn small primary" disabled={busy || !role} onClick={ajouter}>
                {ficheDe(fiches[ajout] as FichesEntite, membre) ? 'Réactiver' : 'Ajouter'}
              </button>
            </>
          )}
          {ajout && typeof fiches[ajout] === 'string' && <small className="error">{fiches[ajout] as string}</small>}
        </div>
      )}
      {msg && <p className="ok-note">{msg}</p>}
      {err && <p className="error">{err}</p>}
      {shown && <CredentialsModal {...shown} onClose={() => setShown(null)} />}
    </div>
  );
}
