import { useState } from 'react';
import { useStore } from '../data/store';
import type { AppData, Etiquette, LieuEtiquette, TypeEtiquette } from '../data/types';
import { COULEURS, fullName, uid } from '../data/utils';
import { cleLieu, etiquettesDesLieux, lieuDeCle, lieuxDe, lieuxDevines, nomLieu, sansEtiquetteDeLeurPlace, toutesLesPlaces } from '../data/etiquettes';
import { hasPermission, userRoles } from '../data/permissions';
import { Modal } from './ui';

const TYPES: Record<TypeEtiquette, { label: string; aide: string }> = {
  evenement: { label: '📅 Événement', aide: 'avec sa date : dans l’agenda et à l’accueil' },
  groupe: { label: '👥 Groupe', aide: 'une activité permanente (école, compétition…)' },
};

/** Points que l'étiquette des autres points (comité) recevrait, si on la créait maintenant. */
const pointsDuComite = (data: AppData) => {
  const auto = etiquettesDesLieux(data);
  return data.tasks.filter((t) => !t.paiement && t.sectionId && !auto(t.sectionId, t.sousSection).length).length;
};

/**
 * Étiquettes des tâches : un événement (avec sa date, dans l'agenda et à l'accueil) ou un groupe. Leurs membres voient
 * les tâches qui les portent ; les droits restent ceux des rôles du club (pas de responsable d'étiquette). Chacune a sa
 * place dans les sections (etiquettes.ts) : un point rangé là la reçoit d'office ; l'étiquette des autres points (comité)
 * va aux points rangés ailleurs. Réglées par les rôles qui ont « Gérer sections, statuts et étiquettes » (admins compris).
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
    // Sa place : la section ou sous-section de même nom, s'il y en a une (réglable ensuite).
    const lieux = lieuxDevines({ nom: n }, data.sections);
    const e: Etiquette = { id: uid('et'), nom: n, couleur: COULEURS[liste.length % COULEURS.length], type, membres: [], lieux };
    update((d) => {
      d.etiquettes = [...(d.etiquettes ?? []), e];
    }, `Étiquette « ${n} » créée${lieux.length ? ` (place : ${lieux.map((l) => nomLieu(l, data.sections)).join(', ')})` : ''}`);
    setNom('');
    setOuverte(e.id);
  };
  // Place d'une étiquette : ajoutée ou retirée ; les points rangés là suivent (store.tsx, suivreLieux).
  const changerLieux = (e: Etiquette, lieux: LieuEtiquette[], quoi: string) => changer(e.id, (x) => ({ ...x, lieux }), `Étiquette « ${e.nom} » : ${quoi}`);
  const autres = liste.find((e) => e.parDefaut);
  // Étiquette des autres points : le comité (les personnes qui ont accès aux séances), pour les points rangés hors des étiquettes.
  const creerComite = () => {
    const n = pointsDuComite(data);
    if (!confirm(`Créer l’étiquette « Comité » ? Les points rangés hors de la place des autres étiquettes la reçoivent${n ? ` (${n} point${n > 1 ? 's' : ''} maintenant)` : ''} ; leur discussion est alors réservée à ses membres (et aux personnes qu’on y ajoute).`)) return;
    const membres = data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), 'tab.meetings')).map((p) => p.id);
    const e: Etiquette = { id: uid('et'), nom: 'Comité', couleur: '#1d4ed8', type: 'groupe', membres, parDefaut: true };
    update((d) => {
      d.etiquettes = [...(d.etiquettes ?? []), e];
    }, `Étiquette « Comité » créée, pour les points rangés hors des autres étiquettes${n ? ` · ${n} point(s)` : ''}`);
    setOuverte(e.id);
  };
  // Points d'avant ce réglage, sans l'étiquette de leur place : on la leur ajoute (rien n'est retiré).
  const aEtiqueter = sansEtiquetteDeLeurPlace(data);
  const etiqueterTout = () => {
    if (!confirm(`Ajouter l’étiquette de leur place à ${aEtiqueter.length} point${aEtiqueter.length > 1 ? 's' : ''} ? Aucune étiquette n’est retirée.`)) return;
    update((d) => {
      const auto = etiquettesDesLieux(d);
      d.tasks.forEach((t) => {
        if (t.paiement) return;
        const l = auto(t.sectionId, t.sousSection).filter((id) => !t.etiquettes?.includes(id));
        if (l.length) t.etiquettes = [...(t.etiquettes ?? []), ...l];
      });
    }, `Étiquettes de leur place ajoutées à ${aEtiqueter.length} point(s)`);
  };
  const places = toutesLesPlaces(data.sections);
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
        Une étiquette se met sur les points : un <b>événement</b> (avec sa date, dans l’agenda et à l’accueil) ou un <b>groupe</b>. Ses <b>membres</b>{' '}
        voient ces points. Qui peut les modifier : les rôles du club (fiche de la personne), comme pour tous les points.
        Chaque étiquette a sa <b>place</b> (une section ou une sous-section) : un point rangé là la reçoit d’office, et ses membres qui ne voient pas tous
        les points n’y rangent les leurs que là. On ne met à la main que les étiquettes dont on est membre.
      </p>
      {!liste.length && <p className="muted">Aucune étiquette pour l’instant.</p>}
      {gerer && !autres && (
        <div className="panel etiquette-comite">
          <span>Les points rangés hors de la place des étiquettes (ceux du comité) n’ont pas d’étiquette.</span>
          <button type="button" className="btn small" onClick={creerComite}>＋ Étiquette « Comité » pour ces points</button>
        </div>
      )}
      {gerer && aEtiqueter.length > 0 && (
        <div className="panel etiquette-comite">
          <span>{aEtiqueter.length} point{aEtiqueter.length > 1 ? 's' : ''} n’{aEtiqueter.length > 1 ? 'ont' : 'a'} pas encore l’étiquette de leur place.</span>
          <button type="button" className="btn small" onClick={etiqueterTout}>Ajouter l’étiquette de leur place</button>
        </div>
      )}
      {liste.map((e) => {
        const membres = e.membres ?? [];
        const lieux = lieuxDe(e, data.sections);
        const devines = !e.parDefaut && !e.lieux && lieux.length > 0;
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
            {e.parDefaut ? (
              <div className="row wrap etiquette-lieux">
                <span className="muted">Place : <b>les points rangés hors de la place des autres étiquettes</b> (le comité).</span>
              </div>
            ) : (
              <div className="row wrap etiquette-lieux">
                <span className="muted">Place :</span>
                {lieux.map((l) => (
                  <span key={cleLieu(l)} className="chip on locked">
                    {nomLieu(l, data.sections)}
                    {gerer && (
                      <button type="button" className="chip-x" aria-label={`Retirer la place ${nomLieu(l, data.sections)} de l’étiquette ${e.nom}`}
                        onClick={() => changerLieux(e, lieux.filter((x) => cleLieu(x) !== cleLieu(l)), `place ${nomLieu(l, data.sections)} retirée`)}>✕</button>
                    )}
                  </span>
                ))}
                {!lieux.length && <small className="muted">aucune : ses points se rangent n’importe où (ses membres, selon leurs rôles).</small>}
                {devines && <small className="muted">(d’après son nom)</small>}
                {gerer && (
                  <select value="" aria-label={`Ajouter une place à l’étiquette ${e.nom}`}
                    onChange={(ev) => { if (!ev.target.value) return; const l = lieuDeCle(ev.target.value); changerLieux(e, [...lieux, l], `place ${nomLieu(l, data.sections)}`); }}>
                    <option value="">＋ Place…</option>
                    {places.filter((l) => !lieux.some((x) => cleLieu(x) === cleLieu(l))).map((l) => (
                      <option key={cleLieu(l)} value={cleLieu(l)}>{l.sousSection ? `\u00a0\u00a0› ${l.sousSection}` : nomLieu(l, data.sections)}</option>
                    ))}
                  </select>
                )}
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
