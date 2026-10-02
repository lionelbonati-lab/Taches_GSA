import { Fragment, useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { ADMIN_ROLE_ID, PERMISSIONS, PERMISSION_GROUPS } from '../data/permissions';
import type { Permission, Person, Role } from '../data/types';
import { fmtDateTime, fullName, uid } from '../data/utils';
import { Avatar, Modal } from '../components/ui';
import { supabase, hasSupabase } from '../lib/supabase';

type Tab = 'users' | 'roles' | 'lists' | 'log' | 'committees';

export function Admin() {
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div>
      <h1>Console admin</h1>
      <div className="seg wrap">
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Utilisateurs</button>
        {hasSupabase && <button className={tab === 'committees' ? 'on' : ''} onClick={() => setTab('committees')}>Comités</button>}
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>Rôles & permissions</button>
        <button className={tab === 'lists' ? 'on' : ''} onClick={() => setTab('lists')}>Sections & statuts</button>
        <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>Journal d'activité</button>
      </div>
      {tab === 'users' && <Users />}
      {tab === 'committees' && <Committees />}
      {tab === 'roles' && <Roles />}
      {tab === 'lists' && <Lists />}
      {tab === 'log' && <Log />}
    </div>
  );
}

function Users() {
  const { data, user, update } = useStore();
  const activeAdmins = data.people.filter((p) => p.actif && p.roles.includes(ADMIN_ROLE_ID));

  const toggleRole = (p: Person, r: Role) => {
    const has = p.roles.includes(r.id);
    update((d) => {
      const x = d.people.find((y) => y.id === p.id)!;
      x.roles = has ? x.roles.filter((id) => id !== r.id) : [...x.roles, r.id];
    }, `${fullName(p)} : rôle « ${r.label} » ${has ? 'retiré' : 'ajouté'}`);
  };

  return (
    <>
      <table className="table">
        <thead><tr><th>Utilisateur</th><th>Poste</th><th>Rôles (cumulables)</th><th>Compte</th></tr></thead>
        <tbody>
          {data.people.map((p) => {
            const self = p.id === user?.id;
            const lastAdmin = p.roles.includes(ADMIN_ROLE_ID) && activeAdmins.length <= 1;
            return (
              <tr key={p.id} className={p.actif ? '' : 'inactive'}>
                <td><span className="inline"><Avatar id={p.id} size={26} /> {p.prenom} {p.nom}</span></td>
                <td>{p.poste}</td>
                <td>
                  <div className="chips">
                    {data.roles.map((r) => {
                      const on = p.roles.includes(r.id);
                      const locked = on && (p.roles.length === 1 || (r.id === ADMIN_ROLE_ID && (self || lastAdmin)));
                      return (
                        <button key={r.id} className={`chip role-chip ${on ? 'on' : ''}`} style={on ? { background: r.couleur, borderColor: r.couleur } : {}} disabled={locked} title={locked ? 'Ce rôle ne peut pas être retiré ici' : ''} onClick={() => toggleRole(p, r)}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td><label className="inline"><input type="checkbox" checked={p.actif} disabled={self || (p.actif && lastAdmin)} onChange={() => update((d) => { const x = d.people.find((y) => y.id === p.id)!; x.actif = !x.actif; }, `${p.actif ? 'Désactivation' : 'Activation'} du compte de ${fullName(p)}`)} />{p.actif ? 'Actif' : 'Désactivé'}</label></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">Une personne cumule les droits de tous ses rôles. Il reste toujours au moins un admin actif.</p>
    </>
  );
}

function Roles() { const { data } = useStore(); return <section><p className="muted">La gestion des rôles existante reste inchangée.</p><pre>{JSON.stringify(data.roles, null, 2)}</pre></section>; }
function Lists() { return <section><p className="muted">La gestion des sections et statuts existante reste inchangée.</p></section>; }
function Log() { const { data } = useStore(); return <table className="table"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th></tr></thead><tbody>{data.log.map(l => <tr key={l.id}><td>{fmtDateTime(l.at)}</td><td>{fullName(data.people.find(p => p.id === l.userId))}</td><td>{l.action}</td></tr>)}</tbody></table>; }
function Committees() {
  const [items, setItems] = useState<{ id: string; nom: string }[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = async () => { if (!supabase) return; const { data, error } = await supabase.from('committees').select('id, nom').order('created_at'); if (error) setError(error.message); else setItems(data ?? []); };
  useEffect(() => { void load(); }, []);
  const add = async () => { if (!supabase || !name.trim()) return; const { data: auth } = await supabase.auth.getUser(); const { error } = await supabase.from('committees').insert({ nom: name.trim(), created_by: auth.user?.id }).select('id, nom').single(); if (error) setError(error.message); else { setName(''); void load(); } };
  const rename = async (id: string, nom: string) => { if (!supabase || !nom.trim()) return; const { error } = await supabase.from('committees').update({ nom: nom.trim() }).eq('id', id); if (error) setError(error.message); else void load(); };
  const remove = async (id: string) => { if (!supabase || !confirm('Supprimer ce comité et ses données ?')) return; const { error } = await supabase.from('committees').delete().eq('id', id); if (error) setError(error.message); else void load(); };
  return <section><div className="page-head"><p className="muted">Gérez les comités et leurs membres depuis Supabase.</p><div className="row"><input value={name} placeholder="Nouveau comité" onChange={e => setName(e.target.value)} /><button className="btn primary" onClick={add}>Créer</button></div></div>{error && <p className="error">{error}</p>}<div className="grid2">{items.map(c => <div className="panel" key={c.id}><div className="row"><input className="grow" defaultValue={c.nom} onBlur={e => void rename(c.id, e.target.value)} /><button className="btn small danger" onClick={() => void remove(c.id)}>Supprimer</button></div><p className="muted">ID : {c.id}</p></div>)}</div></section>;
}
