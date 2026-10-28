import { useStore } from '../data/store';
import { InstallButton } from '../components/InstallButton';
import { useState } from 'react';
import { lireNotif, showSystemNotification, useNotifications } from '../notifications';
import type { NotifPrefs } from '../data/types';
import { PasswordForm } from './Real';
import { switchMode } from '../data/mode';
import { useClubOptional } from '../data/club';
import { nomAppli } from '../data/nomAppli';
import { PageIntro } from '../components/Nav';
import { AccueilModal, accueilPerso } from '../components/Accueil';
import { BarreBasModal } from '../components/BarreBas';
import { MesDonnees } from '../components/MesDonnees';
import { MonProfil } from '../components/MonProfil';
import { Icone } from '../components/icones';
import { NotifsPush } from '../components/NotifsPush';
import { useSetPrefsPartout } from '../data/entites';
import { useComites } from '../data/comites';
import { usePlusieursEntites } from '../components/ui';

export function Settings() {
  const { prefs, can, reset, login, cloud } = useStore();
  const club = useClubOptional();
  const comites = useComites();
  const plusieurs = usePlusieursEntites();
  // Vue « moi » : mes préférences sont les mêmes dans toutes mes entités.
  const setPrefs = useSetPrefsPartout();
  const [pwd, setPwd] = useState<'ferme' | 'ouvert' | 'ok'>('ferme');
  const [accueil, setAccueil] = useState(false);
  const [barreBas, setBarreBas] = useState(false);

  const { unread } = useNotifications();
  const n: NotifPrefs = lireNotif(prefs.notif);
  const setN = (patch: Partial<NotifPrefs>) => setPrefs({ notif: { ...n, ...patch } });
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [perm, setPerm] = useState<string>(supported ? Notification.permission : 'unsupported');
  const [testMsg, setTestMsg] = useState('');

  const toggleSystem = async (on: boolean) => {
    if (on && supported && Notification.permission !== 'granted') {
      const r = await Notification.requestPermission();
      setPerm(r);
      if (r !== 'granted') return setN({ systeme: false });
    }
    setN({ systeme: on });
  };
  const test = async () => {
    const body = unread.length ? unread.slice(0, 3).map((x) => `${x.icon} ${x.text}`).join('\n') : 'Aucune nouvelle notification. Bonne journée !';
    const ok = await showSystemNotification(`${nomAppli()} · rappel du matin`, body, unread[0]?.link ?? '/');
    setTestMsg(ok ? '✅ Notification envoyée à l’appareil.' : 'Impossible d’afficher une notification : autorise-les d’abord pour ce site.');
  };
  return (
    <div className="narrow">
      <h1>Réglages</h1>
      <PageIntro />
      {cloud && (
        <section className="panel account">
          <h2>Mon compte</h2>
          <p>
            Connecté en tant que <b>{cloud.email}</b>
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => setPwd(pwd === 'ouvert' ? 'ferme' : 'ouvert')}><Icone n="cle" /> Changer mon mot de passe</button>
            <button className="btn" onClick={cloud.signOut}>Se déconnecter</button>
          </div>
          {pwd === 'ouvert' && <PasswordForm onDone={() => setPwd('ok')} />}
          {pwd === 'ok' && <p className="backup-ok">✅ Mot de passe changé.</p>}
        </section>
      )}
      {club && <MonProfil />}
      {club && <MesDonnees />}
      <section className="panel form">
        <h2 className="full">Préférences personnelles</h2>
        {plusieurs && <p className="muted full" style={{ margin: 0 }}>Les mêmes dans toutes tes entités.</p>}
        <label>
          Thème
          <select value={prefs.theme} onChange={(e) => setPrefs({ theme: e.target.value as typeof prefs.theme })}>
            <option value="auto">Automatique (système)</option>
            <option value="clair">Clair</option>
            <option value="sombre">Sombre</option>
          </select>
        </label>
        {can('tasks.viewAll') && (
          <label>
            Vue par défaut des tâches
            <select value={prefs.vueDefaut} onChange={(e) => setPrefs({ vueDefaut: e.target.value as typeof prefs.vueDefaut })}>
              <option value="mes">Mes tâches</option>
              <option value="toutes">Toutes les tâches</option>
            </select>
          </label>
        )}
        <label>
          Affichage des tâches (ordinateur)
          <select value={prefs.affichage} onChange={(e) => setPrefs({ affichage: e.target.value as typeof prefs.affichage })}>
            <option value="tableau">Tableau</option>
            <option value="kanban">Kanban</option>
          </select>
        </label>
        <label>
          Phrase d’explication en haut des pages
          <select value={prefs.explications === false ? 'non' : 'oui'} onChange={(e) => setPrefs({ explications: e.target.value === 'oui' })}>
            <option value="oui">Afficher</option>
            <option value="non">Masquer</option>
          </select>
        </label>
        <div className="full row">
          <span className="grow">
            Mon accueil{' '}
            <small className="muted">{accueilPerso(prefs) ? '(personnalisé)' : '(tout est affiché, dans l’ordre d’origine)'}</small>
          </span>
          <button type="button" className="btn small" onClick={() => setAccueil(true)}><Icone n="reglages" /> Choisir les blocs et leur ordre</button>
        </div>
        {accueil && <AccueilModal onClose={() => setAccueil(false)} />}
        <div className="full row">
          <span className="grow">
            Barre du bas (téléphone){' '}
            <small className="muted">{prefs.barreBas ? '(personnalisée)' : '(onglets d’origine)'}</small>
          </span>
          <button type="button" className="btn small" onClick={() => setBarreBas(true)}><Icone n="reglages" /> Choisir les onglets</button>
        </div>
        {barreBas && <BarreBasModal onClose={() => setBarreBas(false)} />}
      </section>
      <section className="panel form">
        <h2 className="full">Notifications</h2>
        <p className="muted full" style={{ margin: 0 }}>Choisis ce qui s’affiche dans la cloche 🔔 de l’en-tête{plusieurs ? ', pour toutes tes entités' : ''}.</p>
        <h3 className="full notif-groupe">Tâches</h3>
        <label className="inline full"><input type="checkbox" checked={n.assign} onChange={(e) => setN({ assign: e.target.checked })} /> 🆕 Une tâche m’est confiée par quelqu’un d’autre, 👁 on me la met « pour info », ou 🙋 on me la propose (et quelqu’un prend ou décline une tâche que j’ai proposée)</label>
        <label className="inline full"><input type="checkbox" checked={n.modif} onChange={(e) => setN({ modif: e.target.checked })} /> ✏️ Une de mes tâches est modifiée par quelqu’un d’autre, ou reconduite</label>
        <label className="inline"><input type="checkbox" checked={n.echeance} onChange={(e) => setN({ echeance: e.target.checked })} /> ⏰ Échéance proche</label>
        <label>
          Prévenir
          <select value={n.echeanceJours} disabled={!n.echeance} onChange={(e) => setN({ echeanceJours: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7, 14].map((j) => <option key={j} value={j}>{j === 0 ? 'le jour même' : `${j} jour${j > 1 ? 's' : ''} avant`}</option>)}
          </select>
        </label>
        <label className="inline full"><input type="checkbox" checked={n.retard} onChange={(e) => setN({ retard: e.target.checked })} /> ⚠️ Mes tâches en retard (résumé quotidien)</label>
        <label className="inline full"><input type="checkbox" checked={n.email} onChange={(e) => setN({ email: e.target.checked })} /> 📧 Un email que j’ai programmé arrive à son heure d’envoi</label>
        <h3 className="full notif-groupe">Messagerie</h3>
        <label className="inline full"><input type="checkbox" checked={n.messages} onChange={(e) => setN({ messages: e.target.checked })} /> 💬 Quelqu’un écrit dans la discussion d’une tâche dont je m’occupe ou où j’ai écrit ; 📣 on me mentionne dans une discussion (@)</label>
        <h3 className="full notif-groupe">Agenda et sondages</h3>
        <label className="inline full"><input type="checkbox" checked={n.semaine} onChange={(e) => setN({ semaine: e.target.checked })} /> 📅 Résumé de ma semaine, le lundi matin : tâches à faire d’ici dimanche, séances, événements, sondages</label>
        <label className="inline full"><input type="checkbox" checked={n.sondage} onChange={(e) => setN({ sondage: e.target.checked })} /> 📊 Un sondage attend ma réponse</label>
        {(comites ? comites.canUn('tab.meetings') : can('tab.meetings')) && (
          <>
            <label className="inline"><input type="checkbox" checked={n.seance} onChange={(e) => setN({ seance: e.target.checked })} /> 🗓️ Prochaine séance de comité</label>
            <label>
              Prévenir
              <select value={n.seanceJours} disabled={!n.seance} onChange={(e) => setN({ seanceJours: Number(e.target.value) })}>
                {[1, 2, 3, 7, 14].map((j) => <option key={j} value={j}>{`${j} jour${j > 1 ? 's' : ''} avant`}</option>)}
              </select>
            </label>
          </>
        )}
        {cloud ? (
          <NotifsPush />
        ) : (
          <div className="full notif-device">
            <label className="inline">
              <input type="checkbox" checked={n.systeme && perm === 'granted'} disabled={!supported || perm === 'denied'} onChange={(e) => toggleSystem(e.target.checked)} />
              📲 Notifications de l’appareil (téléphone / ordinateur)
            </label>
            {!supported && <small className="muted">Ce navigateur ne gère pas les notifications. Sur iPhone, installe d’abord l’application sur l’écran d’accueil.</small>}
            {perm === 'denied' && <small className="muted">Notifications bloquées pour ce site : réautorise-les dans les réglages du navigateur.</small>}
            {n.systeme && perm === 'granted' && <button className="btn small" onClick={test}>Envoyer une notification de test</button>}
            {testMsg && <small>{testMsg}</small>}
            <small className="muted">Démo : les notifications de l’appareil s’affichent à l’ouverture de l’application. Dans la version réelle, elles arrivent même l’appli fermée.</small>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Application</h2>
        <p className="muted">Installe {nomAppli()} comme une application sur ton ordinateur ou ton téléphone : icône sur le bureau / l’écran d’accueil, fenêtre dédiée, ouverture même hors connexion.</p>
        <InstallButton />
      </section>
      {!cloud && <section className="panel">
        <h2>Données de démonstration</h2>
        <p className="muted">Les modifications sont conservées uniquement dans ce navigateur. La réinitialisation recharge les données de départ (tableau du club) et efface tout ce qui a été saisi : télécharge d’abord une sauvegarde (Console admin › Sauvegarde).</p>
        <div className="row wrap">
          <button className="btn danger" onClick={() => { if (confirm('Réinitialiser toutes les données de démonstration (toutes les entités du club) ? Tout ce qui a été saisi sera effacé (pense à télécharger une sauvegarde avant).')) { reset(); login(null); } }}>Réinitialiser la démo</button>
          <button className="btn" onClick={() => switchMode('reel')}><Icone n="verrou" /> Passer à la version réelle</button>
        </div>
      </section>}
    </div>
  );
}

