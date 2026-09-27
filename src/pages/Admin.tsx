import { useState } from 'react';
import { useStore } from '../data/store';
import { PERMISSIONS, ROLES } from '../data/permissions';
import type { RoleId } from '../data/types';
import { fmtDateTime, fullName, uid } from '../data/utils';
import { Avatar } from '../components/ui';

type Tab = 'users' | 'perms' | 'lists' | 'log';

export function Admin() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div>
      <h1>Console admin</h1>
      <div className="seg wrap">
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Utilisateurs & rôles</button>
        <button className={tab === 'perms' ? 'on' : ''} onClick={() => setTab('perms')}>Permissions</button>
        <button className={tab === 'lists' ? 'on' : ''} onClick={() => setTab('lists')}>Sections & statuts</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Journal d'activité</button>
      </div>
      {tab === 'users' && <Users />}
      {tab === 'perms' && <Perms />}
      {tab === 'lists' && <Lists />}
      {tab === 'log' && <Log />}
    </div>
  );
}

function Users() {
  const { data, user, update } = useStore();
  return (
    <table className="table">
      <thead><tr><th>Utilisateur</th><th>Poste</th><th>Rôle</th><th>Compte</th></tr></thead>
      <tbody>
        {data.people.map((p) => {
          const self = p.id === user?.id;
          return (
            <tr key={p.id} className={p.actif ? '' : 'inactive'}>
              <td><span className="inline"><Avatar id={p.id} size={26} /> {p.prenom} {p.nom}</span></td>
              <td>{p.poste}</td>
              <td>
                <select value={p.role} disabled={self} onChange={(e) => update((d) => { d.people.find((x) => x.id === p.id)!.role = e.target.value as RoleId; }, `Rôle de ${fullName(p)} → ${ROLES.find((r) => r.id === e.target.value)?.label}`)}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </td>
              <td>
                <label className="inline">
                  <input type="checkbox" checked={p.actif} disabled={self} onChange={() => update((d) => { const x = d.people.find((y) => y.id === p.id)!; x.actif = !x.actif; }, `${p.actif ? 'Désactivation' : 'Activation'} du compte de ${fullName(p)}`)} />
                  {p.actif ? 'Actif' : 'Désactivé'}
                </label>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Perms() {
  const { data, update } = useStore();
  return (
    <>
      <table className="table matrix">
        <thead><tr><th>Permission</th>{ROLES.map((r) => <th key={r.id}>{r.label}</th>)}</tr></thead>
        <tbody>
          {PERMISSIONS.map((p) => (
            <tr key={p.id}>
              <td>{p.label}</td>
              {ROLES.map((r) => {
                const on = data.permissions[r.id].includes(p.id);
                const locked = r.id === 'admin' && p.id === 'admin.access';
                return (
                  <td key={r.id} className="center">
                    <input type="checkbox" checked={on || locked} disabled={locked} onChange={() => update((d) => {
                      d.permissions[r.id] = on ? d.permissions[r.id].filter((x) => x !== p.id) : [...d.permissions[r.id], p.id];
                    }, `Permission « ${p.label} » ${on ? 'retirée à' : 'accordée à'} ${r.label}`)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Les changements s'appliquent immédiatement (change d'utilisateur pour tester). L'admin garde toujours l'accès à la console.</p>
    </>
  );
}

function Lists() {
  const { data, update } = useStore();
  const [newSec, setNewSec] = useState('');
  const [newSub, setNewSub] = useState<Record<string, string>>({});
  const [newStatus, setNewStatus] = useState('');

  const addSection = () => {
    if (!newSec.trim()) return;
    update((d) => { d.sections.push({ id: uid('sec'), nom: newSec.trim(), sousSections: [] }); }, `Ajout de la section « ${newSec.trim()} »`);
    setNewSec('');
  };

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
              <div className="chips">
                {s.sousSections.map((ss) => (
                  <span key={ss} className="chip on">
                    {ss}
                    <button className="chip-x" aria-label={`Retirer ${ss}`} onClick={() => update((d) => { const x = d.sections.find((y) => y.id === s.id)!; x.sousSections = x.sousSections.filter((y) => y !== ss); }, `Suppression de la sous-section « ${ss} »`)}>✕</button>
                  </span>
                ))}
              </div>
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
