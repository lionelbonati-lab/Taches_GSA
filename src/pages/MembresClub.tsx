import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useClub } from '../data/club';
import { useStore } from '../data/store';
import { downloadCsv, norm } from '../data/csv';
import { COLS_REGISTRE, analyserRegistre, derniers } from '../data/imports';
import { compactIban, emailKey, ficheDe, formatIban, nomMembre, nouveauMembre } from '../data/membres';
import { ADMIN_ROLE_ID, defaultRoleId, userRoles } from '../data/permissions';
import { uid } from '../data/utils';
import type { ClubMembre, ColonnesMembres, Person } from '../data/types';
import { Initials, Modal } from '../components/ui';
import { ImportCsv } from '../components/ImportCsv';
import { CompteDuClub } from '../components/Acces';
import { Icone } from '../components/icones';

// Personnes du club : la liste unique du club (une fiche par personne, avec ou sans accès à l'appli). Tout le monde la voit
// (noms, postes, rôles, étiquettes) ; les coordonnées, avec le droit « voir les coordonnées » ; ajouter, modifier, retirer du
// club : droit « Gérer les personnes ». IBAN : les caissiers seulement. Chacun choisit ses colonnes (ordre, affichage,
// tri) et peut masquer ses données personnelles (Réglages). Sur la fiche : les rôles dans l'appli (admins), le poste,
// les étiquettes (droit « Gérer sections, statuts et étiquettes ») et l'accès à l'appli.

type Col = 'nom' | 'prenom' | 'telephone' | 'email' | 'poste' | 'roles' | 'etiquettes' | 'iban';
const COLONNES: { key: Col; label: string }[] = [
  { key: 'nom', label: 'Nom' },
  { key: 'prenom', label: 'Prénom' },
  { key: 'telephone', label: 'Téléphone' },
  { key: 'email', label: 'E-mail' },
  { key: 'poste', label: 'Poste' },
  { key: 'roles', label: 'Rôles' },
  { key: 'etiquettes', label: 'Étiquettes' },
  { key: 'iban', label: 'IBAN' },
];
const libelle = (k: Col) => COLONNES.find((c) => c.key === k)!.label;
const PAR_DEFAUT: ColonnesMembres = { ordre: COLONNES.map((c) => c.key), masquees: ['roles'], tri: { col: 'nom' } };

/** Colonnes de la personne : ses choix, complétés (IBAN : caissiers seulement ; email et téléphone : droit aux coordonnées). */
function colonnesDe(c: ColonnesMembres | undefined, caisse: boolean, coords: boolean) {
  const connues = COLONNES.map((x) => x.key).filter((k) => (caisse || k !== 'iban') && (coords || (k !== 'email' && k !== 'telephone')));
  const ordre = [...(c?.ordre ?? []).filter((k): k is Col => connues.includes(k as Col)), ...connues.filter((k) => !c?.ordre.includes(k))];
  const masquees = new Set((c ?? PAR_DEFAUT).masquees);
  const visibles = ordre.filter((k) => !masquees.has(k));
  const tri = c?.tri && connues.includes(c.tri.col as Col) ? c.tri : PAR_DEFAUT.tri!;
  return { ordre, visibles: visibles.length ? visibles : (['nom'] as Col[]), tri };
}

