import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../data/store';
import type { OrgUnit } from '../data/types';
import { getMode } from '../data/mode';
import { isImage } from '../data/logo';
import { NOM_MAX, NOM_ORIGINE, nomPropre } from '../data/nomAppli';
import {
  apercuIcone,
  apercuRaccourci,
  couleurRaccourcis,
  deposerIcone,
  deposerNom,
  empreinteLogo,
  iconeDeposee,
  iconePubliee,
  imageDeposee,
  NOMS_RACCOURCIS,
  retirerIcone,
  type VersionIcone,
} from '../data/icones';

type Etat = { deposee: VersionIcone | null; publiee: { version: string | null; refusee?: string } | null };

/** Console admin du comité central : nom et icône de l'appli installée (icône tirée du logo du club), version réelle. */
export function IconePanel({ club }: { club: OrgUnit }) {
  const { update, setToast } = useStore();
  const reel = getMode() === 'reel';
  const allowed = !!club.moiAdmin;
  const logo = isImage(club.logo) ? club.logo : undefined;
  const couleur = couleurRaccourcis(club.couleurAppli);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [busy, setBusy] = useState(false);
  const [apercu, setApercu] = useState<{ icone: string; raccourcis: string[]; empreinte: string } | null>(null);
  const [saisie, setSaisie] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [deposee, publiee] = await Promise.all([iconeDeposee(club.id), iconePubliee()]);
      setEtat({ deposee, publiee });
      setErreur('');
    } catch (e) {
      setErreur((e as Error).message);
    }
  }, [club.id]);

  // État relu à l'ouverture, au retour sur l'appli et toutes les 2 minutes (publication en cours).
  useEffect(() => {
    if (!reel) return;
    void charger();
    const relire = () => document.visibilityState === 'visible' && void charger();
    const t = setInterval(relire, 120_000);
    document.addEventListener('visibilitychange', relire);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', relire);
    };
  }, [reel, charger]);

  useEffect(() => {
    let actif = true;
    if (!logo) return setApercu(null);
    void (async () => {
      try {
        const [icone, raccourcis, empreinte] = await Promise.all([
          apercuIcone(logo),
          Promise.all(NOMS_RACCOURCIS.map((n) => apercuRaccourci(n, club.couleurAppli))),
          empreinteLogo(logo),
        ]);
        if (actif) setApercu({ icone, raccourcis, empreinte });
      } catch {
        if (actif) setApercu(null);
      }
    })();
    return () => {
      actif = false;
    };
  }, [logo, club.couleurAppli]);

  if (!reel)
    return (
      <section className="panel icone-panel">
        <h2>Nom et icône de l’appli installée</h2>
        <p className="muted">
          Dans la version réelle, les admins du comité central peuvent changer le nom de l’appli et remplacer l’icône d’origine (logo du G.S. Ajoie) par le logo du club.
        </p>
      </section>
    );

  const deposee = etat?.deposee ?? null;
  const nomDepose = deposee?.nom ?? '';
  const iconeClub = !!deposee?.icone;
  const aJour = !!deposee?.icone && !!apercu && deposee.logo === apercu.empreinte && deposee.couleur === couleur;
  const enLigne = !!etat && (etat.publiee?.version ?? null) === (deposee?.version ?? null);
  const refusee = !!deposee && etat?.publiee?.refusee === deposee.version;
  const heures = deposee ? (Date.now() - Date.parse(deposee.date)) / 3.6e6 : 0;
  const actuelle = (nom: string) => (deposee?.icone ? imageDeposee(club.id, nom, deposee.version) : `./${nom}`);

  const texte = saisie ?? nomDepose;
  const nomVoulu = nomPropre(texte);
  const nomRefuse = !!texte.trim() && !nomVoulu;
  const nouveauNom = nomVoulu === NOM_ORIGINE ? '' : nomVoulu;
  const nomChange = !nomRefuse && nouveauNom !== nomDepose;

  const action = async (fn: () => Promise<unknown>, journal: string, toast: string) => {
    setBusy(true);
    setErreur('');
    try {
      await fn();
      update(() => {}, journal);
      setToast(toast);
      setSaisie(null);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const utiliser = () =>
    action(() => deposerIcone(club.id, logo!, club.couleurAppli, nomDepose || undefined), 'Icône de l’appli : logo du club', 'Icône envoyée : en ligne dans l’heure');
  const origine = () => {
    if (!confirm('Revenir à l’icône d’origine (logo du G.S. Ajoie) pour l’appli installée ?')) return;
    void action(() => retirerIcone(club.id, nomDepose || undefined), 'Icône de l’appli : icône d’origine', 'Icône d’origine rétablie : en ligne dans l’heure');
  };
  const enregistrerNom = (nom: string) =>
    action(
      () => deposerNom(club.id, deposee, nom || undefined),
      `Nom de l’appli : « ${nom || NOM_ORIGINE} »`,
      `Nom « ${nom || NOM_ORIGINE} » envoyé : en ligne dans l’heure`,
    );

  return (
    <section className="panel icone-panel">
      <h2>Nom et icône de l’appli installée</h2>
      <p className="muted">Pour tout le club : écran d’accueil, accès rapides, notifications, onglet du navigateur. Le site les publie dans l’heure.</p>

      <h3>Nom</h3>
      <div className="row wrap nom-appli">
        <input
          value={texte}
          placeholder={NOM_ORIGINE}
          maxLength={NOM_MAX}
          disabled={!allowed || busy || !etat}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nomChange && void enregistrerNom(nouveauNom)}
          aria-label="Nom de l’appli"
        />
        {allowed && (
          <button className="btn primary" disabled={!nomChange || busy || !etat} onClick={() => void enregistrerNom(nouveauNom)}>
            Enregistrer le nom
          </button>
        )}
        {allowed && nomDepose && (
          <button className="btn link" disabled={busy} onClick={() => void enregistrerNom('')}>
            Reprendre « {NOM_ORIGINE} »
          </button>
        )}
      </div>
      {nomRefuse && <p className="error">Nom refusé : {NOM_MAX} caractères au plus, sans « &lt; » ni « &gt; ».</p>}
      <p className="muted small-note">
        Sous l’icône (coupé au-delà d’une douzaine de caractères), dans l’en-tête de l’appli, l’onglet du navigateur, les notifications et les emails d’accès.
      </p>

      <h3>Icône</h3>
      <p className="muted small-note">Les accès rapides (appui long sur l’icône) prennent la couleur de l’appli du club (vert du G.S. Ajoie tant qu’elle n’est pas choisie).</p>
      <div className="icone-apercus">
        <figure>
          <img className="icone-app" src={actuelle('icon-192.png')} alt="" />
          <figcaption>{etat ? (iconeClub ? 'Actuelle : logo du club' : 'Actuelle : d’origine') : 'Actuelle'}</figcaption>
        </figure>
        <div className="icone-raccourcis" aria-hidden>
          {NOMS_RACCOURCIS.map((n) => (
            <img key={n} src={actuelle(`${n}.png`)} alt="" />
          ))}
        </div>
        {apercu && !aJour && (
          <>
            <span className="icone-fleche" aria-hidden>→</span>
            <figure>
              <img className="icone-app" src={apercu.icone} alt="Aperçu de l’icône tirée du logo du club" />
              <figcaption>Avec le logo du club</figcaption>
            </figure>
            <div className="icone-raccourcis" aria-hidden>
              {apercu.raccourcis.map((src, i) => (
                <img key={NOMS_RACCOURCIS[i]} src={src} alt="" />
              ))}
            </div>
          </>
        )}
      </div>
      {allowed ? (
        <div className="row wrap">
          {logo && apercu && (!aJour || refusee) && (
            <button className="btn primary" disabled={busy || !etat} onClick={() => void utiliser()}>
              {busy ? 'Préparation…' : iconeClub ? 'Mettre à jour l’icône (logo et couleur actuels)' : 'Utiliser le logo du club comme icône'}
            </button>
          )}
          {iconeClub && (
            <button className="btn link" disabled={busy} onClick={origine}>
              Revenir à l’icône d’origine (G.S. Ajoie)
            </button>
          )}
          {!logo && <p className="muted small-note">Mets d’abord un logo du club ci-dessus.</p>}
        </div>
      ) : (
        <p className="muted small-note">Seuls les admins (★) du comité central changent le nom et l’icône de l’appli.</p>
      )}

      {etat && deposee && (
        <p className="small-note" role="status">
          {refusee
            ? '⚠️ La publication du site a refusé cet envoi : envoie-le à nouveau.'
            : enLigne
              ? '✓ En ligne. Une appli déjà installée les prend d’elle-même après un moment (Android) ; sinon, la supprimer puis la réinstaller.'
              : `Envoyé le ${new Date(deposee.date).toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' })} : le site le publie dans l’heure.`}
          {!enLigne && !refusee && heures > 3 && ' Toujours pas en ligne ? Sur GitHub : Actions › « Nom et icône de l’appli » › Run workflow.'}
        </p>
      )}
      {etat && !deposee && !enLigne && <p className="small-note" role="status">Nom et icône d’origine rétablis : le site les publie dans l’heure.</p>}
      {erreur && <p className="error">{erreur}</p>}
    </section>
  );
}
