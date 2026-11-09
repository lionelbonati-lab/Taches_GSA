import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, SerieEvenements } from '../data/types';
import { addDays, diffDays, fmtDate, offsetLabel, shortName } from '../data/utils';
import { horaire, libelleRepetition } from '../data/repetition';
import { nomReprise, type Candidat } from '../data/reprise';
import { etiquetteDeLaSerie, etiquetteDeLEvenement, suiteEtiquette, suiteEtiquetteSerie } from '../data/etiquettes';
import { FILTRE_SERIE } from '../data/seriesEvenements';
import { ansEntre, candidatsSerie, debutDe, decalageReprise, evenementsARecopier, eventDecale, reprendreSerie } from '../data/repriseSerie';
import { Modal } from './ui';
import { Icone } from './icones';
import { BadgeEtiquette } from './IconesEtiquette';

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** « jeu. 29.10.2026 ». */
const jourEtDate = (date: string) => `${new Date(date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short' })} ${fmtDate(date)}`;

/**
 * Reprendre une série d'événements pour la saison suivante (repriseSerie.ts) : le nom de la nouvelle série (années
 * décalées), le premier jour de la nouvelle saison (52 semaines plus tard par défaut : tous les événements sont décalés
 * d'autant), les événements à reprendre, leurs points (cochés, sauf les récurrents), leurs responsables, et les étiquettes
 * (de la série et de ses événements) qui suivent.
 */
