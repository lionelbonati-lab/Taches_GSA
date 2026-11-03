import { useState } from 'react';
import { useStore } from '../data/store';
import type { Etiquette, TypeEtiquette } from '../data/types';
import { COULEURS, fullName, uid } from '../data/utils';
import { Modal } from './ui';

const TYPES: Record<TypeEtiquette, { label: string; aide: string }> = {
  evenement: { label: '📅 Événement', aide: 'avec sa date : dans l’agenda et à l’accueil' },
  groupe: { label: '👥 Groupe', aide: 'une activité permanente (école, compétition…)' },
};

/**
 * Étiquettes des tâches : un événement (avec sa date, dans l'agenda et à l'accueil) ou un groupe. Leurs membres voient
 * les tâches qui les portent ; les droits restent ceux des rôles du club (pas de responsable d'étiquette). Réglées par
 * les rôles qui ont « Gérer sections, statuts et étiquettes » (admins compris).
 */
export function EtiquettesModal({ onClose }: { onClose: () => void }) {
  const { data, can, update } = useStore();
  const gerer = can('settings.lists');
  const liste = data.etiquettes ?? [];
  const [ouverte, setOuverte] = useState<string | null>(liste.length === 1 ? liste[0].id : null);
  const [nom, setNom] = useState('');
  const [type, setType] = useState<TypeEtiquette>('evenement');
  const personnes = data.people.filter((p) => p.actif).sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));

  const changer = (id: string, f: (e: Etiquette) => Etiquette, action: string) =>
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).map((e) => (e.id === id ? f(e) : e));
    }, action);
  const ajouter = () => {
    const n = nom.trim();
    if (!n) return;
    const e: Etiquette = { id: uid('et'), nom: n, couleur: COULEURS[liste.length % COULEURS.length], type, membres: [] };
    update((d) => {
      d.etiquettes = [...(d.etiquettes ?? []), e];
    }, `Étiquette « ${n} » créée`);
    setNom('');
    setOuverte(e.id);
  };
  /** Tâches dont le délai suit la date de l'étiquette. */
  const calees = (e: Etiquette) => data.tasks.filter((t) => t.delaiRef?.type === 'etiquette' && t.delaiRef.etiquetteId === e.id).length;
  const retirer = (e: Etiquette) => {
    const n = data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
    const c = calees(e);
    if (!confirm(`Retirer l’étiquette « ${e.nom} » ?${n ? ` Elle est retirée de ${n} point(s) ; les points restent.` : ''}${c ? ` ${c} délai(s) calé(s) sur sa date gardent leur date actuelle.` : ''}`)) return;
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).filter((x) => x.id !== e.id);
      d.tasks.forEach((t) => {
        if (t.etiquettes?.includes(e.id)) t.etiquettes = t.etiquettes.filter((x) => x !== e.id);
      });
    }, `Étiquette « ${e.nom} » retirée`);
  };
  const bascule = (l: string[], id: string) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);
  const typeDe = (e: Etiquette): TypeEtiquette => (e.type === 'evenement' ? 'evenement' : 'groupe');

  return (
    <Modal title="Étiquettes" icone="etiquette" onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Une étiquette se met sur les points : un <b>événement</b> (avec sa date, dans l’agenda et à l’accueil) ou un <b>groupe</b>. Ses <b>membres</b>
        voient ces points. Qui peut les modifier : les rôles du club (fiche de la personne), comme pour tous les points.
      </p>
      {!liste.length && <p className="muted">Aucune étiquette pour l’instant.</p>}
      {liste.map((e) => {
        const membres = e.membres ?? [];
        return (
          <section key={e.id} className="panel etiquette-reglage">
            <div className="row wrap">
              <input type="color" value={e.couleur} disabled={!gerer} aria-label={`Couleur de l’étiquette ${e.nom}`} onChange={(ev) => changer(e.id, (x) => ({ ...x, couleur: ev.target.value }), `Couleur de l’étiquette « ${e.nom} » modifiée`)} />
              <input className="grow" defaultValue={e.nom} disabled={!gerer} aria-label={`Nom de l’étiquette ${e.nom}`}
                onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.nom) changer(e.id, (x) => ({ ...x, nom: v }), `Étiquette « ${e.nom} » renommée en « ${v} »`); }} />
              <select value={typeDe(e)} disabled={!gerer} aria-label={`Type de l’étiquette ${e.nom}`}
                onChange={(ev) => changer(e.id, (x) => ({ ...x, type: ev.target.value as TypeEtiquette, ...(ev.target.value === 'groupe' ? { date: undefined, dateFin: undefined } : {}) }), `Étiquette « ${e.nom} » : ${TYPES[ev.target.value as TypeEtiquette].label}`)}>
                {(Object.keys(TYPES) as TypeEtiquette[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
              </select>
              <button type="button" className="btn small" aria-expanded={ouverte === e.id} onClick={() => setOuverte(ouverte === e.id ? null : e.id)}>
                {membres.length} membre{membres.length > 1 ? 's' : ''}
              </button>
              {gerer && <button type="button" className="btn small danger" onClick={() => retirer(e)}>Retirer</button>}
            </div>
            {typeDe(e) === 'evenement' && (
              <div className="row wrap etiquette-dates">
                <label className="inline">
                  Date
                  <input type="date" value={e.date ?? ''} disabled={!gerer} aria-label={`Date de l’étiquette ${e.nom}`}
                    onChange={(ev) => changer(e.id, (x) => ({ ...x, date: ev.target.value || undefined, dateFin: x.dateFin && ev.target.value && x.dateFin > ev.target.value ? x.dateFin : undefined }), `Étiquette « ${e.nom} » : date`)} />
                </label>
                {e.date && (
                  <label className="inline">
                    jusqu’au
                    <input type="date" value={e.dateFin ?? ''} min={e.date} disabled={!gerer} aria-label={`Dernier jour de l’étiquette ${e.nom}`}
                      onChange={(ev) => changer(e.id, (x) => ({ ...x, dateFin: ev.target.value && ev.target.value > (x.date ?? '') ? ev.target.value : undefined }), `Étiquette « ${e.nom} » : dernier jour`)} />
                  </label>
                )}
                {!e.date && <small className="muted">Sans date : pas dans l’agenda.</small>}
                {e.date && calees(e) > 0 && <small className="muted">{calees(e)} point{calees(e) > 1 ? 's' : ''} calé{calees(e) > 1 ? 's' : ''} sur sa date : leur délai suit.</small>}
              </div>
            )}
            {ouverte === e.id && (
              <fieldset className="etiquette-personnes">
                <legend>Membres ({membres.length}) : ils voient les points de l’étiquette</legend>
                <div className="chips">
                  {personnes.map((p) => {
                    const on = membres.includes(p.id);
                    return (
                      <button key={p.id} type="button" className={`chip ${on ? 'on' : ''}`} disabled={!gerer} aria-pressed={on}
                        onClick={() => changer(e.id, (x) => ({ ...x, membres: bascule(x.membres ?? [], p.id) }), `Étiquette « ${e.nom} » : membres modifiés`)}>
                        {fullName(p)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </section>
        );
      })}
      {gerer && (
        <div className="row wrap">
          <input placeholder="Nouvelle étiquette (ex. Bruntrutaine)" value={nom} onChange={(ev) => setNom(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ajouter()} aria-label="Nom de la nouvelle étiquette" />
          <select value={type} onChange={(ev) => setType(ev.target.value as TypeEtiquette)} aria-label="Type de la nouvelle étiquette" title={TYPES[type].aide}>
            {(Object.keys(TYPES) as TypeEtiquette[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
          </select>
          <button type="button" className="btn primary" onClick={ajouter}>Ajouter</button>
        </div>
      )}
    </Modal>
  );
}
