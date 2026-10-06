import { Fragment, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { PERMISSIONS, PERMISSION_GROUPS } from '../data/permissions';
import type { Permission, Role } from '../data/types';
import { fmtDateTime, fullName, uid } from '../data/utils';
import { Modal } from '../components/ui';
import { useClubOptional } from '../data/club';
import { ImportsEntite } from '../components/ImportsEntite';
import { CentralAccessPanel } from '../components/CentralAccess';
import { LogoPanel } from '../components/LogoPanel';
import { PageIntro, useChemin } from '../components/Nav';
import { CENTRAL_ACCESS, centralAccess } from '../data/units';
import { COULEURS_APPLI } from '../data/couleur';

type Partie = { id: string; icon: string; titre: string; carte: string; aide: string; resume: string; contenu: ReactNode };

/** Console admin : une page d'accueil qui explique chaque partie, puis une adresse par partie (/admin/droits…). */
export function Admin() {
  const { partie } = useParams();
  const { data, prefs } = useStore();
  const club = useClubOptional();
  const chemin = useChemin();
  const u = club?.current;
  const central = !u || u.type === 'central';
  // Sous-comité, groupe ou équipe : ce que le comité central peut faire de ses données.
  const sub = !!u && !central;
  const personnes = chemin('/organigramme');

  const couleur = u?.couleurAppli ?? (sub ? club?.central?.couleurAppli : undefined);
  const nomCouleur = couleur ? COULEURS_APPLI.find((x) => x.c === couleur.toLowerCase())?.nom.toLowerCase() ?? 'personnalisée' : 'bleu d’origine';
  const parties: Partie[] = [
    {
      id: 'droits',
      icon: '🔑',
      titre: 'Rôles et droits',
      carte: `Ce que chaque rôle (Secrétaire, Caissier…) permet de voir et de faire${sub ? ', et l’accès du comité central' : ''}.`,
      aide: `Chaque personne reçoit un ou plusieurs rôles (Secrétaire, Caissier…) dans sa fiche${personnes ? ` (${personnes} : clic sur son poste)` : ''} ; ici, tu coches ce que chaque rôle permet de voir et de faire.${sub ? ' Et ce que le comité central peut faire des données de l’entité.' : ''}`,
      resume: `${data.roles.length} rôles${u && sub ? ` · comité central : ${CENTRAL_ACCESS[centralAccess(u)].label.toLowerCase()}` : ''}`,
      contenu: (
        <>
          {sub && <CentralAccessPanel />}
          {sub && <h2>Rôles de l’entité</h2>}
          <Roles />
        </>
      ),
    },
    {
      id: 'taches',
      icon: '🗂️',
      titre: 'Sections et statuts',
      carte: 'Le rangement des tâches (sections, sous-sections) et leurs étapes (À faire, En cours…).',
      aide: 'Comment les tâches sont rangées (sections et sous-sections, reprises dans l’ordre du jour et le PV) et leurs étapes (À faire, En cours, Terminé…).',
      resume: `${data.sections.length} sections · ${data.statuses.length} statuts`,
      contenu: <Lists />,
    },
    ...(u
      ? [
          {
            id: 'apparence',
            icon: '🎨',
            titre: 'Apparence',
            carte: central ? 'Logo, couleur, nom et icône de l’appli.' : 'Logo de l’entité et couleur de l’appli.',
            aide: central
              ? 'Logo et couleur de l’appli pour tout le club, et le nom et l’icône de l’appli installée sur les téléphones.'
              : 'Logo de l’entité (en-tête de l’appli, documents) et couleur de l’appli quand elle est ouverte.',
            resume: `${u.logo ? 'Logo choisi' : central ? 'Pas de logo' : 'Logo du club'} · couleur ${nomCouleur}`,
            contenu: <LogoPanel />,
          },
        ]
      : []),
    {
      id: 'import',
      icon: '📥',
      titre: 'Importer un fichier',
      carte: 'Ajouter d’un coup des personnes, des tâches ou des événements depuis un tableur.',
      aide: 'Ajouter d’un coup des personnes, des tâches ou des événements depuis un tableur (fichier CSV, avec un modèle à télécharger).',
      resume: 'Personnes, tâches, événements',
      contenu: <ImportsEntite />,
    },
    {
      id: 'historique',
      icon: '🕓',
      titre: 'Historique',
      carte: 'Qui a fait quoi, et quand.',
      aide: 'Toutes les modifications faites dans l’entité : qui a fait quoi, et quand.',
      resume: data.log[0] ? `Dernière : ${fmtDateTime(data.log[0].at)}` : 'Aucune modification',
      contenu: <Log />,
    },
  ];
  const ouverte = parties.find((x) => x.id === partie);
  if (partie && !ouverte) return <Navigate to="/admin" replace />;

  if (ouverte)
    return (
      <div>
        <p className="admin-retour no-print">
          <Link to="/admin">‹ Console admin</Link>
        </p>
        <h1>{ouverte.icon} {ouverte.titre}</h1>
        {prefs.explications !== false && <p className="page-intro">{ouverte.aide}</p>}
        {ouverte.contenu}
      </div>
    );

  return (
    <div>
      <h1>Console admin</h1>
      <PageIntro />
      <div className="admin-cartes">
        {personnes && (
          <Link to="/organigramme" className="panel admin-carte">
            <span className="admin-carte-icone" aria-hidden>👥</span>
            <span>
              <b>Personnes et accès</b>
              <span className="muted">« + Ajouter une personne » sous l’entité ; un clic sur un poste ouvre la fiche : poste, rôle, accès à l’appli.</span>
              <small>Dans {personnes} · {data.people.filter((x) => x.actif).length} personnes</small>
            </span>
          </Link>
        )}
        {parties.map((x) => (
          <Link key={x.id} to={`/admin/${x.id}`} className="panel admin-carte">
            <span className="admin-carte-icone" aria-hidden>{x.icon}</span>
            <span>
              <b>{x.titre}</b>
              <span className="muted">{x.carte}</span>
              <small>{x.resume}</small>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Roles() {
  const { data, update } = useStore();
  const [edit, setEdit] = useState<{ role: Role; isNew: boolean } | null>(null);
  const [creating, setCreating] = useState(false);

  const togglePerm = (r: Role, perm: Permission, label: string) => {
    const on = r.permissions.includes(perm);
    update((d) => {
      const x = d.roles.find((y) => y.id === r.id)!;
      x.permissions = on ? x.permissions.filter((p) => p !== perm) : [...x.permissions, perm];
    }, `Droit « ${label} » ${on ? 'retiré au' : 'accordé au'} rôle ${r.label}`);
  };

  const scope = (r: Role) =>
    r.sections.length === 0 ? 'Toutes sections' : r.sections.map((id) => data.sections.find((s) => s.id === id)?.nom).filter(Boolean).join(', ');

  return (
    <>
      <div className="page-head">
        <p className="muted" style={{ margin: 0 }}>Clique sur le nom d’un rôle pour le renommer, limiter ses sections, le dupliquer ou le supprimer.</p>
        <button className="btn primary" onClick={() => setCreating(true)}>+ Nouveau rôle</button>
      </div>
      <div className="table-scroll">
        <table className="table matrix">
          <thead>
            <tr>
              <th>Droit</th>
              {data.roles.map((r) => (
                <th key={r.id} className="center">
                  <button className="role-head" onClick={() => setEdit({ role: r, isNew: false })}>
                    <span className="dot" style={{ background: r.couleur }} />
                    {r.label} {r.locked ? '🔒' : '✎'}
                  </button>
                  <small className="scope">{scope(r)}</small>
                  <small className="scope">{data.people.filter((p) => p.roles.includes(r.id)).length} pers.</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <Fragment key={g}>
                <tr className="group-row"><td colSpan={data.roles.length + 1}>{g}</td></tr>
                {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                  <tr key={p.id}>
                    <td>{p.label}{p.sectionScoped && <small className="muted"> ¹</small>}</td>
                    {data.roles.map((r) => (
                      <td key={r.id} className="center">
                        <input type="checkbox" aria-label={`${p.label} – ${r.label}`} checked={r.locked || r.permissions.includes(p.id)} disabled={r.locked} onChange={() => togglePerm(r, p.id, p.label)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">¹ Ces droits ne s’appliquent qu’aux sections du rôle. Chacun voit et modifie toujours les tâches dont il est responsable (selon « ses propres tâches »). Les changements s’appliquent immédiatement : change d’utilisateur pour tester. Le rôle Admin est verrouillé.</p>

      {creating && (
        <NewRole
          onClose={() => setCreating(false)}
          onCreate={(label, base) => {
            const src = data.roles.find((r) => r.id === base);
            const role: Role = { id: uid('r'), label, couleur: '#0f766e', permissions: src ? [...src.permissions].filter((p) => p !== 'admin.access') : [], sections: src ? [...src.sections] : [] };
            update((d) => { d.roles.push(role); }, `Création du rôle « ${label} »${src ? ` (copie de ${src.label})` : ''}`);
            setCreating(false);
          }}
        />
      )}
      {edit && <RoleModal role={edit.role} onClose={() => setEdit(null)} />}
    </>
  );
}

function NewRole({ onClose, onCreate }: { onClose: () => void; onCreate: (label: string, base: string) => void }) {
  const { data } = useStore();
  const [label, setLabel] = useState('');
  const [base, setBase] = useState('comite');
  const exists = data.roles.some((r) => r.label.toLowerCase() === label.trim().toLowerCase());
  return (
    <Modal title="Nouveau rôle" onClose={onClose}>
      <div className="form">
        <label className="full">
          Nom du rôle
          <input autoFocus value={label} placeholder="ex. Vérificateur des comptes, Coach, Bénévole buvette…" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="full">
          Droits de départ
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">Aucun droit (à cocher ensuite)</option>
            {data.roles.map((r) => <option key={r.id} value={r.id}>Copie de « {r.label} »</option>)}
          </select>
        </label>
      </div>
      {exists && <p className="error">Un rôle porte déjà ce nom.</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!label.trim() || exists} onClick={() => onCreate(label.trim(), base)}>Créer</button>
      </div>
    </Modal>
  );
}

function RoleModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { data, update } = useStore();
  const [label, setLabel] = useState(role.label);
  const [couleur, setCouleur] = useState(role.couleur);
  const [sections, setSections] = useState<string[]>(role.sections);
  const members = data.people.filter((p) => p.roles.includes(role.id));
  const lock = !!role.locked;

  const save = () => {
    if (!label.trim()) return;
    update((d) => {
      const x = d.roles.find((y) => y.id === role.id)!;
      x.label = label.trim();
      x.couleur = couleur;
      if (!lock) x.sections = sections;
    }, `Modification du rôle « ${label.trim()} »`);
    onClose();
  };
  const duplicate = () => {
    update((d) => {
      d.roles.push({ ...structuredClone(role), id: uid('r'), label: `${role.label} (copie)`, locked: false, permissions: role.permissions.filter((p) => p !== 'admin.access') });
    }, `Duplication du rôle « ${role.label} »`);
    onClose();
  };
  const remove = () => {
    if (!confirm(`Supprimer le rôle « ${role.label} » ?`)) return;
    update((d) => { d.roles = d.roles.filter((r) => r.id !== role.id); }, `Suppression du rôle « ${role.label} »`);
    onClose();
  };
  const toggleSection = (id: string) => setSections(sections.includes(id) ? sections.filter((x) => x !== id) : [...sections, id]);

  return (
    <Modal title={`Rôle : ${role.label}`} onClose={onClose}>
      <div className="form">
        <label className="full">
          Nom du rôle
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label>
          Couleur
          <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)} />
        </label>
        <fieldset className="full">
          <legend>Sections couvertes par les droits « Tâches »</legend>
          {lock ? (
            <small className="muted">Le rôle Admin couvre toujours toutes les sections.</small>
          ) : (
            <>
              <label className="inline">
                <input type="checkbox" checked={sections.length === 0} onChange={() => setSections(sections.length === 0 ? [data.sections[0]?.id].filter(Boolean) : [])} />
                Toutes les sections
              </label>
              {sections.length > 0 && (
                <div className="chips">
                  {data.sections.map((s) => (
                    <button key={s.id} type="button" className={`chip ${sections.includes(s.id) ? 'on' : ''}`} onClick={() => toggleSection(s.id)}>{s.nom}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>
        <div className="full">
          <small className="muted">Attribué à : {members.length ? members.map((p) => fullName(p)).join(', ') : 'personne'}</small>
        </div>
      </div>
      <div className="modal-foot">
        {!lock && (
          <button className="btn danger" disabled={members.length > 0} title={members.length ? 'Retire d’abord ce rôle aux personnes concernées (rubrique Personnes)' : ''} onClick={remove}>
            Supprimer
          </button>
        )}
        <button className="btn" onClick={duplicate}>Dupliquer</button>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!label.trim()} onClick={save}>Enregistrer</button>
      </div>
      {!lock && members.length > 0 && <p className="muted">Suppression possible une fois le rôle retiré à toutes les personnes.</p>}
    </Modal>
  );
}

function Lists() {
  const { data, update, setToast } = useStore();
  const [newSec, setNewSec] = useState('');
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [newStatus, setNewStatus] = useState('');

  const addSection = () => {
    if (!newSec.trim()) return;
    update((d) => { d.sections.push({ id: uid('sec'), nom: newSec.trim(), sousSections: [] }); }, `Ajout de la section « ${newSec.trim()} »`);
    setNewSec('');
  };

  // Sous-sections : renommer (les tâches suivent) et changer l'ordre (listes de choix, ordre du jour, PV).
  const renameSub = (secId: string, old: string, input: HTMLInputElement) => {
    const v = input.value.trim();
    const sec = data.sections.find((x) => x.id === secId);
    if (!sec || !v || v === old) return void (input.value = old);
    if (sec.sousSections.includes(v)) {
      input.value = old;
      return setToast(`« ${v} » existe déjà dans ${sec.nom}`);
    }
    const n = data.tasks.filter((t) => t.sectionId === secId && t.sousSection === old).length;
    update((d) => {
      const x = d.sections.find((y) => y.id === secId)!;
      x.sousSections = x.sousSections.map((y) => (y === old ? v : y));
      d.tasks.forEach((t) => { if (t.sectionId === secId && t.sousSection === old) t.sousSection = v; });
    }, `Sous-section « ${old} » (${sec.nom}) renommée en « ${v} »${n ? ` · ${n} tâche(s)` : ''}`);
  };
  const moveSub = (secId: string, i: number, dir: -1 | 1) =>
    update((d) => {
      const l = d.sections.find((y) => y.id === secId)!.sousSections;
      const j = i + dir;
      if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]];
    }, `Ordre des sous-sections de ${data.sections.find((x) => x.id === secId)?.nom ?? ''} modifié`);

  return (
    <div className="grid2">
      <section>
        <h2>Sections & sous-sections</h2>
        {data.sections.map((s) => {
          const used = data.tasks.filter((t) => t.sectionId === s.id).length;
          return (
            <div key={s.id} className="panel">
              <div className="row">
                <input className="grow" defaultValue={s.nom} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.nom) update((d) => { d.sections.find((x) => x.id === s.id)!.nom = v; }, `Section « ${s.nom} » renommée en « ${v} »`); }} />
                <button className="btn small danger" disabled={used > 0} title={used ? `${used} tâche(s) utilisent cette section` : ''} onClick={() => update((d) => { d.sections = d.sections.filter((x) => x.id !== s.id); }, `Suppression de la section « ${s.nom} »`)}>Supprimer</button>
              </div>
              {s.sousSections.length > 0 && (
                <ul className="sub-list">
                  {s.sousSections.map((ss, i) => {
                    const n = data.tasks.filter((t) => t.sectionId === s.id && t.sousSection === ss).length;
                    return (
                      <li key={`${i}-${ss}`}>
                        <button className="icon-btn" disabled={i === 0} onClick={() => moveSub(s.id, i, -1)} aria-label={`Monter ${ss}`}>▲</button>
                        <button className="icon-btn" disabled={i === s.sousSections.length - 1} onClick={() => moveSub(s.id, i, 1)} aria-label={`Descendre ${ss}`}>▼</button>
                        <input
                          className="grow"
                          defaultValue={ss}
                          aria-label={`Nom de la sous-section ${ss}`}
                          onBlur={(e) => renameSub(s.id, ss, e.target)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        {n > 0 && <small className="muted" title={`${n} tâche(s) dans cette sous-section`}>{n}</small>}
                        <button
                          className="chip-x"
                          aria-label={`Retirer ${ss}`}
                          title={n ? `${n} tâche(s) gardent ce nom de sous-section` : 'Retirer'}
                          onClick={() => update((d) => { const x = d.sections.find((y) => y.id === s.id)!; x.sousSections = x.sousSections.filter((y) => y !== ss); }, `Suppression de la sous-section « ${ss} »`)}
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="row">
                <input placeholder="Nouvelle sous-section" value={newSub[s.id] ?? ''} onChange={(e) => setNewSub({ ...newSub, [s.id]: e.target.value })} />
                <button className="btn small" onClick={() => { const v = (newSub[s.id] ?? '').trim(); if (!v) return; update((d) => { d.sections.find((x) => x.id === s.id)!.sousSections.push(v); }, `Ajout de la sous-section « ${v} » à ${s.nom}`); setNewSub({ ...newSub, [s.id]: '' }); }}>Ajouter</button>
              </div>
            </div>
          );
        })}
        <div className="row">
          <input placeholder="Nouvelle section" value={newSec} onChange={(e) => setNewSec(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSection()} />
          <button className="btn primary" onClick={addSection}>Ajouter la section</button>
        </div>
      </section>
      <section>
        <h2>Types de statut</h2>
        {data.statuses.map((s, i) => {
          const used = data.tasks.filter((t) => t.statusId === s.id).length;
          return (
            <div key={s.id + s.label} className="panel row">
              <input type="color" value={s.couleur} onChange={(e) => update((d) => { d.statuses[i].couleur = e.target.value; }, `Couleur du statut « ${s.label} » modifiée`)} />
              <input className="grow" defaultValue={s.label} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) update((d) => { d.statuses[i].label = v; }, `Statut « ${s.label} » renommé en « ${v} »`); }} />
              <label className="inline" title="Une tâche dans ce statut est considérée comme terminée">
                <input type="checkbox" checked={s.done} onChange={() => update((d) => { d.statuses[i].done = !s.done; }, `Statut « ${s.label} » : terminé = ${!s.done}`)} /> Clôture
              </label>
              <button className="icon-btn" disabled={i === 0} onClick={() => update((d) => { [d.statuses[i - 1], d.statuses[i]] = [d.statuses[i], d.statuses[i - 1]]; }, `Ordre des statuts modifié`)} aria-label="Monter">▲</button>
              <button className="btn small danger" disabled={used > 0 || data.statuses.length <= 2} title={used ? `${used} tâche(s) ont ce statut` : ''} onClick={() => update((d) => { d.statuses = d.statuses.filter((x) => x.id !== s.id); }, `Suppression du statut « ${s.label} »`)}>Supprimer</button>
            </div>
          );
        })}
        <div className="row">
          <input placeholder="Nouveau statut (ex. En attente)" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
          <button className="btn primary" onClick={() => { if (!newStatus.trim()) return; update((d) => { d.statuses.splice(d.statuses.length - 1, 0, { id: uid('s'), label: newStatus.trim(), couleur: '#9333ea', done: false }); }, `Ajout du statut « ${newStatus.trim()} »`); setNewStatus(''); }}>Ajouter</button>
        </div>
        <p className="muted">« En retard » n'est pas un statut : il est calculé automatiquement quand le délai est dépassé et que la tâche n'est pas clôturée.</p>
      </section>
    </div>
  );
}

function Log() {
  const { data } = useStore();
  return (
    <table className="table">
      <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th></tr></thead>
      <tbody>
        {data.log.map((l) => (
          <tr key={l.id}>
            <td className="nowrap">{fmtDateTime(l.at)}</td>
            <td className="nowrap">{fullName(data.people.find((p) => p.id === l.userId))}</td>
            <td>{l.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
