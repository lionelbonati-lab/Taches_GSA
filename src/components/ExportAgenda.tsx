import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import type { AgendaClubEvent, OrgUnit } from '../data/types';
import { addDays, fullName, isDone, today } from '../data/utils';
import { isOpen } from '../data/polls';
import { fmtHeure, occurrenceDu } from '../data/repetition';
import { UNIT_TYPES } from '../data/units';
import { lienAppli } from '../data/lienPartage';
import { nomAppli } from '../data/nomAppli';
import { calendrierIcs, type ElementIcs } from '../data/ics';
import { Modal } from './ui';
import { Icone } from './icones';

// « Exporter vers mon agenda » (page Agenda) : fichier .ics des séances, événements, dates du club, délais des tâches
// et fins de sondage, à importer dans son agenda personnel. Une copie : les changements faits ensuite n'y arrivent pas.

/** Entités de l'agenda du club affichées dans l'Agenda (prochaine édition, événements des autres entités). */
export interface ManifAgenda { u: OrgUnit; events: AgendaClubEvent[]; edition: boolean }

type Taches = 'non' | 'mes' | 'toutes';

/** Sans heure de fin : une séance dure 2 h, un événement 1 h. */
const DUREE_SEANCE = 120;
const DOMAINE = 'taches-gsa';
/** Répétitions sans règle exacte : occurrences écrites jusqu'à deux ans. */
const HORIZON = 730;

