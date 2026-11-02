import { useState } from 'react';
import { useStore } from '../data/store';
import type { Etiquette, Person } from '../data/types';
import { fullName, uid } from '../data/utils';
import { Modal } from './ui';

const COULEURS = ['#2563eb', '#059669', '#ea580c', '#db2777', '#7c3aed', '#0891b2', '#b45309', '#475569'];

/**
 * Étiquettes des tâches (événements, groupes…) : leurs membres voient les tâches qui les portent ; leurs responsables
 * les gèrent et règlent leurs membres. Les admins créent, renomment et retirent les étiquettes et choisissent leurs
 * responsables ; un responsable règle les membres de ses étiquettes.
 */
export function EtiquettesModal({ onClose }: { onClose: () => void }) {
  const { data, user, can, update } = useStore();
  const admin = can('admin.access');
  const liste = data.etiquettes ?? [];
  const miennes = admin ? liste : liste.filter((e) => !!user && e.responsables.includes(user.id));
  const [ouverte, setOuverte] = useState<string | null>(miennes.length === 1 ? miennes[0].id : null);
  const [nom, setNom] = useState('');
  const personnes = data.people.filter((p) => p.actif).sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));

  const changer = (id: string, f: (e: Etiquette) => Etiquette, action: string) =>
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).map((e) => (e.id === id ? f(e) : e));
    }, action);
  const ajouter = () => {
    const n = nom.trim();
    if (!n) return;
    const e: Etiquette = { id: uid('et'), nom: n, couleur: COULEURS[liste.length % COULEURS.length], membres: [], responsables: [] };
    update((d) => {
      d.etiquettes = [...(d.etiquettes ?? []), e];
    }, `Étiquette « ${n} » créée`);
    setNom('');
    setOuverte(e.id);
  };
  const retirer = (e: Etiquette) => {
    const n = data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
    if (!confirm(`Retirer l’étiquette « ${e.nom} » ?${n ? ` Elle est retirée de ${n} tâche(s) ; les tâches restent.` : ''}`)) return;
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).filter((x) => x.id !== e.id);
      d.tasks.forEach((t) => {
        if (t.etiquettes?.includes(e.id)) t.etiquettes = t.etiquettes.filter((x) => x !== e.id);
      });
    }, `Étiquette « ${e.nom} » retirée`);
  };
  const bascule = (l: string[], id: string) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const Choix = ({ e, champ, titre, ok }: { e: Etiquette; champ: 'membres' | 'responsables'; titre: string; ok: boolean }) => (
    <fieldset className="etiquette-personnes">
      <legend>{titre} ({e[champ].length})</legend>
      <div className="chips">
        {personnes.map((p: Person) => {
          const on = e[champ].includes(p.id);
          return (
            <button key={p.id} type="button" className={`chip ${on ? 'on' : ''}`} disabled={!ok} aria-pressed={on}
              onClick={() => changer(e.id, (x) => ({ ...x, [champ]: bascule(x[champ], p.id) }), `Étiquette « ${e.nom} » : ${titre.toLowerCase()} modifiés`)}>
              {fullName(p)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  return (
    <Modal title="Étiquettes" icone="etiquette" onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Une étiquette (événement, groupe…) se met sur les tâches : ses <b>membres</b> voient ces tâches, ses <b>responsables</b> les gèrent
        (créer, modifier, attribuer) et choisissent ses membres. Les responsables de chaque tâche restent indiqués sur la tâche.
      </p>
      {!miennes.length && <p className="muted">Aucune étiquette{admin ? ' pour l’instant.' : ' dont tu es responsable.'}</p>}
      {miennes.map((e) => (
        <section key={e.id} className="panel etiquette-reglage">
          <div className="row">
            <input type="color" value={e.couleur} disabled={!admin} aria-label={`Couleur de l’étiquette ${e.nom}`} onChange={(ev) => changer(e.id, (x) => ({ ...x, couleur: ev.target.value }), `Couleur de l’étiquette « ${e.nom} » modifiée`)} />
            <input className="grow" defaultValue={e.nom} disabled={!admin} aria-label={`Nom de l’étiquette ${e.nom}`}
              onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nom) changer(e.id, (x) => ({ ...x, nom: v }), `Étiquette « ${e.nom} » renommée en « ${v} »`); }} />
            <button type="button" className="btn small" aria-expanded={ouverte === e.id} onClick={() => setOuverte(ouverte === e.id ? null : e.id)}>
              {e.membres.length} membre{e.membres.length > 1 ? 's' : ''} · {e.responsables.length} responsable{e.responsables.length > 1 ? 's' : ''}
            </button>
            {admin && <button type="button" className="btn small danger" onClick={() => retirer(e)}>Retirer</button>}
          </div>
          {ouverte === e.id && (
            <>
              <Choix e={e} champ="membres" titre="Membres" ok />
              <Choix e={e} champ="responsables" titre="Responsables" ok={admin} />
            </>
          )}
        </section>
      ))}
      {admin && (
        <div className="row">
          <input placeholder="Nouvelle étiquette (ex. Bruntrutaine)" value={nom} onChange={(ev) => setNom(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ajouter()} />
          <button type="button" className="btn primary" onClick={ajouter}>Ajouter</button>
        </div>
      )}
    </Modal>
  );
}
