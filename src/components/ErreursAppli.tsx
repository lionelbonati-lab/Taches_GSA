import { useCallback, useEffect, useState } from 'react';
import { useClubOptional } from '../data/club';
import { useStore } from '../data/store';
import { appareil, noterErreur, type ErreurAppli } from '../data/rapportErreurs';
import { fmtDateTime } from '../data/utils';
import { Icone } from './icones';

const ORIGINES: Record<string, string> = {
  affichage: 'Page qui ne s’affiche pas',
  script: 'Erreur de script',
  promesse: 'Erreur de script (en arrière-plan)',
  essai: 'Erreur d’essai',
};

const texteErreur = (e: ErreurAppli) =>
  [
    e.message,
    `${e.nombre} fois, ${e.personnes} personne${e.personnes > 1 ? 's' : ''} · du ${fmtDateTime(e.premiere)} au ${fmtDateTime(e.derniere)}`,
    `Page : ${e.page ?? '?'} · Entité : ${e.entite ?? '?'} · Version : ${e.version ?? '?'}`,
    `Appareil : ${e.navigateur ?? '?'}`,
    e.pile ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * Console admin du comité central : les erreurs que l'appli a signalées d'elle-même (rapport d'erreurs, 051), à régler
 * d'abord, puis les plus récentes. Ni noms, ni données : le message, l'emplacement dans le code, la page et l'appareil.
 */
export function ErreursAppli() {
  const club = useClubOptional();
  const { setToast } = useStore();
  const [liste, setListe] = useState<ErreurAppli[] | null>(null);
  const [probleme, setProbleme] = useState('');
  const lire = club?.erreurs;
  const charger = useCallback(() => {
    if (!lire) return;
    lire().then(
      (l) => {
        setListe(l);
        setProbleme('');
      },
      (e: Error) => setProbleme(e.message),
    );
  }, [lire]);
  useEffect(charger, [charger]);

  if (!club) return null;
  const agir = (p: Promise<unknown>, ok?: string) =>
    p.then(
      () => {
        if (ok) setToast(ok);
        charger();
      },
      (e: Error) => setToast(`⚠️ ${e.message}`),
    );
  const essai = () => {
    noterErreur(new Error('Erreur d’essai envoyée depuis la console admin'), 'essai', '', true);
    setToast('Erreur d’essai envoyée.');
    setTimeout(charger, 1500);
  };
  const reglees = liste?.filter((e) => e.reglee).length ?? 0;
  const aRegler = (liste?.length ?? 0) - reglees;

  return (
    <>
      <div className="page-head">
        <p className="muted" style={{ margin: 0 }}>
          {liste === null
            ? 'Chargement…'
            : !liste.length
              ? 'Aucune erreur signalée.'
              : `${aRegler} à regarder${reglees ? ` · ${reglees} réglée${reglees > 1 ? 's' : ''}` : ''}`}
        </p>
        <span className="row wrap">
          <button className="btn small" onClick={charger}><Icone n="recharger" /> Actualiser</button>
          <button className="btn small" onClick={essai}><Icone n="envoyer" /> Envoyer une erreur d’essai</button>
          {reglees > 0 && (
            <button
              className="btn small"
              onClick={() => confirm(`Effacer ${reglees > 1 ? `les ${reglees} erreurs réglées` : 'l’erreur réglée'} ?`) && agir(club.effacerErreurs(), 'Erreurs réglées effacées')}
            >
              <Icone n="supprimer" /> Effacer les réglées
            </button>
          )}
        </span>
      </div>
      {probleme && <p className="error">{probleme}</p>}
      {!!liste?.length && (
        <ol className="erreurs-liste">
          {liste.map((e) => (
            <li key={e.id} className={`panel${e.reglee ? ' reglee' : ''}`}>
              <div className="erreurs-tete">
                <b>{e.message}</b>
                <small className="muted">
                  {e.nombre} fois · {e.personnes} personne{e.personnes > 1 ? 's' : ''}
                  {e.reglee && ' · réglée'}
                </small>
              </div>
              <small className="muted">
                {ORIGINES[e.origine ?? ''] ?? e.origine ?? 'Erreur'} ·{' '}
                {e.premiere === e.derniere ? fmtDateTime(e.derniere) : `du ${fmtDateTime(e.premiere)} au ${fmtDateTime(e.derniere)}`}
                {e.page && ` · page ${e.page}`}
                {e.entite && ` · ${e.entite}`}
                {e.navigateur && ` · ${appareil(e.navigateur)}`}
                {e.version && ` · version ${e.version}`}
              </small>
              {e.pile && (
                <details>
                  <summary>Emplacement dans le code</summary>
                  <pre>{e.pile}</pre>
                </details>
              )}
              <span className="row wrap">
                <button className="btn small" onClick={() => agir(club.reglerErreur(e.id, !e.reglee))}>
                  <Icone n={e.reglee ? 'revenir' : 'valider'} /> {e.reglee ? 'Rouvrir' : 'Réglée'}
                </button>
                <button
                  className="btn small"
                  onClick={() => void navigator.clipboard?.writeText(texteErreur(e)).then(() => setToast('Copié'), () => {})}
                >
                  <Icone n="copier" /> Copier
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
