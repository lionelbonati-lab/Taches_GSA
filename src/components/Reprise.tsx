import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent } from '../data/types';
import { addDays, diffDays, fmtDate, fmtRange, offsetLabel, shortName } from '../data/utils';
import {
  candidats, dateReprise, dejaRecopies, delaiRepris, editionsCibles, nomReprise, pointsDeLEvenement, recopierDans, reprendre, type Candidat,
} from '../data/reprise';
import { etiquetteDeLEvenement, lieuxDe, nomLieu, sectionEvenements, suiteEtiquette, versEvenement } from '../data/etiquettes';
import { Modal } from './ui';
import { Icone } from './icones';
import { BadgeEtiquette } from './IconesEtiquette';
import { serieDe } from '../data/seriesEvenements';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reprendre un événement passé pour une nouvelle édition (reprise.ts) : son nom (années décalées), ses dates (un an plus
 * tard, le même jour de la semaine, ou celles données), les tâches à recopier (liées à l'événement : cochées, sauf les
 * récurrentes) et leurs responsables. `copie` : copier un événement pas encore passé, de la même façon, à une date à
 * choisir (un autre événement du même genre, pour ne pas refaire ses points).
 * « Recopier vers » un événement déjà là (son édition suivante, proposée d'office si elle existe, ou un autre à venir) :
 * seulement les points choisis, sans recréer l'événement ; ceux déjà recopiés sont signalés et décochés. `vers` : celui
 * choisi au départ.
 */
export function RepriseModal({ event: e, date: dateDonnee, dateFin: finDonnee, copie, vers: versDonne, onClose }: {
  event: ClubEvent; date?: string; dateFin?: string; copie?: boolean; vers?: string; onClose: () => void;
}) {
  const { data, user, can, update, setToast } = useStore();
  const navigate = useNavigate();
  const [date, setDate] = useState(dateDonnee ?? (copie ? '' : dateReprise(e)));
  const duree = e.dateFin && e.dateFin > e.date ? diffDays(e.date, e.dateFin) : 0;
  const [fin, setFin] = useState(finDonnee ?? (duree && JOUR.test(date) ? addDays(date, duree) : ''));
  const verbe = copie ? 'Copier' : 'Reprendre';
  const ans = (d: string) => Number(d.slice(0, 4)) - Number(e.date.slice(0, 4));
  const [nom, setNom] = useState(() => nomReprise(e.nom, ans(date)));
  const [nomChoisi, setNomChoisi] = useState(false);
  const [liste] = useState(() => candidats(data, e, (s) => can('tasks.createAny', s)));
  // Vers : une nouvelle édition (''), ou un événement déjà là (son édition suivante d'office).
  const editions = editionsCibles(data, e);
  /** L'événement déjà là, et nos points qui y sont déjà. */
  const etatVers = (id: string) => {
    const cible = id ? [...editions.siennes, ...editions.autres].find((x) => x.id === id) : undefined;
    return { cible, deja: cible ? dejaRecopies(pointsDeLEvenement(data, cible), liste.map((x) => x.t)) : new Set<string>() };
  };
  const [vers, setVers] = useState(() => (versDonne && etatVers(versDonne).cible ? versDonne : (editions.siennes[0]?.id ?? '')));
  const { cible, deja: dejaLa } = etatVers(vers);
  const cochesAuDepart = (d: Set<string>) => new Set(liste.filter((x) => x.coche && !d.has(x.t.id)).map((x) => x.t.id));
  const [choix, setChoix] = useState(() => cochesAuDepart(etatVers(vers).deja));
  const choisirVers = (id: string) => {
    setVers(id);
    setChoix(cochesAuDepart(etatVers(id).deja));
    setErr('');
  };
  // Date à laquelle les points sont recopiés : celle de l'événement déjà là, ou de la nouvelle édition.
  const dateVers = cible ? cible.date : date;
  const [memes, setMemes] = useState(true);
  // Étiquette de l'édition passée : la nouvelle édition a la sienne, avec les mêmes membres (etiquettes.ts, suiteEtiquette).
  const etiquette = etiquetteDeLEvenement(data, e.id);
  const [garderEtiquette, setGarderEtiquette] = useState(true);
  // Série d'événements : une copie (une autre manche) y reste d'office ; une nouvelle édition (la saison suivante), non.
  const serie = serieDe(data, e);
  const [garderSerie, setGarderSerie] = useState(!!copie);
  const placeAvant = etiquette ? lieuxDe(etiquette, data.sections).find((l) => l.sousSection) : undefined;
  const [err, setErr] = useState('');
  if (!user) return null;
  const deja = data.events.find((x) => x.repriseDe === e.id);
  // Tâches liées dans des sections où la personne ne crée pas de tâches pour d'autres : pas proposées.
  const horsDroits = pointsDeLEvenement(data, e).length - liste.length;
  const liees = liste;
  const actifs = new Set(data.people.filter((p) => p.actif).map((p) => p.id));

  // Début déplacé : la fin suit (même durée) et le nom suit l'année, tant qu'on ne l'a pas changé.
  const changerDate = (d: string) => {
    if (JOUR.test(d) && JOUR.test(date) && fin) setFin(addDays(fin, diffDays(date, d)));
    else if (JOUR.test(d) && !fin && duree) setFin(addDays(d, duree));
    setDate(d);
    if (JOUR.test(d) && !nomChoisi) setNom(nomReprise(e.nom, ans(d)));
  };
  const basculer = (ids: string[], oui: boolean) =>
    setChoix((s) => {
      const n = new Set(s);
      ids.forEach((id) => (oui ? n.add(id) : n.delete(id)));
      return n;
    });

  /** Vers un événement déjà là : seulement les points, sans le recréer. */
  const recopier = () => {
    if (!choix.size) return setErr('Coche au moins un point à recopier.');
    const r = recopierDans(data, e, cible!, { taches: [...choix], responsables: memes }, user.id);
    const n = r.tasks.length;
    update((d) => {
      d.tasks = [...r.tasks, ...d.tasks];
      if (r.notifs.length) d.notifications = [...r.notifs, ...(d.notifications ?? [])].slice(0, 300);
      // Rangés chez l'étiquette de l'événement d'origine : chez celle de l'événement déjà là.
      versEvenement(d, e, cible!, r.tasks.map((t) => t.id));
    }, `Points de « ${e.nom} » recopiés dans « ${cible!.nom} » (${fmtRange(cible!.date, cible!.dateFin)}) : ${n} point${n > 1 ? 's' : ''}`);
    setToast(`✅ ${n} point${n > 1 ? 's' : ''} recopié${n > 1 ? 's' : ''} dans « ${cible!.nom} ».`);
    onClose();
    navigate(`/taches?event=${cible!.id}`);
  };

  const submit = () => {
    if (cible) return recopier();
    if (!nom.trim()) return setErr('« Nom » est obligatoire.');
    if (!JOUR.test(date)) return setErr('Indique le premier jour.');
    if (fin && fin < date) return setErr('Le dernier jour ne peut pas précéder le premier.');
    const r = reprendre(data, e, { nom, date, dateFin: fin || undefined, taches: [...choix], responsables: memes, serie: garderSerie }, user.id);
    const n = r.tasks.length;
    update((d) => {
      d.events = [...d.events, r.event];
      d.tasks = [...r.tasks, ...d.tasks];
      if (r.notifs.length) d.notifications = [...r.notifs, ...(d.notifications ?? [])].slice(0, 300);
      suiteEtiquette(d, e, r.event, r.tasks.map((t) => t.id), garderEtiquette);
    }, `${copie ? 'Copie' : 'Reprise'} de l’événement « ${e.nom} » : « ${r.event.nom} » le ${fmtRange(r.event.date, r.event.dateFin)}${n ? `, ${n} point${n > 1 ? 's' : ''} repris` : ''}${etiquette ? (garderEtiquette ? ', avec son étiquette' : ', sans étiquette') : ''}`);
    setToast(`✅ « ${r.event.nom} » ajouté${n ? ` avec ${n} point${n > 1 ? 's' : ''} à faire` : ''}.`);
    onClose();
    if (n) navigate(`/taches?event=${r.event.id}`);
  };

  const groupe = (titre: string, l: Candidat[]) => {
    const coches = l.filter((x) => choix.has(x.t.id)).length;
    return (
      <section className="reprise-groupe">
        <div className="row wrap">
          <strong className="grow">{titre} <small className="muted">({coches}/{l.length})</small></strong>
          <button type="button" className="btn link small" onClick={() => basculer(l.map((x) => x.t.id), coches < l.length)}>
            {coches < l.length ? 'Tout cocher' : 'Tout décocher'}
          </button>
        </div>
        <ul className="anciennes-liste">
          {l.map(({ t }) => {
            const delai = JOUR.test(dateVers) ? delaiRepris(t, e, dateVers) : '';
            const resp = memes ? t.responsables.filter((id) => actifs.has(id)).map((id) => shortName(data.people.find((p) => p.id === id))) : [];
            return (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={choix.has(t.id)} onChange={() => basculer([t.id], !choix.has(t.id))} />
                  <span>
                    <strong>{t.titre || '(sans titre)'}</strong>
                    <small className="muted">
                      {' '}· {delai ? `délai ${fmtDate(delai)}` : 'sans délai'}
                      {t.eventId === e.id && t.delaiRef?.type === 'event' && ` (${offsetLabel(t.delaiRef).toLowerCase()})`}
                      {resp.length > 0 && ` · ${resp.join(', ')}`}
                      {t.checklist.length > 0 && ` · ☑ ${t.checklist.length}`}
                      {t.recurrence && ' · 🔁 se reconduit déjà toute seule'}
                    </small>
                    {cible && dejaLa.has(t.id) && <small className="deja-recopie"> · déjà dans « {cible.nom} »</small>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <Modal title={`${verbe} « ${e.nom} »`} icone="dupliquer" onClose={onClose} wide>
      {(editions.siennes.length > 0 || editions.autres.length > 0) && (
        <fieldset className="reprise-vers">
          <legend>Recopier vers</legend>
          <label className="inline">
            <input type="radio" name="reprise-vers" checked={!cible} onChange={() => choisirVers('')} /> {copie ? 'Un nouvel événement' : 'Une nouvelle édition'}
          </label>
          <label className="inline">
            <input type="radio" name="reprise-vers" checked={!!cible} onChange={() => choisirVers(cible?.id ?? editions.siennes[0]?.id ?? editions.autres[0].id)} />
            Un événement déjà là, sans le recréer :
          </label>
          <select value={vers} aria-label="Événement déjà là" onChange={(x) => choisirVers(x.target.value)}>
            {!cible && <option value="">—</option>}
            {editions.siennes.length > 0 && (
              <optgroup label="Ses éditions">{editions.siennes.map((x) => <option key={x.id} value={x.id}>{x.nom} ({fmtRange(x.date, x.dateFin)})</option>)}</optgroup>
            )}
            {editions.autres.length > 0 && (
              <optgroup label="Autres événements à venir">{editions.autres.map((x) => <option key={x.id} value={x.id}>{x.nom} ({fmtRange(x.date, x.dateFin)})</option>)}</optgroup>
            )}
          </select>
        </fieldset>
      )}
      <p className="muted">
        {cible
          ? `Les points choisis sont recopiés dans « ${cible.nom} » (${fmtRange(cible.date, cible.dateFin)}), sans recréer l’événement.`
          : copie
            ? `Un autre événement, à la date choisie, avec les points qui préparent celui du ${fmtRange(e.date, e.dateFin)} : pas besoin de les refaire.`
            : `Une nouvelle édition, avec les points qui préparaient celle du ${fmtRange(e.date, e.dateFin)}.`}{' '}
        Chaque point repart « à faire », au même écart de
        l’événement (« 30 jours avant », « la veille ») ; checklist décochée, sans discussion ni séance. Les fichiers joints restent ; emails et sondages ne
        suivent pas.
        {cible && dejaLa.size > 0 && ` ${dejaLa.size} point${dejaLa.size > 1 ? 's sont' : ' est'} déjà dans « ${cible.nom} » : décoché${dejaLa.size > 1 ? 's' : ''}, pour ne pas ${dejaLa.size > 1 ? 'les' : 'le'} recopier deux fois.`}
      </p>
      {!cible && deja && (
        <p className="reprise-deja">
          <Icone n="alerte" /> Déjà recopié dans « {deja.nom} » ({fmtRange(deja.date, deja.dateFin)}) : le recopier de nouveau recopie ses points une seconde fois.
          Pour y ajouter des points, choisis « Un événement déjà là ».
        </p>
      )}
      <div className="form">
        {!cible && (
          <>
            <label className="full">
              Nom
              <input value={nom} maxLength={120} onChange={(x) => { setNom(x.target.value); setNomChoisi(true); }} />
            </label>
            <label>
              Premier jour
              <input type="date" value={date} autoFocus={copie} onChange={(x) => changerDate(x.target.value)} />
            </label>
            <label>
              Dernier jour <small className="muted">(si plusieurs jours)</small>
              <input type="date" value={fin} min={date || undefined} onChange={(x) => setFin(x.target.value)} />
            </label>
          </>
        )}
        <fieldset className="full reprise-resp">
          <legend>Responsables des points</legend>
          <label className="inline"><input type="radio" name="reprise-resp" checked={memes} onChange={() => setMemes(true)} /> Les mêmes (personnes encore actives), prévenues 🔔</label>
          <label className="inline"><input type="radio" name="reprise-resp" checked={!memes} onChange={() => setMemes(false)} /> À attribuer ensuite</label>
        </fieldset>
        {!cible && etiquette && (
          <fieldset className="full reprise-etiquette">
            <legend>Étiquette</legend>
            <label className="inline">
              <input type="checkbox" checked={garderEtiquette} onChange={(x) => setGarderEtiquette(x.target.checked)} />
              <span>
                Une étiquette pour {copie ? 'la copie' : 'la nouvelle édition'}, avec les mêmes membres ({etiquette.membres?.length ?? 0}), la même couleur et la même icône
              </span>
            </label>
            <small className="muted">
              {placeAvant
                ? `Les points recopiés de « ${nomLieu(placeAvant, data.sections)} » passent dans « ${sectionEvenements(data)?.nom ?? 'Événements'} › ${nom.trim() || '…'} »`
                : 'Les points recopiés ne portent plus l’étiquette de l’édition passée'}
              {garderEtiquette ? ' et portent la nouvelle étiquette' : ''} ; ceux de l’édition passée gardent <BadgeEtiquette e={etiquette} />.
            </small>
          </fieldset>
        )}
        {!cible && serie && (
          <label className="inline full">
            <input type="checkbox" checked={garderSerie} onChange={(x) => setGarderSerie(x.target.checked)} />
            <span><Icone n="serie" /> Dans la série « {serie.nom} »</span>
          </label>
        )}
      </div>
      {liees.length > 0 && groupe(`Points liés à « ${e.nom} »`, liees)}
      {!liste.length && <p className="muted">Aucun point lié à cet événement : seul l’événement sera {copie ? 'copié' : 'repris'}.</p>}
      {horsDroits > 0 && <p className="muted small-note">{horsDroits} point(s) lié(s) dans des sections où tu ne crées pas de points pour d’autres : pas proposé(s).</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>
          {cible
            ? `Recopier ${choix.size} point${choix.size > 1 ? 's' : ''} dans « ${cible.nom} »`
            : choix.size ? `${verbe} avec ${choix.size} point${choix.size > 1 ? 's' : ''}` : `${verbe} l’événement seul`}
        </button>
      </div>
    </Modal>
  );
}
