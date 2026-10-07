import { useCallback, useEffect, useMemo, useState } from 'react';
import { useClub } from '../data/club';
import { downloadCsv, norm } from '../data/csv';
import { COLS_REGISTRE, analyserRegistre, derniers } from '../data/imports';
import { compactIban, emailKey, formatIban, groupesClub, ibanValide, nomMembre, nouveauMembre, postesDe } from '../data/membres';
import { UNIT_TYPES } from '../data/units';
import type { ClubMembre } from '../data/types';
import { Initials, Modal } from '../components/ui';
import { ImportCsv } from '../components/ImportCsv';

// Membres du club : registre commun à toutes les entités (une fiche par personne, avec ou sans accès à l'appli).
// Réservé au droit « Membres du club » (Admin, Secrétaire…) et aux admins des entités.

const ibanCourt = (s: string) => {
  const c = compactIban(s);
  return c ? `${c.slice(0, 4)} … ${c.slice(-4)}` : '';
};

export function MembresClub() {
  const club = useClub();
  const [list, setList] = useState<ClubMembre[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('');
  const [edit, setEdit] = useState<ClubMembre | null>(null);
  const [importer, setImporter] = useState(false);
  const { membres } = club;
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

  const units = club.units;
  const groupes = groupesClub(units);
  const postes = useMemo(() => {
    const actives = units.filter((u) => !u.archive);
    return new Map((list ?? []).map((m) => [m.id, postesDe(m, actives)]));
  }, [list, units]);
  const enregistrer = async (maj: ClubMembre[]) => {
    await club.saveMembres(maj);
    await load();
  };

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
    .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));

  const exporter = () =>
    downloadCsv('membres-du-club.csv', [
      ['Prénom', 'Nom', 'Email', 'Téléphone', 'IBAN', 'Groupes', 'Postes'],
      ...vus.map((m) => [
        m.prenom,
        m.nom,
        m.email,
        m.telephone,
        formatIban(m.iban),
        m.groupes.map((g) => units.find((u) => u.id === g)?.nom).filter(Boolean).join(', '),
        (postes.get(m.id) ?? []).map((p) => `${p.unit.nom}${p.member.poste ? ` (${p.member.poste})` : ''}`).join(', '),
      ]),
    ]);

  return (
    <div>
      <div className="page-head">
        <h1>Membres du club{list && <small className="muted"> · {list.length}</small>}</h1>
        {list && (
          <span className="row wrap">
            <button className="btn" onClick={() => setImporter(true)}>📥 Importer</button>
            <button className="btn" disabled={!vus.length} onClick={exporter}>📤 Exporter</button>
            <button className="btn primary" onClick={() => setEdit(nouveauMembre({}))}>+ Nouveau membre</button>
          </span>
        )}
      </div>
      <p className="muted">
        Une fiche par personne pour tout le club, avec ou sans accès à l’appli (licenciés, parents, bénévoles…). Prénom, nom, email et
        téléphone sont les mêmes dans toutes les entités où la personne a un poste : modifiés ici, ils changent partout. Le poste, les rôles et
        l’accès à l’appli se règlent dans chaque entité, depuis l’organigramme (clic sur une personne, ou « ✏️ Modifier l’organigramme » puis « + Ajouter une personne » sous l’entité).
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
            <table className="table membres-table">
              <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>IBAN</th><th>Groupes</th><th>Postes</th></tr></thead>
              <tbody>
                {vus.map((m) => (
                  <tr key={m.id} onClick={() => setEdit(m)}>
                    <td><span className="inline"><Initials prenom={m.prenom} nom={m.nom} couleur={m.couleur} size={26} /> {nomMembre(m)}</span></td>
                    <td>{m.email}</td>
                    <td>{m.telephone}</td>
                    <td className="mono">{ibanCourt(m.iban)}</td>
                    <td>{m.groupes.map((g) => units.find((u) => u.id === g)).filter((u) => !!u).map((u) => <span key={u!.id} className="badge" style={{ background: u!.couleur }}>{u!.nom}</span>)}</td>
                    <td><small>{(postes.get(m.id) ?? []).map((p) => `${UNIT_TYPES[p.unit.type].icon} ${p.unit.nom}${p.member.poste ? ` · ${p.member.poste}` : ''}`).join('  ')}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!vus.length && <p className="muted">{list.length ? 'Aucun membre ne correspond.' : 'Le registre est vide : ajoute un membre ou importe un fichier.'}</p>}
        </>
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
            aide={<p className="muted">Une ligne par personne. Une personne déjà inscrite (même email, sinon même prénom et nom) est mise à jour : les cellules remplies remplacent ses valeurs, les cellules vides ne changent rien.</p>}
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

function MembreModal({ membre, list, postes, onSave, onDelete, onClose }: {
  membre: ClubMembre;
  list: ClubMembre[];
  postes: ReturnType<typeof postesDe>;
  onSave: (m: ClubMembre) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const club = useClub();
  const [v, setV] = useState<ClubMembre>({ ...membre, iban: formatIban(membre.iban) });
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
    if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) return setErr('Adresse email invalide.');
    const autre = v.email.trim() && list.find((m) => m.id !== v.id && emailKey(m.email) === emailKey(v.email));
    if (autre) return setErr(`Cette adresse est déjà celle de ${nomMembre(autre)}.`);
    if (!ibanValide(v.iban)) return setErr('IBAN invalide : vérifie-le (longueur et chiffres de contrôle).');
    void run(() => onSave(nouveauMembre({ ...v, iban: compactIban(v.iban) })));
  };
  return (
    <Modal title={nouveau ? 'Nouveau membre du club' : nomMembre(membre)} onClose={onClose}>
      <div className="form">
        <label>Prénom<input value={v.prenom} onChange={(e) => set({ prenom: e.target.value })} /></label>
        <label>Nom<input value={v.nom} onChange={(e) => set({ nom: e.target.value })} /></label>
        <label>Adresse email<input type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label>Téléphone portable<input type="tel" value={v.telephone} onChange={(e) => set({ telephone: e.target.value })} /></label>
        <label className="full">
          IBAN
          <input className="mono" value={v.iban} placeholder="CH00 0000 0000 0000 0000 0" onChange={(e) => set({ iban: e.target.value })} onBlur={() => set({ iban: formatIban(v.iban) })} />
          {!ibanValide(v.iban) && <small className="error">IBAN invalide</small>}
        </label>
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
      {!nouveau && (
        <p className="muted">
          {postes.length
            ? <>Postes : {postes.map((p) => `${UNIT_TYPES[p.unit.type].icon} ${p.unit.nom}${p.member.poste ? ` · ${p.member.poste}` : ''}`).join(' · ')}</>
            : 'Aucun poste dans une entité du club (pas d’accès à l’appli).'}
        </p>
      )}
      <p className="muted small-note">Pour lui donner un poste et un accès à l’appli : dans l’organigramme, « ✏️ Modifier l’organigramme » puis « + Ajouter une personne » sous l’entité.</p>
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
