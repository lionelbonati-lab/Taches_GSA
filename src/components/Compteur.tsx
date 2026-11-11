import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { useCompteur } from '../data/compteurEtat';
import {
  AJOUTS, LIBELLE_MAX, OUBLI_CHOIX, RETRAIT, decalerJour, depuisChampHeure, derniersLibelles, estOublie, fmtChrono, fmtDuree,
  fmtHeure, jourDe, parJour, totaux, versChampHeure,
} from '../data/compteur';
import { Icone } from './icones';
import { Modal } from './ui';

// Compteur de temps personnel (PLAN_COMPTEUR_TEMPS.md) : le bouton ⏱ de la barre du haut et son panneau, le rappel du
// compteur oublié, l'ajout pour un autre jour et les réglages (Réglages, page « Mon temps »).

/** L'heure, rafraîchie toutes les `ms` millisecondes. */
export function useMaintenant(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const libelleAjout = (m: number) => (m < 0 ? `−${-m} min` : m % 60 === 0 ? `+${m / 60} h` : `+${m} min`);

/** Bouton ⏱ de la barre du haut (compteur activé dans les réglages) : le temps en cours, et le panneau. */
export function BoutonCompteur() {
  const { reglages, enCours } = useCompteur();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = useMaintenant(enCours ? 1000 : 30_000);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.modal-back') && setOuvert(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-back') && setOuvert(false);
    document.addEventListener('mousedown', fermer);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fermer);
      window.removeEventListener('keydown', esc);
    };
  }, [ouvert]);

  if (!reglages.actif) return null;
  const duree = enCours ? now - Date.parse(enCours.debut!) : 0;
  return (
    <div className="compteur-wrap" ref={ref}>
      <button
        className={`compteur-btn ${enCours ? 'on' : ''}`}
        onClick={() => setOuvert(!ouvert)}
        aria-expanded={ouvert}
        aria-label={enCours ? `Mon compteur de temps : en marche, ${fmtDuree(duree)}` : 'Mon compteur de temps'}
        title={enCours ? `Compteur en marche depuis ${fmtHeure(enCours.debut!)}` : 'Mon compteur de temps'}
      >
        <Icone n="chrono" />
        {enCours && <span className="compteur-temps">{fmtChrono(duree)}</span>}
      </button>
      {ouvert && <PanneauCompteur onClose={() => setOuvert(false)} />}
      <CompteurOublie />
    </div>
  );
}

