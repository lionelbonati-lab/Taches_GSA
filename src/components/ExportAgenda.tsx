import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { addDays, fmtDateTime, today } from '../data/utils';
import { lienAppli } from '../data/lienPartage';
import { nomAppli } from '../data/nomAppli';
import { calendrierIcs } from '../data/ics';
import { elementsChoisis, HORIZON_AGENDA, listesAgenda, nomAgenda, type ChoixAgenda, type ManifAgenda, type OptionsAbonnement, type TachesAgenda } from '../data/agendaIcs';
import { abonnerAgenda, fetchAbonnementAgenda, lienAbonnementAgenda, supprimerAbonnementAgenda, type AbonnementAgenda } from '../data/cloud';
import { copier } from './EnvoyerLien';
import { Modal } from './ui';
import { Icone } from './icones';

// « Exporter vers mon agenda » (page Agenda) : séances, événements, dates du club, délais des tâches et fins de sondage
// dans son agenda personnel. Un fichier .ics (une copie : les changements faits ensuite n'y arrivent pas) ou, dans la
// version réelle, un lien privé que l'agenda relit tout seul (migration 045, fonction gsa-agenda).

export function ExportAgenda({ onClose, manifs, defauts }: { onClose: () => void; manifs: ManifAgenda[]; defauts: { seances: boolean; evenements: boolean; taches: TachesAgenda; sondages: boolean } }) {
  const { data, user, can, canSeeTask, mode } = useStore();
  const club = useClubOptional();
  const seeMeetings = can('tab.meetings');
  const seeEvents = can('tab.events');
  const viewAll = can('tasks.viewAll');
  const [seances, setSeances] = useState(defauts.seances && seeMeetings);
  const [evenements, setEvenements] = useState(defauts.evenements && seeEvents);
  const [duClub, setDuClub] = useState(manifs.length > 0);
  const [taches, setTaches] = useState<TachesAgenda>(viewAll || defauts.taches !== 'toutes' ? defauts.taches : 'mes');
  const [sondages, setSondages] = useState(defauts.sondages);
  const [periode, setPeriode] = useState<'avenir' | 'tout'>('avenir');

  const jour = today();
  const unite = club?.current.id;
  const listes = useMemo(
    () => listesAgenda({ data, userId: user?.id, voit: canSeeTask, manifs, taches, depuis: periode === 'avenir' ? jour : undefined, lien: (chemin) => lienAppli(chemin, unite) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, user, manifs, taches, periode, jour, unite],
  );
  const choix: ChoixAgenda = { seances, evenements, club: duClub, taches, sondages };
  const choisis = elementsChoisis(listes, choix);

  const telecharger = () => {
    const entite = club?.current.nom;
    const ics = calendrierIcs(nomAgenda(nomAppli(), entite), choisis, { depuis: periode === 'avenir' ? jour : '1970-01-01', horizon: addDays(jour, HORIZON_AGENDA) });
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
        Dans ton agenda (Google Agenda, Calendrier d’Apple, Outlook…) : un fichier à importer une fois, ou un lien privé que ton agenda relit tout seul.
      </p>
      <fieldset className="export-agenda">
        <legend>À mettre dans l’agenda</legend>
        {seeMeetings && <label className="inline"><input type="checkbox" checked={seances} onChange={(e) => setSeances(e.target.checked)} /> <Icone n="seances" /> Séances {n(listes.seances.length)}</label>}
        {seeEvents && <label className="inline"><input type="checkbox" checked={evenements} onChange={(e) => setEvenements(e.target.checked)} /> <Icone n="evenements" /> Événements {n(listes.evenements.length)}</label>}
        {manifs.length > 0 && <label className="inline"><input type="checkbox" checked={duClub} onChange={(e) => setDuClub(e.target.checked)} /> <Icone n="agendaClub" /> Agenda du club {n(listes.club.length)}</label>}
        <label className="inline"><input type="checkbox" checked={sondages} onChange={(e) => setSondages(e.target.checked)} /> <Icone n="sondage" /> Fins de sondage {n(listes.sondages.length)}</label>
        <div className="row">
          <span><Icone n="taches" /> Délais des tâches</span>
          <div className="seg">
            <button className={taches === 'non' ? 'on' : ''} onClick={() => setTaches('non')}>Aucune</button>
            <button className={taches === 'mes' ? 'on' : ''} onClick={() => setTaches('mes')}>Les miennes</button>
            {viewAll && <button className={taches === 'toutes' ? 'on' : ''} onClick={() => setTaches('toutes')}>Toutes</button>}
          </div>
          {taches !== 'non' && n(listes.taches.length)}
        </div>
      </fieldset>

      <fieldset className="export-agenda">
        <legend><Icone n="telecharger" /> Fichier (une copie)</legend>
        <div className="row">
          <label className="inline"><input type="radio" name="export-periode" checked={periode === 'avenir'} onChange={() => setPeriode('avenir')} /> À venir</label>
          <label className="inline"><input type="radio" name="export-periode" checked={periode === 'tout'} onChange={() => setPeriode('tout')} /> Passé compris</label>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!choisis.length} onClick={telecharger}><Icone n="telecharger" /> Télécharger le fichier</button>
          <span className="muted">{choisis.length} élément{choisis.length > 1 ? 's' : ''}</span>
        </div>
        <ul className="muted small-note export-agenda-aide">
          <li><b>iPhone, iPad, Mac</b> : ouvre le fichier, puis « Ajouter tout ».</li>
          <li><b>Google Agenda</b> : sur un ordinateur, calendar.google.com › Paramètres › Importer et exporter (l’application du téléphone n’importe pas de fichier).</li>
          <li><b>Outlook</b> : ouvre le fichier, ou Ajouter un calendrier › Charger à partir d’un fichier.</li>
        </ul>
        <p className="muted small-note">
          Ce qui change ensuite dans l’appli n’arrive pas dans ton agenda. Importe-le dans un agenda à part (ex. « GSA ») : tu pourras le vider et importer un fichier à jour.
        </p>
      </fieldset>

      {mode === 'reel' && unite ? (
        <Abonnement unite={unite} choix={choix} />
      ) : (
        <p className="muted small-note">
          <Icone n="repetition" /> Dans la version réelle, tu peux aussi t’abonner par un lien privé : ton agenda se met alors à jour tout seul.
        </p>
      )}
    </Modal>
  );
}

