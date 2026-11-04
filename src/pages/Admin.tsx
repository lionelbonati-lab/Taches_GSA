import { Fragment, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { PERMISSIONS, PERMISSION_GROUPS } from '../data/permissions';
import type { Permission, Role } from '../data/types';
import { fmtDateTime, fullName, uid } from '../data/utils';
import { EXTERNE_COULEUR, EXTERNE_PERMS } from '../data/permissions';
import { Modal } from '../components/ui';
import { useClubOptional } from '../data/club';
import { ImportsClub } from '../components/ImportsClub';
import { LogoPanel } from '../components/LogoPanel';
import { renommerSousSection } from '../data/etiquettes';
import { Comite, GroupeSection } from '../components/ReglageEtiquette';
import { PageIntro } from '../components/Nav';
import { COULEURS_APPLI } from '../data/couleur';
import { EnteteReglage } from '../components/Entete';
import { defaultTexte, enteteDe, enteteRegle } from '../data/entete';
import { Icone, type IconeNom } from '../components/icones';
import { ErreursAppli } from '../components/ErreursAppli';
import { SauvegardeConsole } from '../components/SauvegardeConsole';
import { lastBackupAt } from '../data/backup';

type Partie = { id: string; icon: IconeNom; titre: string; carte: string; aide: string; resume: string; contenu: ReactNode };

/**
 * Console admin (menu du compte ; « Plus » sur téléphone) : une page d'accueil qui explique chaque partie, puis une
 * adresse par partie (/admin/droits…).
 */
export function Admin() {
  const { partie } = useParams();
  const { data, prefs } = useStore();
  const club = useClubOptional();
  const u = club?.espace;
  // Personnes : « Personnes du club » (leur fiche : rôles et accès).
  const personnes = !!club?.personnes.voir;

  // Couleur de l'appli, pour tout le monde.
  const couleur = u?.couleurAppli;
  const nomCouleur = couleur ? COULEURS_APPLI.find((x) => x.c === couleur.toLowerCase())?.nom.toLowerCase() ?? 'personnalisée' : 'bleu d’origine';
  const entete = enteteDe(data, defaultTexte());
  const enteteTexte = entete.texte.split('\n').map((l) => l.trim()).find(Boolean);
  const parties: Partie[] = [
    {
      id: 'droits',
      icon: 'cle' as const,
      titre: 'Rôles et droits',
      carte: 'Ce que chaque rôle (Secrétaire, Caissier…) permet de voir et de faire.',
      aide: `Chaque personne reçoit un ou plusieurs rôles (Secrétaire, Caissier…) dans sa fiche${personnes ? ' (« Personnes du club » : clic sur son nom)' : ''} ; ici, tu coches ce que chaque rôle permet de voir et de faire.`,
      resume: `${data.roles.length} rôles`,
      contenu: <Roles />,
    },
    {
      id: 'taches',
      icon: 'rangement' as const,
      titre: 'Sections, statuts et étiquettes',
      carte: 'Le rangement des points (sections, sous-sections), leurs étapes (À faire, En cours…) et leurs étiquettes (événements, groupes).',
      aide: 'Comment les points sont rangés (sections et sous-sections, reprises dans l’ordre du jour et le PV), leurs étapes (À faire, En cours, Terminé…) et leurs étiquettes : un événement (avec sa date) ou un groupe, dont les membres voient les points.',
      resume: `${data.sections.length} sections · ${data.statuses.length} statuts · ${data.etiquettes?.length ?? 0} étiquettes`,
      contenu: <Lists />,
    },
    ...(u
      ? [
          {
            id: 'apparence',
            icon: 'miseEnForme' as const,
            titre: 'Apparence',
            carte: 'Logo et couleur de l’appli ; nom et icône de l’appli installée.',
            aide: 'Logo et couleur de l’appli pour tout le club, et le nom et l’icône de l’appli installée sur les téléphones.',
            resume: `${u.logo ? 'Logo choisi' : 'Pas de logo'} · couleur ${nomCouleur}`,
            contenu: <LogoPanel />,
          },
        ]
      : []),
    {
      id: 'entete',
      icon: 'entete' as const,
      titre: 'En-tête des documents',
      carte: 'Le haut de page de l’ordre du jour, du PV et du bon de paiement : logo ou image, texte, couleur.',
      aide: 'Le même en-tête pour tous les documents imprimés : ordre du jour, PV et bon de paiement. Chacun les imprime avec cet en-tête.',
      resume: `${entete.image === 'logo' ? 'Logo' : entete.image === 'perso' ? 'Image propre' : 'Sans image'}${enteteTexte ? ` · « ${enteteTexte} »` : ''}${enteteRegle(data) ? '' : ' (par défaut)'}`,
      contenu: <EnteteReglage />,
    },
    {
      id: 'import',
      icon: 'importer' as const,
      titre: 'Importer un fichier',
      carte: 'Ajouter d’un coup des personnes, des points ou des événements depuis un tableur.',
      aide: 'Ajouter d’un coup des personnes, des points ou des événements depuis un tableur (fichier CSV, avec un modèle à télécharger).',
      resume: 'Personnes, points, événements',
      contenu: <ImportsClub />,
    },
    {
      id: 'historique',
      icon: 'historique' as const,
      titre: 'Historique',
      carte: 'Qui a fait quoi, et quand.',
      aide: 'Toutes les modifications faites dans l’appli : qui a fait quoi, et quand.',
      resume: data.log[0] ? `Dernière : ${fmtDateTime(data.log[0].at)}` : 'Aucune modification',
      contenu: <Log />,
    },
    {
      id: 'sauvegarde',
      icon: 'sauvegarde' as const,
      titre: 'Sauvegarde',
      carte: club?.sauvegardeClub ? 'Tout le club dans un seul fichier ; restaurer.' : 'Restaurer depuis une sauvegarde ou une copie du serveur.',
      aide: 'La sauvegarde de tout le club (ses données, leurs fichiers joints et « Personnes du club ») et la restauration, par les admins.',
      resume: lastBackupAt() ? `Dernière ici : ${fmtDateTime(lastBackupAt()!)}` : club?.sauvegardeClub ? 'Aucune depuis ce navigateur' : 'Restauration',
      contenu: <SauvegardeConsole />,
    },
    ...(club
      ? [
          {
            id: 'erreurs',
            icon: 'alerte' as const,
            titre: 'Erreurs de l’appli',
            carte: 'Les problèmes que l’appli a rencontrés chez les membres du club, signalés d’eux-mêmes.',
            aide: 'Quand une page ne s’affiche pas ou qu’une erreur survient, l’appli la signale d’elle-même ici : le message, l’endroit dans le code, la page, la version et l’appareil, sans noms ni données. Une même erreur est comptée au lieu d’être répétée. Copie-la pour la faire corriger, puis marque-la réglée.',
            resume: 'Rapport d’erreurs automatique',
            contenu: <ErreursAppli />,
          },
        ]
      : []),
  ];
  const ouverte = parties.find((x) => x.id === partie);
  if (partie && !ouverte) return <Navigate to="/admin" replace />;

  if (ouverte)
    return (
      <div>
        <p className="admin-retour no-print">
          <Link to="/admin">‹ Console admin</Link>
        </p>
        <h1><Icone n={ouverte.icon} /> {ouverte.titre}</h1>
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
          <Link to="/membres-club" className="panel admin-carte">
            <span className="admin-carte-icone" aria-hidden><Icone n="personnes" /></span>
            <span>
              <b>Personnes et accès</b>
              <span className="muted">Un clic sur une personne ouvre sa fiche : coordonnées, rôles, étiquettes, accès à l’appli.</span>
              <small>« Club › Personnes du club » · {data.people.filter((x) => x.actif).length} personnes avec une fiche</small>
            </span>
          </Link>
        )}
        {parties.map((x) => (
          <Link key={x.id} to={`/admin/${x.id}`} className="panel admin-carte">
            <span className="admin-carte-icone" aria-hidden><Icone n={x.icon} /></span>
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
                    {r.label} <Icone n={r.locked ? 'verrou' : 'modifier'} />
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
      <p className="muted">¹ Ces droits ne s’appliquent qu’aux sections du rôle. Chacun voit et modifie toujours les points dont il est responsable ou qu’il a créés (selon « ses propres points »). Sans « Voir tous les points » (bénévole, externe…), il ne reçoit que ceux-là : le serveur ne lui envoie pas les autres. Les tickets (remboursements, factures) ne sont vus que de la caisse, de leur demandeur, de la personne qui vise et des admins, même avec « Voir tous les points ». Les changements s’appliquent immédiatement : change d’utilisateur pour tester. Le rôle Admin est verrouillé.</p>

      {creating && (
        <NewRole
          onClose={() => setCreating(false)}
          onCreate={(label, base) => {
            const src = data.roles.find((r) => r.id === base);
            const modele = base === MODELE_EXTERNE;
            const role: Role = modele
              ? { id: uid('r'), label, couleur: EXTERNE_COULEUR, permissions: [...EXTERNE_PERMS], sections: [] }
              : { id: uid('r'), label, couleur: '#0f766e', permissions: src ? [...src.permissions].filter((p) => p !== 'admin.access') : [], sections: src ? [...src.sections] : [] };
            update((d) => { d.roles.push(role); }, `Création du rôle « ${label} »${modele ? ' (modèle Externe)' : src ? ` (copie de ${src.label})` : ''}`);
            setCreating(false);
          }}
        />
      )}
      {edit && <RoleModal role={edit.role} onClose={() => setEdit(null)} />}
    </>
  );
}

/** « Droits de départ » d'un nouveau rôle : le modèle Externe (voir EXTERNE_PERMS). */
const MODELE_EXTERNE = '@externe';

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
          <select
            value={base}
            onChange={(e) => {
              setBase(e.target.value);
              if (e.target.value === MODELE_EXTERNE && !label.trim()) setLabel('Externe');
            }}
          >
            <option value="">Aucun droit (à cocher ensuite)</option>
            <option value={MODELE_EXTERNE}>Modèle « Externe » : seulement les points qui lui sont attribués</option>
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
          <legend>Sections couvertes par les droits « Points »</legend>
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
          <button className="btn danger" disabled={members.length > 0} title={members.length ? 'Retire d’abord ce rôle aux personnes concernées (leur fiche : « Personnes du club »)' : ''} onClick={remove}>
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
    // Les points et la place des étiquettes (sous-section d'un événement…) suivent.
    update((d) => renommerSousSection(d, secId, old, v), `Sous-section « ${old} » (${sec.nom}) renommée en « ${v} »${n ? ` · ${n} point(s)` : ''}`);
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
        <p className="muted">
          Coche <b>Groupe</b> à côté d’une section (Gruppetto, École de cyclisme…) : elle devient une étiquette ; ses membres, du comité ou non,
          voient ses points. Les événements ont leur étiquette dans leur formulaire (agenda), avec leur sous-section dans « Événements ».
        </p>
        <Comite peut />
        {data.sections.map((s) => {
          const used = data.tasks.filter((t) => t.sectionId === s.id).length;
          return (
            <div key={s.id} className="panel">
              <div className="row">
                <input className="grow" defaultValue={s.nom} aria-label={`Nom de la section ${s.nom}`} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.nom) update((d) => { d.sections.find((x) => x.id === s.id)!.nom = v; }, `Section « ${s.nom} » renommée en « ${v} »`); }} />
                <button className="btn small danger" disabled={used > 0} title={used ? `${used} point(s) utilisent cette section` : ''} onClick={() => update((d) => { d.sections = d.sections.filter((x) => x.id !== s.id); d.etiquettes = d.etiquettes?.map((e) => (e.lieux?.some((l) => l.sectionId === s.id) ? { ...e, lieux: e.lieux.filter((l) => l.sectionId !== s.id) } : e)); }, `Suppression de la section « ${s.nom} »`)}>Supprimer</button>
              </div>
              <GroupeSection s={s} peut />
              {s.sousSections.length > 0 && (
                <ul className="sub-list">
                  {s.sousSections.map((ss, i) => {
                    const n = data.tasks.filter((t) => t.sectionId === s.id && t.sousSection === ss).length;
                    return (
                      <li key={`${i}-${ss}`}>
                        <button className="icon-btn" disabled={i === 0} onClick={() => moveSub(s.id, i, -1)} aria-label={`Monter ${ss}`}><Icone n="monter" /></button>
                        <button className="icon-btn" disabled={i === s.sousSections.length - 1} onClick={() => moveSub(s.id, i, 1)} aria-label={`Descendre ${ss}`}><Icone n="descendre" /></button>
                        <input
                          className="grow"
                          defaultValue={ss}
                          aria-label={`Nom de la sous-section ${ss}`}
                          onBlur={(e) => renameSub(s.id, ss, e.target)}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                        />
                        {n > 0 && <small className="muted" title={`${n} point(s) dans cette sous-section`}>{n}</small>}
                        <button
                          className="chip-x"
                          aria-label={`Retirer ${ss}`}
                          title={n ? `${n} point(s) gardent ce nom de sous-section` : 'Retirer'}
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
        <>
            {data.statuses.map((s, i) => {
              const used = data.tasks.filter((t) => t.statusId === s.id).length;
              return (
                <div key={s.id + s.label} className="panel row">
                  <input type="color" value={s.couleur} aria-label={`Couleur du statut ${s.label}`} onChange={(e) => update((d) => { d.statuses[i].couleur = e.target.value; }, `Couleur du statut « ${s.label} » modifiée`)} />
                  <input className="grow" defaultValue={s.label} aria-label={`Nom du statut ${s.label}`} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) update((d) => { d.statuses[i].label = v; }, `Statut « ${s.label} » renommé en « ${v} »`); }} />
                  <label className="inline" title="Un point dans ce statut compte comme terminé : bilan des points terminés dans l’ordre du jour, jamais en retard, archivé le lendemain de sa séance">
                    <input type="checkbox" checked={s.done} onChange={() => update((d) => { d.statuses[i].done = !s.done; }, `Statut « ${s.label} » : terminé = ${!s.done}`)} /> Terminé
                  </label>
                  <button className="icon-btn" disabled={i === 0} onClick={() => update((d) => { [d.statuses[i - 1], d.statuses[i]] = [d.statuses[i], d.statuses[i - 1]]; }, `Ordre des statuts modifié`)} aria-label="Monter"><Icone n="monter" /></button>
                  <button className="btn small danger" disabled={used > 0 || data.statuses.length <= 2} title={used ? `${used} point(s) ont ce statut` : ''} onClick={() => update((d) => { d.statuses = d.statuses.filter((x) => x.id !== s.id); }, `Suppression du statut « ${s.label} »`)}>Supprimer</button>
                </div>
              );
            })}
            <div className="row">
              <input placeholder="Nouveau statut (ex. En attente)" value={newStatus} onChange={(e) => setNewStatus(e.target.value)} />
              <button className="btn primary" onClick={() => { if (!newStatus.trim()) return; update((d) => { d.statuses.splice(d.statuses.length - 1, 0, { id: uid('s'), label: newStatus.trim(), couleur: '#9333ea', done: false }); }, `Ajout du statut « ${newStatus.trim()} »`); setNewStatus(''); }}>Ajouter</button>
            </div>
            <p className="muted">
              Case « Terminé » cochée : un point dans ce statut compte comme fait. Il figure dans l’ordre du jour et le PV de
              la séance suivante, parmi les points terminés (« ✓ fait » pour le premier statut terminé, sinon le nom du statut :
              « À discuter », « Information »…), n’est jamais en retard et part aux archives le lendemain de cette séance.
            </p>
        </>
        <p className="muted">« En retard » n'est pas un statut : il est calculé automatiquement quand le délai est dépassé et que le point n'est pas terminé.</p>
        <h2>Étiquettes</h2>
        <p className="muted">
          Les groupes (coche « Groupe » des sections, à gauche), les événements (case « Étiquette » de leur formulaire) et le comité ; ses membres voient
          les points qui la portent. {data.etiquettes?.length ?? 0} étiquette(s).
        </p>
        <Link className="btn" to="/etiquettes"><Icone n="etiquette" /> Page Étiquettes</Link>
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