export function ExportAgenda({ onClose, manifs, defauts }: { onClose: () => void; manifs: ManifAgenda[]; defauts: { seances: boolean; evenements: boolean; taches: Taches; sondages: boolean } }) {
  const { data, user, can, canSeeTask } = useStore();
  const club = useClubOptional();
  const seeMeetings = can('tab.meetings');
  const seeEvents = can('tab.events');
  const viewAll = can('tasks.viewAll');
  const [seances, setSeances] = useState(defauts.seances && seeMeetings);
  const [evenements, setEvenements] = useState(defauts.evenements && seeEvents);
  const [duClub, setDuClub] = useState(manifs.length > 0);
  const [taches, setTaches] = useState<Taches>(viewAll || defauts.taches !== 'toutes' ? defauts.taches : 'mes');
  const [sondages, setSondages] = useState(defauts.sondages);
  const [periode, setPeriode] = useState<'avenir' | 'tout'>('avenir');

  const jour = today();
  const unite = club?.current.id;
  const lien = (chemin: string) => lienAppli(chemin, unite);
  const nomPersonne = (id: string) => fullName(data.people.find((p) => p.id === id));
  /** Lieu à mettre dans l'agenda (« À définir » : aucun). */
  const lieu = (l?: string) => (l?.trim() && !/^à définir$/i.test(l.trim()) ? l.trim() : undefined);

  const listes = useMemo(() => {
    const avenir = periode === 'avenir';
    const s: ElementIcs[] = data.meetings
      .filter((m) => !avenir || m.date >= jour)
      .map((m) => ({
        uid: `seance-${m.id}@${DOMAINE}`, titre: m.titre, date: m.date, heure: m.heure, dureeDefaut: DUREE_SEANCE,
        lieu: lieu(m.lieu), geo: m.lieuGeo, url: lien('/comite'),
      }));
    const e: ElementIcs[] = data.events
      .filter((x) => !avenir || !!occurrenceDu(x, jour))
      .map((x) => ({
        uid: `evenement-${x.id}@${DOMAINE}`, titre: x.nom, date: x.date, dateFin: x.dateFin, heure: x.heure, heureFin: x.heureFin,
        lieu: lieu(x.lieu), description: x.description, repetition: x.repetition, sauf: x.sauf, url: lien('/evenements'),
      }));
    const c: ElementIcs[] = manifs.flatMap(({ u, events, edition }) => [
      ...(edition && (!avenir || (u.dateFin ?? u.date!) >= jour)
        ? [{ uid: `edition-${u.id}-${u.date}@${DOMAINE}`, titre: u.nom, date: u.date!, dateFin: u.dateFin, description: UNIT_TYPES[u.type].label }]
        : []),
      ...events
        .filter((x) => !avenir || !!occurrenceDu(x, jour))
        .map((x) => ({
          uid: `club-${u.id}-${x.id}@${DOMAINE}`, titre: x.nom === u.nom ? x.nom : `${x.nom} (${u.nom})`, date: x.date, dateFin: x.dateFin, heure: x.heure, heureFin: x.heureFin,
          lieu: lieu(x.lieu), repetition: x.repetition, sauf: x.sauf,
        })),
    ]);
    const t: ElementIcs[] = !user || taches === 'non' ? [] : data.tasks
      .filter((x) => x.delai && (!avenir || x.delai >= jour) && !isDone(data, x) && (taches === 'mes' ? x.responsables.includes(user.id) : canSeeTask(x)))
      .map((x) => ({
        uid: `tache-${x.id}@${DOMAINE}`, titre: `Délai : ${x.titre}`, date: x.delai, libre: true, url: lien(`/taches?tache=${encodeURIComponent(x.id)}`),
        description: [
          data.sections.find((z) => z.id === x.sectionId)?.nom,
          data.statuses.find((z) => z.id === x.statusId)?.label,
          x.responsables.length ? `Responsables : ${x.responsables.map(nomPersonne).join(', ')}` : '',
        ].filter(Boolean).join('\n'),
      }));
    const p: ElementIcs[] = (data.polls ?? [])
      .filter((x) => x.dateLimite && isOpen(x) && (!avenir || x.dateLimite >= jour))
      .map((x) => ({
        uid: `sondage-${x.id}@${DOMAINE}`, titre: `Fin du sondage${x.heureLimite ? ` (${fmtHeure(x.heureLimite)})` : ''} : ${x.question}`, date: x.dateLimite!,
        libre: true, url: lien(`/sondages?id=${encodeURIComponent(x.id)}`),
      }));
    return { s, e, c, t, p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, user, manifs, taches, periode, jour, unite]);

  const choisis = [...(seances ? listes.s : []), ...(evenements ? listes.e : []), ...(duClub ? listes.c : []), ...listes.t, ...(sondages ? listes.p : [])];

  const telecharger = () => {
    const entite = club?.current.nom;
    const ics = calendrierIcs(entite ? `${nomAppli()} – ${entite}` : nomAppli(), choisis, { depuis: periode === 'avenir' ? jour : '1970-01-01', horizon: addDays(jour, HORIZON) });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    // Nom sans accents ni caractères spéciaux : certains navigateurs refusent sinon le nom proposé.
    a.download = `agenda-${(entite ?? nomAppli()).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').toLowerCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const n = (k: number) => <small className="muted">({k})</small>;
  return (
    <Modal title="Exporter vers mon agenda" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Un fichier .ics à ouvrir ou importer dans ton agenda (Google Agenda, Calendrier d’Apple, Outlook…).
      </p>
      <fieldset className="export-agenda">
        <legend>À mettre dans le fichier</legend>
        {seeMeetings && <label className="inline"><input type="checkbox" checked={seances} onChange={(e) => setSeances(e.target.checked)} /> <Icone n="seances" /> Séances {n(listes.s.length)}</label>}
        {seeEvents && <label className="inline"><input type="checkbox" checked={evenements} onChange={(e) => setEvenements(e.target.checked)} /> <Icone n="evenements" /> Événements {n(listes.e.length)}</label>}
        {manifs.length > 0 && <label className="inline"><input type="checkbox" checked={duClub} onChange={(e) => setDuClub(e.target.checked)} /> <Icone n="agendaClub" /> Agenda du club {n(listes.c.length)}</label>}
        <label className="inline"><input type="checkbox" checked={sondages} onChange={(e) => setSondages(e.target.checked)} /> <Icone n="sondage" /> Fins de sondage {n(listes.p.length)}</label>
        <div className="row">
          <span><Icone n="taches" /> Délais des tâches</span>
          <div className="seg">
            <button className={taches === 'non' ? 'on' : ''} onClick={() => setTaches('non')}>Aucune</button>
            <button className={taches === 'mes' ? 'on' : ''} onClick={() => setTaches('mes')}>Les miennes</button>
            {viewAll && <button className={taches === 'toutes' ? 'on' : ''} onClick={() => setTaches('toutes')}>Toutes</button>}
          </div>
          {taches !== 'non' && n(listes.t.length)}
        </div>
        <div className="row">
          <label className="inline"><input type="radio" name="export-periode" checked={periode === 'avenir'} onChange={() => setPeriode('avenir')} /> À venir</label>
          <label className="inline"><input type="radio" name="export-periode" checked={periode === 'tout'} onChange={() => setPeriode('tout')} /> Passé compris</label>
        </div>
      </fieldset>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={!choisis.length} onClick={telecharger}><Icone n="telecharger" /> Télécharger le fichier</button>
        <span className="muted">{choisis.length} élément{choisis.length > 1 ? 's' : ''}</span>
      </div>
      <ul className="muted small-note export-agenda-aide">
        <li><b>iPhone, iPad, Mac</b> : ouvre le fichier, puis « Ajouter tout ».</li>
        <li><b>Google Agenda</b> : sur un ordinateur, calendar.google.com › Paramètres › Importer et exporter (l’application du téléphone n’importe pas de fichier).</li>
        <li><b>Outlook</b> : ouvre le fichier, ou Ajouter un calendrier › Charger à partir d’un fichier.</li>
      </ul>
      <p className="muted small-note">
        Le fichier est une copie : ce qui change ensuite dans l’appli n’arrive pas dans ton agenda. Importe-le dans un agenda à part (ex. « GSA ») : tu pourras le vider et importer un fichier à jour.
      </p>
    </Modal>
  );
}