export function RepriseSerieModal({ serie: s, onClose }: { serie: SerieEvenements; onClose: () => void }) {
  const { data, user, can, update, setToast } = useStore();
  const navigate = useNavigate();
  const [evs] = useState(() => evenementsARecopier(data, s));
  const debut = debutDe(evs) ?? '';
  const [date, setDate] = useState(() => (debut ? addDays(debut, decalageReprise(evs)) : ''));
  const n = JOUR.test(date) && debut ? diffDays(debut, date) : 0;
  const [nom, setNom] = useState(() => nomReprise(s.nom, debut ? ansEntre(debut, decalageReprise(evs)) : 1));
  const [nomChoisi, setNomChoisi] = useState(false);
  const [garderEvs, setGarderEvs] = useState(() => new Set(evs.map((e) => e.id)));
  const [{ parEvenement, serie: pointsSerie }] = useState(() => candidatsSerie(data, s, evs, (sectionId) => can('tasks.createAny', sectionId)));
  const [choix, setChoix] = useState(() => new Set([...parEvenement.flatMap((x) => x.l), ...pointsSerie].filter((x) => x.coche).map((x) => x.t.id)));
  const [memes, setMemes] = useState(true);
  const etiquette = etiquetteDeLaSerie(data, s.id);
  const avecEtiquettes = evs.filter((e) => !!etiquetteDeLEvenement(data, e.id));
  const [garderEtiquettes, setGarderEtiquettes] = useState(true);
  const [err, setErr] = useState('');
  if (!user) return null;
  const deja = data.seriesEvenements?.find((x) => x.repriseDe === s.id);
  const actifs = new Set(data.people.filter((p) => p.actif).map((p) => p.id));

  // Premier jour changé : tous les événements suivent (même écart) ; le nom suit l'année, tant qu'on ne l'a pas changé.
  const changerDate = (d: string) => {
    setDate(d);
    if (JOUR.test(d) && debut && !nomChoisi) setNom(nomReprise(s.nom, ansEntre(debut, diffDays(debut, d))));
  };
  const basculer = (ids: string[], oui: boolean) =>
    setChoix((x) => {
      const y = new Set(x);
      ids.forEach((id) => (oui ? y.add(id) : y.delete(id)));
      return y;
    });
  const basculerEv = (id: string) =>
    setGarderEvs((x) => {
      const y = new Set(x);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });
  // Points retenus : ceux cochés, des événements repris (et ceux de la série).
  const retenus = [...parEvenement.filter((x) => garderEvs.has(x.e.id)).flatMap((x) => x.l), ...pointsSerie].filter((x) => choix.has(x.t.id));

  const submit = () => {
    if (!nom.trim()) return setErr('« Nom de la nouvelle série » est obligatoire.');
    if (!JOUR.test(date)) return setErr('Indique le premier jour de la nouvelle saison.');
    if (!garderEvs.size) return setErr('Coche au moins un événement à reprendre.');
    const r = reprendreSerie(data, s, { nom, decalage: n, evenements: [...garderEvs], taches: retenus.map((x) => x.t.id), responsables: memes }, user.id);
    const nt = r.tasks.length;
    const ids = r.tasks.map((t) => t.id);
    update((d) => {
      d.seriesEvenements = [...(d.seriesEvenements ?? []), r.serie];
      d.events = [...d.events, ...r.events];
      d.tasks = [...r.tasks, ...d.tasks];
      if (r.notifs.length) d.notifications = [...r.notifs, ...(d.notifications ?? [])].slice(0, 300);
      // Les étiquettes suivent : celles des événements, puis celle de la série.
      r.paires.forEach((p) => suiteEtiquette(d, p.ancien, p.nouveau, ids, garderEtiquettes));
      suiteEtiquetteSerie(d, s, r.serie, ids, garderEtiquettes);
    }, `Reprise de la série « ${s.nom} » : « ${r.serie.nom} », ${r.events.length} événement${r.events.length > 1 ? 's' : ''} dès le ${fmtDate(date)}${nt ? `, ${nt} point${nt > 1 ? 's' : ''} repris` : ''}`);
    setToast(`✅ « ${r.serie.nom} » ajoutée : ${r.events.length} événement${r.events.length > 1 ? 's' : ''}${nt ? `, ${nt} point${nt > 1 ? 's' : ''} à faire` : ''}.`);
    onClose();
    if (nt) navigate(`/taches?event=${encodeURIComponent(FILTRE_SERIE + r.serie.id)}`);
  };

  /** Un événement et sa suite : « mar. 27.10.2026 → mar. 26.10.2027 ». */
  const ligneEv = (e: ClubEvent) => {
    const x = n ? eventDecale(e, n, 0, '') : undefined;
    return (
      <li key={e.id}>
        <label className="check">
          <input type="checkbox" checked={garderEvs.has(e.id)} onChange={() => basculerEv(e.id)} />
          <span>
            <strong>{e.nom}</strong>
            <small className="muted">
              {' '}· {jourEtDate(e.date)}{x && ` → ${jourEtDate(x.date)}`}
              {horaire(e) && ` · ${horaire(e)}`}
              {x?.repetition && ` · 🔁 ${libelleRepetition(x).toLowerCase()}`}
            </small>
          </span>
        </label>
      </li>
    );
  };

  const groupe = (titre: string, l: Candidat[]) => {
    if (!l.length) return null;
    const coches = l.filter((x) => choix.has(x.t.id)).length;
    return (
      <section key={titre} className="reprise-groupe">
        <div className="row wrap">
          <strong className="grow">{titre} <small className="muted">({coches}/{l.length})</small></strong>
          <button type="button" className="btn link small" onClick={() => basculer(l.map((x) => x.t.id), coches < l.length)}>
            {coches < l.length ? 'Tout cocher' : 'Tout décocher'}
          </button>
        </div>
        <ul className="anciennes-liste">
          {l.map(({ t }) => {
            const delai = t.delai && n ? addDays(t.delai, n) : '';
            const resp = memes ? t.responsables.filter((id) => actifs.has(id)).map((id) => shortName(data.people.find((p) => p.id === id))) : [];
            return (
              <li key={t.id}>
                <label className="check">
                  <input type="checkbox" checked={choix.has(t.id)} onChange={() => basculer([t.id], !choix.has(t.id))} />
                  <span>
                    <strong>{t.titre || '(sans titre)'}</strong>
                    <small className="muted">
                      {' '}· {delai ? `délai ${fmtDate(delai)}` : 'sans délai'}
                      {t.delaiRef?.type === 'event' && t.eventId && evs.some((e) => e.id === t.eventId) && ` (${offsetLabel(t.delaiRef).toLowerCase()})`}
                      {resp.length > 0 && ` · ${resp.join(', ')}`}
                      {t.checklist.length > 0 && ` · ☑ ${t.checklist.length}`}
                      {t.recurrence && ' · 🔁 se reconduit déjà toute seule'}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };
  const groupes = [
    ...parEvenement.filter((x) => garderEvs.has(x.e.id)).map((x) => groupe(`Points de « ${x.e.nom} »`, x.l)),
    etiquette && groupe(`Points de la série (étiquette « ${etiquette.nom} »)`, pointsSerie),
  ].filter(Boolean);

  return (
    <Modal title={`Reprendre la série « ${s.nom} »`} icone="serie" onClose={onClose} wide>
      <p className="muted">
        La saison suivante, en une fois : ses événements décalés d’autant (leur répétition aussi), dans une nouvelle série, avec les points qui les
        préparaient. Chaque point repart « à faire », au même écart de son événement (« 30 jours avant », « la veille ») ; checklist décochée, sans
        discussion ni séance. Les fichiers joints restent ; emails et sondages ne suivent pas. La saison passée ne change pas.
      </p>
      {deja && (
        <p className="reprise-deja">
          <Icone n="alerte" /> Déjà reprise dans « {deja.nom} » : la reprendre de nouveau recopie ses événements et ses points une seconde fois.
        </p>
      )}
      <div className="form">
        <label className="full">
          Nom de la nouvelle série
          <input value={nom} maxLength={120} onChange={(x) => { setNom(x.target.value); setNomChoisi(true); }} />
        </label>
        <label>
          Premier jour de la nouvelle saison
          <input type="date" value={date} onChange={(x) => changerDate(x.target.value)} />
        </label>
        <p className="muted serie-ev-decalage">
          {debut && n
            ? `Saison passée dès le ${jourEtDate(debut)} : tout est décalé de ${n % 7 === 0 ? `${n / 7} semaine${n / 7 > 1 ? 's' : ''} (le même jour de la semaine)` : `${n} jours`}.`
            : ''}
        </p>
        <fieldset className="full reprise-resp">
          <legend>Responsables des points</legend>
          <label className="inline"><input type="radio" name="reprise-serie-resp" checked={memes} onChange={() => setMemes(true)} /> Les mêmes (personnes encore actives), prévenues 🔔</label>
          <label className="inline"><input type="radio" name="reprise-serie-resp" checked={!memes} onChange={() => setMemes(false)} /> À attribuer ensuite</label>
        </fieldset>
        {(etiquette || avecEtiquettes.length > 0) && (
          <fieldset className="full reprise-etiquette">
            <legend>Étiquettes</legend>
            <label className="inline">
              <input type="checkbox" checked={garderEtiquettes} onChange={(x) => setGarderEtiquettes(x.target.checked)} />
              <span>
                La nouvelle saison a ses étiquettes, avec les mêmes membres, la même couleur et la même icône :{' '}
                {etiquette && <><BadgeEtiquette e={etiquette} /> (la série) </>}
                {avecEtiquettes.map((e) => <BadgeEtiquette key={e.id} e={etiquetteDeLEvenement(data, e.id)!} />)}
              </span>
            </label>
            <small className="muted">Les points recopiés passent dans les sous-sections de la nouvelle saison ; ceux de la saison passée gardent les leurs.</small>
          </fieldset>
        )}
      </div>
      <section className="reprise-groupe">
        <strong>Événements à reprendre <small className="muted">({garderEvs.size}/{evs.length})</small></strong>
        <ul className="anciennes-liste">{evs.map(ligneEv)}</ul>
      </section>
      {groupes}
      {!groupes.length && <p className="muted">Aucun point à reprendre : seuls les événements seront recopiés.</p>}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={submit}>
          Reprendre {garderEvs.size} événement{garderEvs.size > 1 ? 's' : ''}
          {retenus.length ? ` et ${retenus.length} point${retenus.length > 1 ? 's' : ''}` : ''}
        </button>
      </div>
    </Modal>
  );
}
