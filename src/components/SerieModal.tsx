import { useState } from 'react';
import { useStore } from '../data/store';
import type { ClubEvent, SerieEvenements } from '../data/types';
import { fmtRange, today } from '../data/utils';
import { aLaDate, horaire, libelleRepetition } from '../data/repetition';
import { evenementPasse } from '../data/etiquettes';
import { dateAffichee, enregistrerSerieEtEvenements, evenementsDeLaSerie, racine, serieDe, supprimerSerie } from '../data/seriesEvenements';
import { Modal } from './ui';
import { Icone } from './icones';
import { ZoneTexte } from './ZoneTexte';

/**
 * Fiche d'une série d'événements (seriesEvenements.ts) : son nom, sa description et ses événements, cochés parmi ceux de
 * l'agenda (à venir ; les passés repliés à part). Un événement coché qui était dans une autre série passe dans celle-ci.
 * Supprimer la série : ses événements restent dans l'agenda, avec leurs points, sans série.
 */
export function SerieModal({ serie, onClose }: { serie: SerieEvenements; onClose: () => void }) {
  const { data, update } = useStore();
  const isNew = !(data.seriesEvenements ?? []).some((s) => s.id === serie.id);
  const [nom, setNom] = useState(serie.nom);
  const [description, setDescription] = useState(serie.description ?? '');
  const [err, setErr] = useState('');
  const jour = today();
  // Événements proposés : ceux d'origine (une date modifiée seule d'un événement qui se répète suit le sien).
  const candidats = data.events
    .filter((e) => racine(data.events, e) === e.id)
    .map((e) => ({ e, date: dateAffichee(e, jour), passe: evenementPasse(e, jour) }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.e.heure ?? '').localeCompare(b.e.heure ?? ''));
  const [ids, setIds] = useState(() => new Set(candidats.filter((x) => x.e.dansSerie === serie.id).map((x) => x.e.id)));
  const aVenir = candidats.filter((x) => !x.passe);
  const passes = candidats.filter((x) => x.passe).reverse();
  const basculer = (id: string) =>
    setIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = () => {
    if (!nom.trim()) return setErr('« Nom de la série » est obligatoire.');
    const n = ids.size;
    update(
      (d) => enregistrerSerieEtEvenements(d, { ...serie, nom, description }, [...ids]),
      `${isNew ? 'Création' : 'Modification'} de la série d’événements « ${nom.trim()} » (${n} événement${n > 1 ? 's' : ''})`,
    );
    onClose();
  };
  const supprimer = () => {
    const n = evenementsDeLaSerie(data.events, serie.id).length;
    if (!confirm(`Supprimer la série « ${serie.nom} » ?${n ? ` Ses ${n} événement(s) restent dans l’agenda, avec leurs points, sans série.` : ''}`)) return;
    update((d) => supprimerSerie(d, serie.id), `Suppression de la série d’événements « ${serie.nom} »`);
    onClose();
  };

  const ligne = ({ e, date }: { e: ClubEvent; date: string }) => {
    const autre = e.dansSerie !== serie.id ? serieDe(data, e) : undefined;
    const x = aLaDate(e, date);
    return (
      <li key={e.id}>
        <label className="check">
          <input type="checkbox" checked={ids.has(e.id)} onChange={() => basculer(e.id)} />
          <span>
            <strong>{e.nom || '(sans nom)'}</strong>
            <small className="muted">
              {' '}· {[e.repetition ? libelleRepetition(e) : fmtRange(x.date, x.dateFin), horaire(e), e.lieu].filter(Boolean).join(' · ')}
              {autre && ` · dans « ${autre.nom} »`}
            </small>
          </span>
        </label>
      </li>
    );
  };

  return (
    <Modal title={isNew ? 'Nouvelle série d’événements' : 'Série d’événements'} icone="serie" onClose={onClose}>
      <p className="muted">
        Des événements de l’agenda réunis sous un nom : le programme hivernal (une activité par jour de la semaine), un
        championnat en plusieurs manches… Chacun garde ses dates, son lieu, son étiquette et ses points ; la page Événements
        les montre ensemble.
      </p>
      <div className="form">
        <label className="full">
          Nom de la série
          <input value={nom} maxLength={120} autoFocus={isNew} onChange={(e) => setNom(e.target.value)} placeholder="Programme hivernal 2026-27, Championnat interne 2027…" />
        </label>
        <label className="full">
          Description
          <ZoneTexte rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <section className="serie-ev-choix" aria-label="Événements de la série">
        <h3>Événements de la série <small className="muted">({ids.size})</small></h3>
        {aVenir.length > 0 ? <ul className="anciennes-liste">{aVenir.map(ligne)}</ul> : <p className="muted">Aucun événement à venir dans l’agenda.</p>}
        {passes.length > 0 && (
          <details open={passes.some((x) => ids.has(x.e.id)) || undefined}>
            <summary>Événements passés ({passes.length})</summary>
            <ul className="anciennes-liste">{passes.map(ligne)}</ul>
          </details>
        )}
        <small className="muted">Un nouvel événement entre dans la série par « + Événement » sur la carte de la série, ou par « Série d’événements » dans sa fiche.</small>
      </section>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        {!isNew && <button className="btn danger" onClick={supprimer} title="Supprimer la série (ses événements restent)" aria-label="Supprimer la série"><Icone n="supprimer" /></button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>Enregistrer</button>
      </div>
    </Modal>
  );
}