// Les colonnes suivent la personne dans ce navigateur, même avant que ses réglages soient enregistrés.
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
  const { user, prefs, setPrefs, data } = useStore();
  const [list, setList] = useState<ClubMembre[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('');
  const [edit, setEdit] = useState<ClubMembre | null>(null);
  const [importer, setImporter] = useState(false);
  const [reglerColonnes, setReglerColonnes] = useState(false);
  const { membres } = club;
  const { gerer, coordonnees: coords } = club.personnes;
  const caisse = club.caissier;
  const load = useCallback(
    () =>
      membres()
        .then((l) => {
          setList(l);
          setErr('');
        })
        .catch((e: Error) => setErr(e.message)),
    // Le registre se relit après chaque enregistrement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => void load(), [load]);

  const qui = emailKey(user?.email) || user?.id || '';
  const choix = prefs.membresColonnes ?? lireLocal(qui);
  const cols = colonnesDe(choix, caisse, coords);
  const sauverColonnes = (c: ColonnesMembres) => {
    setPrefs({ membresColonnes: c });
    ecrireLocal(qui, c);
  };
  const trier = (k: Col) => sauverColonnes({ ordre: cols.ordre, masquees: (choix ?? PAR_DEFAUT).masquees, tri: { col: k, desc: cols.tri.col === k ? !cols.tri.desc : false } });

  // Sa fiche dans l'appli (active) : son poste, ses rôles, ses étiquettes.
  const etiquettes = data.etiquettes ?? [];
  const fiche = (m: ClubMembre) => {
    const f = ficheDe(m, data.people);
    return f?.actif ? f : undefined;
  };
  const etiquettesDe = (m: ClubMembre) => {
    const f = fiche(m);
    return f ? etiquettes.filter((e) => e.membres?.includes(f.id)) : [];
  };
  const rolesDe = (m: ClubMembre) => userRoles(data.roles, fiche(m));
  const enregistrer = async (maj: ClubMembre[]) => {
    await club.saveMembres(maj);
    await load();
  };

  const valeur = (m: ClubMembre, k: Col): string =>
    k === 'poste' ? fiche(m)?.poste ?? ''
    : k === 'roles' ? rolesDe(m).map((r) => r.label).join(', ')
    : k === 'etiquettes' ? etiquettesDe(m).map((e) => e.nom).join(', ')
    : k === 'iban' ? compactIban(m.iban ?? '')
    : m[k];
  const needle = norm(q);
  const vus = (list ?? [])
    .filter((m) => {
      if (filtre === 'appli') return !!fiche(m);
      if (filtre === 'sans') return !fiche(m);
      if (filtre.startsWith('e:')) return etiquettesDe(m).some((e) => e.id === filtre.slice(2));
      if (filtre.startsWith('r:')) return rolesDe(m).some((r) => r.id === filtre.slice(2));
      return true;
    })
    .filter((m) => !needle || norm(`${m.prenom} ${m.nom} ${m.email} ${m.telephone} ${fiche(m)?.poste ?? ''}`).includes(needle))
    .sort((a, b) => {
      const x = valeur(a, cols.tri.col as Col);
      const y = valeur(b, cols.tri.col as Col);
      // Cases vides à la fin, dans les deux sens.
      if (!x !== !y) return x ? -1 : 1;
      const r = x.localeCompare(y, 'fr', { sensitivity: 'base', numeric: true });
      return (cols.tri.desc ? -r : r) || `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr');
    });

  const exporter = () =>
    downloadCsv('personnes-du-club.csv', [
      ['Prénom', 'Nom', ...(coords ? ['Email', 'Téléphone'] : []), ...(caisse ? ['IBAN'] : []), 'Poste', 'Rôles', 'Étiquettes'],
      ...vus.map((m) => [
        m.prenom,
        m.nom,
        ...(coords ? [m.email, m.telephone] : []),
        ...(caisse ? [formatIban(m.iban ?? '')] : []),
        valeur(m, 'poste'),
        valeur(m, 'roles'),
        valeur(m, 'etiquettes'),
      ]),
    ]);

  const cellule = (m: ClubMembre, k: Col): ReactNode => {
    const avatar = k === cols.visibles.find((x) => x === 'nom' || x === 'prenom');
    const texte = (s: string) => (avatar ? <span className="inline"><Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={26} /> {s}</span> : s);
    if (k === 'nom' || k === 'prenom') return texte(m[k]);
    if (m.masque && (k === 'email' || k === 'telephone' || k === 'iban')) return <Masque />;
    if (k === 'email' || k === 'telephone') return m[k];
    if (k === 'iban') return <span className="mono">{ibanCourt(m.iban)}</span>;
    if (k === 'etiquettes') return etiquettesDe(m).map((e) => <span key={e.id} className="badge etiquette" style={{ background: e.couleur }}>{e.nom}</span>);
    if (k === 'roles') return rolesDe(m).map((r) => <span key={r.id} className="badge" style={{ background: r.couleur }}>{r.label}</span>);
    return fiche(m)?.poste ?? '';
  };

  return (
    <div>
      <div className="page-head">
        <h1>Personnes du club{list && <small className="muted"> · {list.length}</small>}</h1>
        {list && (
          <span className="row wrap">
            <button className="btn" onClick={() => setReglerColonnes(true)}><Icone n="colonnes" /> Colonnes</button>
            {gerer && <button className="btn" onClick={() => setImporter(true)}><Icone n="importer" /> Importer</button>}
            <button className="btn" disabled={!vus.length} onClick={exporter}><Icone n="exporter" /> Exporter</button>
            {gerer && <button className="btn primary" onClick={() => setEdit(nouveauMembre({}))}>+ Nouvelle personne</button>}
          </span>
        )}
      </div>
      <p className="muted">
        Les personnes du club : une fiche par personne, avec ou sans accès à l’appli (licenciés, parents, bénévoles…). Prénom, nom, email
        et téléphone sont les mêmes partout : modifiés ici, ils changent partout. Clic sur une personne : sa fiche, avec ses rôles et ses
        étiquettes dans l’appli{gerer ? '' : ' (en lecture)'}.
        {!coords && ' Les coordonnées sont visibles avec le droit « voir les coordonnées ».'}
        {caisse ? ' L’IBAN n’est visible que des caissiers ; chacun enregistre le sien dans ses Réglages.' : ''} Chacun peut masquer ses
        données personnelles dans cette liste (Réglages).
      </p>
      {err && <p className="error">{err}</p>}
      {!list && !err && <p className="muted">Chargement…</p>}
      {list && (
        <>
          <div className="filters open">
            <input className="search" type="search" placeholder="Rechercher un nom, un email, un téléphone, un poste…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Filtrer">
              <option value="">Toutes les personnes ({list.length})</option>
              <option value="appli">Avec une fiche dans l’appli</option>
              <option value="sans">Sans fiche dans l’appli</option>
              {data.roles.length > 0 && (
                <optgroup label="Rôle">
                  {data.roles.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.label}</option>)}
                </optgroup>
              )}
              {etiquettes.length > 0 && (
                <optgroup label="Étiquette">
                  {etiquettes.map((e) => <option key={e.id} value={`e:${e.id}`}>{e.nom}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="table-scroll">
            <table className="table membres-table">
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
                  <tr key={m.id} onClick={() => setEdit(m)}>
                    {cols.visibles.map((k) => <td key={k}>{cellule(m, k)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!vus.length && <p className="muted">{list.length ? 'Personne ne correspond.' : 'La liste est vide : ajoute une personne ou importe un fichier.'}</p>}
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
          lecture={!gerer}
          onSave={(m) => enregistrer([m])}
          onDelete={async (id) => {
            await club.deleteMembre(id);
            await load();
          }}
          onClose={() => setEdit(null)}
        />
      )}
      {importer && list && (
        <Modal title="Importer des personnes du club" wide onClose={() => setImporter(false)}>
          <ImportCsv
            colonnes={COLS_REGISTRE}
            modele="modele-membres-du-club.csv"
            aide={<p className="muted">Une ligne par personne. Une personne déjà inscrite (même email, sinon même prénom et nom) est mise à jour : les cellules remplies remplacent ses valeurs, les cellules vides ne changent rien. Pas d’IBAN : chacun enregistre le sien dans ses Réglages.</p>}
            analyser={(lignes) => analyserRegistre(lignes, list)}
            appliquer={async (vals) => {
              const maj = derniers(vals);
              await enregistrer(maj);
              return `${maj.length} personne${maj.length > 1 ? 's' : ''} enregistrée${maj.length > 1 ? 's' : ''} dans la liste du club.`;
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

function MembreModal({ membre, list, lecture, onSave, onDelete, onClose }: {
  membre: ClubMembre;
  list: ClubMembre[];
  /** Sans le droit « Gérer les personnes » : la fiche en lecture. */
  lecture: boolean;
  onSave: (m: ClubMembre) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const club = useClub();
  const { cloud, data } = useStore();
  const [v, setV] = useState<ClubMembre>(membre);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const nouveau = !list.some((m) => m.id === membre.id);
  const fiche = ficheDe(membre, data.people);
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
    void run(() => onSave({ ...nouveauMembre(v), ...(v.groupes?.length ? { groupes: v.groupes } : {}), iban: membre.iban }));
  };
  return (
    <Modal title={nouveau ? 'Nouvelle personne du club' : nomMembre(membre)} onClose={onClose}>
      {membre.masque && (
        <p className="lien-note">🔒 {nomMembre(membre)} a masqué ses données personnelles : son email et son téléphone ne s’affichent pas ici et ne s’y modifient pas.</p>
      )}
      <fieldset className="form" disabled={lecture}>
        <label>Prénom<input value={v.prenom} onChange={(e) => set({ prenom: e.target.value })} /></label>
        <label>Nom<input value={v.nom} onChange={(e) => set({ nom: e.target.value })} /></label>
        {!membre.masque && (!lecture || v.email || v.telephone) && (
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
      </fieldset>
      {!nouveau && cloud && !lecture && <CompteDuClub clubId={club.espace.id} membre={membre} />}
      {!nouveau && <FicheAppli membre={membre} fiche={fiche} />}
      {nouveau && <p className="muted small-note">Une fois la fiche enregistrée, ouvre-la pour donner à la personne une fiche dans l’appli (rôle, étiquettes).</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!nouveau && !lecture && (
          <button
            className="btn danger"
            disabled={busy || !!membre.moi}
            title={membre.moi ? 'Pas toi-même' : ''}
            onClick={() =>
              confirm(`Retirer ${nomMembre(membre)} du club ?${fiche?.actif ? ' Sa fiche dans l’appli est désactivée et son accès retiré.' : ''} Ses points gardent son nom.`) && void run(() => onDelete(membre.id))
            }
          >
            Retirer du club
          </button>
        )}
        <span className="grow" />
        <button className="btn" onClick={onClose}>{lecture ? 'Fermer' : 'Annuler'}</button>
        {!lecture && <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>}
      </div>
    </Modal>
  );
}

/**
 * Sa fiche dans l'appli : son poste, ses rôles (admins), ses étiquettes (droit « Gérer sections, statuts et étiquettes »),
 * ou de quoi lui en donner une (droit « Gérer les personnes », rôle « Membre » d'office) ; la retirer (désactivée : ses
 * tâches gardent son nom) ou la réactiver.
 */
function FicheAppli({ membre, fiche }: { membre: ClubMembre; fiche?: Person }) {
  const club = useClub();
  const { data, can, update, user } = useStore();
  const [msg, setMsg] = useState('');
  const admin = can('admin.access');
  const gererEtiquettes = can('settings.lists');
  const gerer = club.personnes.gerer || can('people.manage');
  const etiquettes = data.etiquettes ?? [];
  const admins = data.people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));
  const nom = nomMembre(membre);
  const changer = (f: (p: Person) => Person, action: string, ok: string) => {
    if (!fiche) return;
    update((d) => {
      d.people = d.people.map((p) => (p.id === fiche.id ? f(p) : p));
    }, action);
    setMsg(ok);
  };
  const donner = () => {
    if (fiche) return changer((p) => ({ ...p, actif: true }), `${nom} réactivé(e) dans l’appli`, `✅ ${nom} a de nouveau une fiche active.`);
    const p: Person = { id: uid('p'), prenom: membre.prenom, nom: membre.nom, email: membre.email, telephone: membre.telephone, couleur: membre.couleur, poste: '', roles: [defaultRoleId(data.roles)], actif: true, membreId: membre.id };
    update((d) => {
      d.people.push(p);
      // Son nom noté sur des tâches (« Quelqu'un d'autre ») : elle en devient responsable, avec sa fiche.
      d.tasks.forEach((t) => {
        if (!t.respHors?.some((y) => y.membreId === membre.id)) return;
        const reste = t.respHors.filter((y) => y.membreId !== membre.id);
        t.responsables = [...new Set([...t.responsables, p.id])];
        t.respHors = reste.length ? reste : undefined;
      });
    }, `${nom} ajouté(e) dans l’appli`);
    setMsg(`✅ ${nom} a une fiche dans l’appli (rôle « ${data.roles.find((r) => r.id === p.roles[0])?.label ?? ''} »).`);
  };
  if (!fiche?.actif) {
    return (
      <div className="acces-membre">
        <span className="field-label">Dans l’appli</span>
        <p className="muted small-note">{fiche ? 'Fiche désactivée : ses points gardent son nom.' : 'Pas de fiche dans l’appli : on peut noter son nom sur un point (« Quelqu’un d’autre »), sans qu’elle le voie.'}</p>
        {gerer && <button className="btn small primary" onClick={donner}>{fiche ? 'Réactiver sa fiche' : 'Lui donner une fiche dans l’appli'}</button>}
        {msg && <p className="ok-note">{msg}</p>}
      </div>
    );
  }
  const soi = fiche.id === user?.id;
  const dernierAdmin = fiche.roles.includes(ADMIN_ROLE_ID) && admins.length <= 1;
  return (
    <div className="acces-membre">
      <span className="field-label">Dans l’appli</span>
      <label className="inline">
        Poste
        <input defaultValue={fiche.poste} disabled={!gerer} aria-label="Poste"
          onBlur={(e) => { const x = e.target.value.trim(); if (x !== fiche.poste) changer((p) => ({ ...p, poste: x }), `${nom} : poste « ${x} »`, '✅ Poste enregistré.'); }} />
      </label>
      <div>
        <small className="muted">Rôles{admin ? '' : ' (réglés par les admins)'} :</small>
        <div className="chips">
          {data.roles.map((r) => {
            const on = fiche.roles.includes(r.id);
            // Garde-fous : le rôle Admin ne se retire ni à soi-même ni au dernier admin ; au moins un rôle.
            const bloque = !admin || (on && fiche.roles.length === 1) || (r.id === ADMIN_ROLE_ID && on && (soi || dernierAdmin));
            return (
              <button key={r.id} type="button" className={`chip role-chip ${on ? 'on' : ''}`} style={on ? { background: r.couleur, borderColor: r.couleur } : {}} disabled={bloque} aria-pressed={on}
                onClick={() => changer((p) => ({ ...p, roles: on ? p.roles.filter((x) => x !== r.id) : [...p.roles, r.id] }), `${nom} : rôles modifiés`, '✅ Rôles enregistrés.')}>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      {etiquettes.length > 0 && (
        <div>
          <small className="muted">Étiquettes (elle en voit les points){gererEtiquettes ? '' : ' :'}</small>
          <div className="chips">
            {etiquettes.map((e) => {
              const on = !!e.membres?.includes(fiche.id);
              return (
                <button key={e.id} type="button" className={`chip ${on ? 'on' : ''}`} style={on ? { background: e.couleur, borderColor: e.couleur } : { borderColor: e.couleur }} disabled={!gererEtiquettes} aria-pressed={on}
                  onClick={() => {
                    update((d) => {
                      d.etiquettes = (d.etiquettes ?? []).map((x) => (x.id !== e.id ? x : { ...x, membres: on ? (x.membres ?? []).filter((y) => y !== fiche.id) : [...(x.membres ?? []), fiche.id] }));
                    }, `Étiquette « ${e.nom} » : ${nom} ${on ? 'retiré(e)' : 'ajouté(e)'}`);
                    setMsg('✅ Étiquettes enregistrées.');
                  }}>
                  {e.nom}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {gerer && (
        <div className="row wrap">
          <span className="grow" />
          <button className="btn small danger" disabled={soi || dernierAdmin} title={soi ? 'Pas toi-même' : dernierAdmin ? 'Il reste toujours au moins un admin' : ''}
            onClick={() => confirm(`Désactiver la fiche de ${nom} dans l’appli ? Ses points gardent son nom ; tu pourras la réactiver d’ici.`) && changer((p) => ({ ...p, actif: false }), `${nom} désactivé(e) dans l’appli`, `✅ Fiche de ${nom} désactivée.`)}>
            Désactiver sa fiche
          </button>
        </div>
      )}
      {msg && <p className="ok-note">{msg}</p>}
    </div>
  );
}
