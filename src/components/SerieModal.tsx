import { useState } from 'react';
import { useStore } from '../data/store';
import type { ClubEvent, SerieEvenements } from '../data/types';
import { fmtDate, fmtRange, today } from '../data/utils';
import { aLaDate, horaire, libelleRepetition } from '../data/repetition';
import { etiquetteDeLaSerie, evenementPasse, nomPlaceNewsletter, reglerEtiquetteSerie, type ChoixEtiquette } from '../data/etiquettes';
import { changementsDHeure, dateAffichee, enregistrerSerieEtEvenements, evenementsDeLaSerie, racine, serieDe, supprimerSerie } from '../data/seriesEvenements';
import { Modal } from './ui';
import { Icone } from './icones';
import { ZoneTexte } from './ZoneTexte';
import { CaseEtiquetteSerie } from './ReglageEtiquette';

/**
 * Fiche d'une série d'événements (seriesEvenements.ts) : son nom, sa description, son étiquette (nouvelle, ou une déjà
 * là : ses membres voient les points de toute la série) et ses événements, cochés parmi ceux de l'agenda (à venir ; les
 * passés repliés à part). Un événement coché qui était dans une autre série passe dans celle-ci. Supprimer la série : ses
 * événements restent dans l'agenda, avec leurs points, sans série. « Type » : une série d'événements, ou une série de
 * newsletters (la série et ses événements ont leur place dans la sous-section « Newsletter », etiquettes.ts).
 */
export function SerieModal({ serie, onClose }: { serie: SerieEvenements; onClose: () => void }) {
  const { data, update } = useStore();
  const isNew = !(data.seriesEvenements ?? []).some((s) => s.id === serie.id);
  const [nom, setNom] = useState(serie.nom);
  const [description, setDescription] = useState(serie.description ?? '');
  // Période officielle (facultative) : sinon, celle de ses événements.
  const [debut, setDebut] = useState(serie.debut ?? '');
  const [fin, setFin] = useState(serie.fin ?? '');
  const [newsletter, setNewsletter] = useState(!!serie.newsletter);
  const [err, setErr] = useState('');
  // Case « Étiquette de la série » : enregistrée avec la série, si on l'a touchée.
  const deja = etiquetteDeLaSerie(data, serie.id);
  const [etiquette, setEtiquette] = useState<ChoixEtiquette>(deja ? { membres: deja.membres ?? [] } : null);
  const [etiquetteTouchee, setEtiquetteTouchee] = useState(false);
  const choixEtiquette = (c: ChoixEtiquette) => {
    if (!c && deja) {
      const n = data.tasks.filter((t) => t.etiquettes?.includes(deja.id)).length;
      if (!confirm(`Retirer l’étiquette « ${deja.nom} » ?${n ? ` Ses ${n} point(s) la perdent ; ils restent dans leur sous-section.` : ''}`)) return;
    }
    setEtiquette(c);
    setEtiquetteTouchee(true);
  };
  const jour = today();
  // Premier jour de ses événements (pour la période officielle proposée).
  const premierJour = data.events.filter((e) => e.dansSerie === serie.id).map((e) => e.date).sort()[0];
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
    if (debut && fin && fin < debut) return setErr('La fin officielle ne peut pas précéder le début.');
    const n = ids.size;
    const quoiEtiquette = !etiquetteTouchee ? '' : etiquette ? `, étiquette (${etiquette.membres.length} membre${etiquette.membres.length > 1 ? 's' : ''})` : ', sans étiquette';
    const quoiNewsletter = newsletter === !!serie.newsletter ? '' : newsletter ? ', newsletter' : ', plus une newsletter';
    update(
      (d) => {
        // Newsletter cochée ou décochée : les étiquettes de la série et de ses événements changent de place
        // (etiquettes.ts, synchroniserEtiquettes).
        enregistrerSerieEtEvenements(d, { ...serie, nom, description, debut, fin, newsletter: newsletter || undefined }, [...ids]);
        // Après ses événements : leurs points reçoivent l'étiquette de la série.
        if (etiquetteTouchee) reglerEtiquetteSerie(d, { id: serie.id, nom: nom.trim() }, etiquette);
      },
      `${isNew ? 'Création' : 'Modification'} de la série d’événements « ${nom.trim()} » (${n} événement${n > 1 ? 's' : ''}${quoiNewsletter}${quoiEtiquette})`,
    );
    onClose();
  };
  const supprimer = () => {
    const n = evenementsDeLaSerie(data.events, serie.id).length;
    if (!confirm(`Supprimer la série « ${serie.nom} » ?${n ? ` Ses ${n} événement(s) restent dans l’agenda, avec leurs points, sans série.` : ''}${deja ? ` Son étiquette reste sur ses points (à relier, page Étiquettes).` : ''}`)) return;
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
          Type
          <select value={newsletter ? 'newsletter' : 'evenements'} onChange={(e) => setNewsletter(e.target.value === 'newsletter')}>
            <option value="evenements">Série d’événements</option>
            <option value="newsletter">Série de newsletters</option>
          </select>
        </label>
        {newsletter && (
          <p className="muted full serie-note">
            Ses événements sont des newsletters : leurs points se rangent dans « {nomPlaceNewsletter(data)} » (leurs étiquettes et celle de la série aussi), pas dans des sous-sections à leur nom dans « Événements ».
          </p>
        )}
        <label className="full">
          Nom de la série
          <input value={nom} maxLength={120} autoFocus={isNew} onChange={(e) => setNom(e.target.value)} placeholder="Programme hivernal 2026-27, Championnat interne 2027…" />
        </label>
        <label className="full">
          Description
          <ZoneTexte rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset className="full serie-periode">
          <legend>Période officielle <small className="muted">(facultative)</small></legend>
          <label>
            Début
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <label>
            Fin
            <input type="date" value={fin} min={debut || undefined} onChange={(e) => setFin(e.target.value)} />
          </label>
          <button type="button" className="btn small" onClick={() => {
            const c = changementsDHeure(Number((debut || premierJour || today()).slice(0, 4)) - (!debut && (premierJour || today()).slice(5, 7) < '07' ? 1 : 0));
            setDebut(c.debut);
            setFin(c.fin);
          }} title="Le dernier dimanche d’octobre et le dernier dimanche de mars suivant">
            <Icone n="horloge" /> Du changement d’heure d’automne à celui du printemps
          </button>
          <small className="muted">
            Sans : du premier au dernier jour de ses événements{premierJour ? ` (dès le ${fmtDate(premierJour)})` : ''}. Un événement peut commencer avant ou finir après (la natation dès septembre) : la carte le dit.
          </small>
        </fieldset>
        <CaseEtiquetteSerie serie={{ id: serie.id, nom, newsletter }} valeur={etiquette} onChange={choixEtiquette} />
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