const CHOIX_OUI_NON = ['seances', 'evenements', 'club', 'sondages'] as const;

/** Lien privé (version réelle) : le créer avec les choix de la fenêtre, le copier, l'ouvrir dans un agenda, le changer ou le supprimer. */
function Abonnement({ unite, choix }: { unite: string; choix: ChoixAgenda }) {
  /** undefined : en cours de lecture. */
  const [abo, setAbo] = useState<AbonnementAgenda | null | undefined>(undefined);
  const [erreur, setErreur] = useState('');
  const [busy, setBusy] = useState(false);
  const [copie, setCopie] = useState(false);
  const zone = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let on = true;
    fetchAbonnementAgenda(unite).then(
      (a) => on && setAbo(a),
      (e: Error) => {
        if (!on) return;
        setAbo(null);
        setErreur(e.message);
      },
    );
    return () => { on = false; };
  }, [unite]);

  const agir = async (f: () => Promise<void>) => {
    setBusy(true);
    setErreur('');
    try {
      await f();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const enregistrer = (nouveau: boolean) => agir(async () => {
    const options: OptionsAbonnement = { ...choix, appli: `${location.origin}${location.pathname}`, nomAppli: nomAppli() };
    const jeton = await abonnerAgenda(unite, options, nouveau);
    setAbo((a) => ({ jeton, options, luLe: nouveau || !a ? null : a.luLe }));
    setCopie(false);
  });

  const url = abo ? lienAbonnementAgenda(abo.jeton) : '';
  const webcal = url.replace(/^https:/, 'webcal:');
  const autresChoix = !!abo && (CHOIX_OUI_NON.some((k) => !!abo.options[k] !== choix[k]) || (abo.options.taches ?? 'non') !== choix.taches);
  const rien = !CHOIX_OUI_NON.some((k) => choix[k]) && choix.taches === 'non';

  return (
    <fieldset className="export-agenda">
      <legend><Icone n="repetition" /> Abonnement (mise à jour automatique)</legend>
      {abo === undefined ? (
        <p className="muted small-note">Chargement…</p>
      ) : !abo ? (
        <>
          <p className="muted small-note">
            Un lien privé que ton agenda relit tout seul : ce qui change dans l’appli y arrive, après quelques heures selon l’agenda. Il suit les choix ci-dessus, de l’an passé à deux ans devant.
          </p>
          <div className="row">
            <button className="btn primary" disabled={busy || rien} onClick={() => enregistrer(false)}><Icone n="lien" /> Créer mon lien privé</button>
          </div>
        </>
      ) : (
        <>
          <div className="row lien-abonnement">
            <input ref={zone} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Lien de l’abonnement" />
            <button className="btn small" onClick={async () => setCopie(await copier(url, zone.current))}><Icone n={copie ? 'ok' : 'copier'} /> {copie ? 'Copié' : 'Copier'}</button>
          </div>
          <div className="row">
            <a className="btn small" href={webcal}><Icone n="calendrier" /> Ouvrir dans Calendrier (Apple)</a>
            <a className="btn small" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer"><Icone n="calendrier" /> Ajouter à Google Agenda</a>
          </div>
          <ul className="muted small-note export-agenda-aide">
            <li><b>iPhone</b> : « Ouvrir dans Calendrier », puis « S’abonner ». Ou Réglages › Calendrier › Comptes › Ajouter un compte › Autre › Ajouter un calendrier avec abonnement, et colle le lien.</li>
            <li><b>Google Agenda</b> : « Ajouter à Google Agenda » (sur un ordinateur), ou calendar.google.com › Autres agendas › ＋ › À partir de l’URL, et colle le lien. Il apparaît ensuite aussi sur le téléphone.</li>
            <li><b>Outlook</b> : Ajouter un calendrier › S’abonner à partir du web, et colle le lien.</li>
          </ul>
          {autresChoix && (
            <div className="row">
              <span className="muted small-note"><Icone n="alerte" /> Le lien suit d’autres choix que ceux ci-dessus.</span>
              <button className="btn small" disabled={busy || rien} onClick={() => enregistrer(false)}>Appliquer ces choix au lien</button>
            </div>
          )}
          <p className="muted small-note">
            {abo.luLe ? `Dernière lecture par ton agenda : ${fmtDateTime(abo.luLe)}.` : 'Pas encore lu par un agenda.'} Garde ce lien pour toi : qui l’a voit ces dates, sans rien pouvoir modifier. Si tu n’es plus membre de l’entité, il ne donne plus rien.
          </p>
          <div className="row">
            <button className="btn small" disabled={busy} onClick={() => confirm('Remplacer le lien par un nouveau ? L’ancien ne marchera plus : il faudra mettre le nouveau dans ton agenda.') && enregistrer(true)}><Icone n="recharger" /> Nouveau lien</button>
            <button className="btn small danger" disabled={busy} onClick={() => confirm('Supprimer le lien ? Ton agenda ne recevra plus rien ; retire aussi l’abonnement de ton agenda.') && agir(async () => { await supprimerAbonnementAgenda(unite); setAbo(null); })}><Icone n="supprimer" /> Supprimer le lien</button>
          </div>
        </>
      )}
      {erreur && <p className="error">{erreur}</p>}
    </fieldset>
  );
}