function PanneauCompteur({ onClose }: { onClose: () => void }) {
  const { setToast } = useStore();
  const { entrees, reglages, enCours, libelle, magasin } = useCompteur();
  const navigate = useNavigate();
  const now = useMaintenant(1000);
  const [autreJour, setAutreJour] = useState(false);
  const liste = useId();
  const jours = useMemo(() => parJour(entrees, now), [entrees, now]);
  const t = totaux(jours, now);
  const libelles = useMemo(() => derniersLibelles(entrees), [entrees]);

  // Compteur lancé ailleurs (autre appareil) : son libellé.
  const libelleEnCours = enCours?.libelle ?? '';
  useEffect(() => {
    if (enCours) magasin.setLibelle(libelleEnCours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCours?.id]);
  // Libellé changé pendant que le compteur tourne : noté sur le compteur en marche.
  const noterLibelle = () => {
    const l = libelle.trim();
    if (enCours && (enCours.libelle ?? '') !== l) magasin.ecrireEntree({ ...enCours, libelle: l });
  };

  const ajouter = (m: number) => {
    magasin.ajouter(m);
    const apres = Math.max(0, t.jour + m * 60_000);
    setToast(`⏱ ${libelleAjout(m)} ${m < 0 ? 'retirées' : 'ajoutées'} · aujourd’hui : ${fmtDuree(apres)}`);
  };

  return (
    <div className="compteur-panel" role="dialog" aria-label="Mon compteur de temps">
      <div className="bell-head">
        <strong><Icone n="chrono" /> Mon compteur</strong>
        <Link className="btn link small" to="/mon-temps" onClick={onClose}>Mon temps</Link>
      </div>
      <div className="compteur-corps">
        <div className="compteur-ligne">
          {enCours ? (
            <span className="compteur-etat">
              <span className="compteur-grand" aria-live="off">{fmtChrono(now - Date.parse(enCours.debut!), true)}</span>
              <small className="muted">depuis {fmtHeure(enCours.debut!)}</small>
            </span>
          ) : (
            <span className="compteur-etat"><span className="compteur-grand arrete">Arrêté</span></span>
          )}
          {enCours ? (
            <button className="btn danger" onClick={() => { noterLibelle(); magasin.arreter(); }}><Icone n="terminer" /> Arrêter</button>
          ) : (
            <button className="btn primary" onClick={() => magasin.demarrer()}><Icone n="demarrer" /> Démarrer</button>
          )}
        </div>
        {enCours && estOublie(enCours, reglages, now) && <RappelOublie />}
        <label className="compteur-libelle">
          Sur quoi ?
          <input
            list={liste}
            value={libelle}
            maxLength={LIBELLE_MAX}
            placeholder="(facultatif)"
            onChange={(e) => magasin.setLibelle(e.target.value)}
            onBlur={noterLibelle}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
          <datalist id={liste}>{libelles.map((l) => <option key={l} value={l} />)}</datalist>
        </label>
        <div className="compteur-ajouts">
          <span className="compteur-ajouts-titre">Ajouter à aujourd’hui</span>
          <span className="compteur-ajouts-btns" role="group" aria-label="Ajouter du temps à aujourd’hui">
            {AJOUTS.map((m) => <button key={m} className="btn small" onClick={() => ajouter(m)}>{libelleAjout(m)}</button>)}
            <button className="btn small" disabled={t.jour < RETRAIT * 60_000} onClick={() => ajouter(-RETRAIT)} title="Retirer 5 minutes à aujourd’hui">{libelleAjout(-RETRAIT)}</button>
          </span>
        </div>
        {autreJour ? (
          <AjoutAutreJour onDone={() => setAutreJour(false)} />
        ) : (
          <button className="btn link small compteur-autre" onClick={() => setAutreJour(true)}>Pour un autre jour…</button>
        )}
        <p className="compteur-totaux">
          <span>Aujourd’hui<b>{fmtDuree(t.jour)}</b></span>
          <span>Cette semaine<b>{fmtDuree(t.semaine)}</b></span>
          <span>Ce mois<b>{fmtDuree(t.mois)}</b></span>
        </p>
        {reglages.auto && <small className="muted compteur-auto"><Icone n="auto" /> Mode automatique : ton temps dans l’appli compte aussi.</small>}
      </div>
      <button className="bell-foot" onClick={() => { onClose(); navigate('/mon-temps'); }}>Voir le détail →</button>
    </div>
  );
}

function RappelOublie() {
  const [corriger, setCorriger] = useState(false);
  return (
    <>
      <p className="compteur-alerte">
        <Icone n="alerte" /> Il tourne depuis longtemps : oublié ?
        <button className="btn link small" onClick={() => setCorriger(true)}>Corriger…</button>
      </p>
      {corriger && <FenetreOublie onClose={() => setCorriger(false)} />}
    </>
  );
}

/**
 * Compteur oublié : à l'ouverture de l'appli (ou au retour sur elle), s'il tourne depuis plus longtemps que le réglage,
 * on demande : l'arrêter maintenant, l'arrêter à une heure choisie, ou le laisser tourner.
 */
function CompteurOublie() {
  const { enCours, reglages } = useCompteur();
  const [demande, setDemande] = useState(false);
  const etat = useRef({ enCours, reglages });
  etat.current = { enCours, reglages };
  useEffect(() => {
    const verifier = () => {
      const { enCours: e, reglages: r } = etat.current;
      if (document.visibilityState === 'visible' && estOublie(e, r, Date.now())) setDemande(true);
    };
    verifier();
    document.addEventListener('visibilitychange', verifier);
    return () => document.removeEventListener('visibilitychange', verifier);
  }, []);
  if (!demande || !estOublie(enCours, reglages, Date.now())) return null;
  return <FenetreOublie onClose={() => setDemande(false)} />;
}

function FenetreOublie({ onClose }: { onClose: () => void }) {
  const { enCours, magasin } = useCompteur();
  const [fin, setFin] = useState(() => versChampHeure(new Date().toISOString()));
  if (!enCours) return null;
  const debut = enCours.debut!;
  const finIso = depuisChampHeure(fin);
  const finOk = !!finIso && finIso > debut && Date.parse(finIso) <= Date.now() + 60_000;
  return (
    <Modal title="Compteur oublié ?" icone="chrono" onClose={onClose}>
      <p>
        Ton compteur tourne depuis {jourDe(Date.parse(debut)) === jourDe(Date.now()) ? '' : 'le '}
        {jourDe(Date.parse(debut)) === jourDe(Date.now()) ? '' : `${new Date(debut).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })}, `}
        {fmtHeure(debut)} ({fmtDuree(Date.now() - Date.parse(debut))}).
      </p>
      <div className="compteur-oubli">
        <button className="btn primary" onClick={() => { magasin.arreter(); onClose(); }}>Arrêter maintenant</button>
        <span className="compteur-oubli-a">
          <label>
            Arrêter à
            <input type="datetime-local" value={fin} min={versChampHeure(debut)} max={versChampHeure(new Date().toISOString())} onChange={(e) => setFin(e.target.value)} />
          </label>
          <button className="btn" disabled={!finOk} onClick={() => { magasin.arreter(finIso); onClose(); }}>Arrêter à cette heure</button>
        </span>
        <button className="btn" onClick={() => { magasin.continuer(); onClose(); }}>Continuer</button>
      </div>
    </Modal>
  );
}

/** Ajouter du temps à un autre jour (passé) : jour, durée, libellé. */
export function AjoutAutreJour({ onDone }: { onDone: () => void }) {
  const { setToast } = useStore();
  const { libelle: courant, magasin } = useCompteur();
  const auj = jourDe(Date.now());
  const [jour, setJour] = useState(decalerJour(auj, -1));
  const [heures, setHeures] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [libelle, setLibelle] = useState(courant);
  const total = heures * 60 + minutes;
  const ok = total > 0 && !!jour && jour <= auj;
  const valider = () => {
    if (!ok) return;
    magasin.ajouter(total, jour, libelle);
    setToast(`⏱ ${fmtDuree(total * 60_000)} ajoutées le ${new Date(`${jour}T12:00:00`).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })}`);
    onDone();
  };
  return (
    <div className="compteur-autre-jour">
      <label>Jour<input type="date" value={jour} max={auj} onChange={(e) => setJour(e.target.value)} /></label>
      <label>
        Durée
        <span className="compteur-duree">
          <input type="number" min={0} max={23} value={heures} onChange={(e) => setHeures(Math.max(0, Math.min(23, Number(e.target.value) || 0)))} aria-label="Heures" /> h
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutes">
            {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
          </select> min
        </span>
      </label>
      <label>Sur quoi ?<input value={libelle} maxLength={LIBELLE_MAX} placeholder="(facultatif)" onChange={(e) => setLibelle(e.target.value)} /></label>
      <span className="row">
        <button className="btn primary small" disabled={!ok} onClick={valider}>Ajouter</button>
        <button className="btn small" onClick={onDone}>Annuler</button>
      </span>
    </div>
  );
}

/** Réglages du compteur (Réglages, page « Mon temps »). */
export function ReglagesCompteur() {
  const { cloud } = useStore();
  const { reglages, serveur, enCours, magasin } = useCompteur();
  // Compteur retiré de la barre du haut pendant qu'il tourne : arrêté (il ne compte pas en cachette).
  const activer = (actif: boolean) => {
    if (!actif && enCours) magasin.arreter();
    magasin.regler({ actif });
  };
  return (
    <div className="compteur-reglages">
      <label className="inline">
        <input type="checkbox" checked={reglages.actif} onChange={(e) => activer(e.target.checked)} />
        Afficher mon compteur ⏱ dans la barre du haut
      </label>
      <label className="inline">
        <input type="checkbox" checked={reglages.auto} disabled={!reglages.actif} onChange={(e) => magasin.regler({ auto: e.target.checked })} />
        Mode automatique : compter aussi mon temps dans l’appli (quand je l’utilise)
      </label>
      <label className="compteur-reglage-oubli">
        Me demander si le compteur est oublié après
        <select value={reglages.oubliHeures} disabled={!reglages.actif} onChange={(e) => magasin.regler({ oubliHeures: Number(e.target.value) })}>
          {OUBLI_CHOIX.map((h) => <option key={h} value={h}>{h} h</option>)}
        </select>
      </label>
      <small className="muted">
        Indicatif et pour toi seul : personne d’autre ne voit ton compteur, admins compris.
        {reglages.auto && ' Le mode automatique compte le temps où l’appli est à l’écran et où tu as touché, cliqué ou fait défiler dans les 2 dernières minutes ; rien pendant que le compteur tourne (il compte déjà).'}
      </small>
      {cloud && serveur === 'absent' && (
        <small className="compteur-alerte">La mise à jour 067 du serveur n’est pas encore faite : ton compteur reste sur cet appareil pour l’instant (il sera envoyé ensuite).</small>
      )}
      {cloud && serveur === 'horsLigne' && <small className="muted">Hors ligne : ton compteur est gardé sur cet appareil et sera envoyé au retour de la connexion.</small>}
    </div>
  );
}
