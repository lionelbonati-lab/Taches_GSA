import { useStore } from '../data/store';
import { InstallButton } from '../components/InstallButton';
import { useRef, useState } from 'react';
import { backupSummary, downloadBackup, lastBackupAt, makeBackup, readBackup, restoreFiles, setLastBackupAt } from '../data/backup';
import { fmtDateTime, fullName } from '../data/utils';
import { DEFAULT_NOTIF, showSystemNotification, useNotifications } from '../notifications';
import type { NotifPrefs } from '../data/types';
import { PasswordForm } from './Real';
import { switchMode } from '../data/mode';
import { useClubOptional } from '../data/club';

export function Settings() {
  const { data, user, prefs, setPrefs, can, reset, restore, login, cloud } = useStore();
  const club = useClubOptional();
  const [pwd, setPwd] = useState<'ferme' | 'ouvert' | 'ok'>('ferme');
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [last, setLast] = useState(lastBackupAt());
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = async () => {
    const b = await makeBackup(data, fullName(user ?? undefined));
    downloadBackup(b);
    setLastBackupAt(b.exportedAt);
    setLast(b.exportedAt);
    setBackupMsg({ ok: true, text: `✅ Sauvegarde téléchargée : ${backupSummary(b)}.` });
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const b = await readBackup(file);
      const unit = club ? `« ${club.current.nom} »` : 'du comité';
      const where = cloud ? `toutes les données ${club ? `de ${unit}` : unit} (pour tous ses membres)` : `toutes les données ${club ? `de ${unit} ` : ''}dans ce navigateur`;
      if (!confirm(`Remplacer ${where} par la sauvegarde du ${fmtDateTime(b.exportedAt)} ?\n${backupSummary(b)}`)) return;
      await restoreFiles(b.files);
      restore(b.data, `la sauvegarde du ${fmtDateTime(b.exportedAt)}`);
      setBackupMsg({ ok: true, text: `✅ Données restaurées : ${backupSummary(b)}.` });
    } catch (e) {
      setBackupMsg({ ok: false, text: (e as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const { unread } = useNotifications();
  const n: NotifPrefs = { ...DEFAULT_NOTIF, ...prefs.notif };
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
    const ok = await showSystemNotification('Tâches GSA · rappel du matin', body, unread[0]?.link ?? '/');
    setTestMsg(ok ? '✅ Notification envoyée à l’appareil.' : 'Impossible d’afficher une notification : autorise-les d’abord pour ce site.');
  };
  return (
    <div className="narrow">
      <h1>Réglages</h1>
      {cloud && (
        <section className="panel account">
          <h2>Mon compte</h2>
          <p>
            Connecté en tant que <b>{cloud.email}</b> · {cloud.membership.committeeName}
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => setPwd(pwd === 'ouvert' ? 'ferme' : 'ouvert')}>🔑 Changer mon mot de passe</button>
            <button className="btn" onClick={cloud.signOut}>Se déconnecter</button>
          </div>
          {pwd === 'ouvert' && <PasswordForm onDone={() => setPwd('ok')} />}
          {pwd === 'ok' && <p className="backup-ok">✅ Mot de passe changé.</p>}
        </section>
      )}
      <section className="panel form">
        <h2 className="full">Préférences personnelles</h2>
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
      </section>
      <section className="panel form">
        <h2 className="full">Notifications</h2>
        <p className="muted full" style={{ margin: 0 }}>Choisis ce qui s’affiche dans la cloche 🔔 de l’en-tête.</p>
        <label className="inline full"><input type="checkbox" checked={n.assign} onChange={(e) => setN({ assign: e.target.checked })} /> 🆕 Une tâche ou une sous-tâche m’est confiée par quelqu’un d’autre</label>
        <label className="inline full"><input type="checkbox" checked={n.modif} onChange={(e) => setN({ modif: e.target.checked })} /> ✏️ Une de mes tâches est modifiée par quelqu’un d’autre, ou reconduite</label>
        <label className="inline"><input type="checkbox" checked={n.echeance} onChange={(e) => setN({ echeance: e.target.checked })} /> ⏰ Échéance proche</label>
        <label>
          Prévenir
          <select value={n.echeanceJours} disabled={!n.echeance} onChange={(e) => setN({ echeanceJours: Number(e.target.value) })}>
            {[0, 1, 2, 3, 5, 7, 14].map((j) => <option key={j} value={j}>{j === 0 ? 'le jour même' : `${j} jour${j > 1 ? 's' : ''} avant`}</option>)}
          </select>
        </label>
        <label className="inline full"><input type="checkbox" checked={n.retard} onChange={(e) => setN({ retard: e.target.checked })} /> ⚠️ Mes tâches en retard (résumé quotidien)</label>
        <label className="inline full"><input type="checkbox" checked={n.sondage} onChange={(e) => setN({ sondage: e.target.checked })} /> 📊 Un sondage attend ma réponse</label>
        <label className="inline full"><input type="checkbox" checked={n.email} onChange={(e) => setN({ email: e.target.checked })} /> 📧 Un email que j’ai programmé arrive à son heure d’envoi</label>
        {can('tab.meetings') && (
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
        <div className="full notif-device">
          <label className="inline">
            <input type="checkbox" checked={n.systeme && perm === 'granted'} disabled={!supported || perm === 'denied'} onChange={(e) => toggleSystem(e.target.checked)} />
            📲 Notifications de l’appareil (téléphone / ordinateur)
          </label>
          {!supported && <small className="muted">Ce navigateur ne gère pas les notifications. Sur iPhone, installe d’abord l’application sur l’écran d’accueil.</small>}
          {perm === 'denied' && <small className="muted">Notifications bloquées pour ce site : réautorise-les dans les réglages du navigateur.</small>}
          {n.systeme && perm === 'granted' && <button className="btn small" onClick={test}>Envoyer une notification de test</button>}
          {testMsg && <small>{testMsg}</small>}
          <small className="muted">Démo : les notifications de l’appareil s’affichent à l’ouverture de l’application. Dans la version réelle, un serveur les enverra aussi application fermée (rappel du matin, nouvelle tâche…).</small>
        </div>
      </section>
      <section className="panel">
        <h2>Application</h2>
        <p className="muted">Installe Tâches GSA comme une application sur ton ordinateur ou ton téléphone : icône sur le bureau / l’écran d’accueil, fenêtre dédiée, ouverture même hors connexion.</p>
        <InstallButton />
      </section>
      <section className="panel backup">
        <h2>Sauvegarde des données</h2>
        {cloud ? (
          <p className="muted">
            Les données {club ? `de « ${club.current.nom} »` : 'du comité'} sont enregistrées sur le serveur et partagées entre ses membres. Une sauvegarde en garde une copie complète
            (tâches, séances, PV, sondages, emails, responsables, rôles, réglages et fichiers joints), par exemple chaque fin de saison.
          </p>
        ) : (
          <p className="muted">
            Dans la démo, les données ne sont enregistrées <b>que dans ce navigateur</b>, sur cet appareil. Une sauvegarde contient tout : tâches, séances, PV,
            sondages, emails, responsables, rôles, réglages et fichiers joints. Elle sert à passer à un autre appareil et à <b>reprendre tes données dans la
            version réelle</b> (première mise en route).
          </p>
        )}
        <div className="row wrap">
          <button className="btn primary" onClick={exportAll}>⬇ Télécharger une sauvegarde</button>
          {can('admin.access') && (
            <>
              <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Restaurer une sauvegarde…</button>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
            </>
          )}
        </div>
        <small className="muted">{last ? `Dernière sauvegarde depuis ce navigateur : ${fmtDateTime(last)}` : 'Aucune sauvegarde téléchargée depuis ce navigateur.'}</small>
        {backupMsg && <p className={backupMsg.ok ? 'backup-ok' : 'error'}>{backupMsg.text}</p>}
      </section>
      {!cloud && <section className="panel">
        <h2>Données de démonstration</h2>
        <p className="muted">Les modifications sont conservées uniquement dans ce navigateur. La réinitialisation recharge les données de départ (tableau du club) et efface tout ce qui a été saisi : télécharge d’abord une sauvegarde.</p>
        <div className="row wrap">
          <button className="btn danger" onClick={() => { if (confirm('Réinitialiser toutes les données de démonstration (toutes les entités du club) ? Tout ce qui a été saisi sera effacé (pense à télécharger une sauvegarde avant).')) { reset(); login(null); } }}>Réinitialiser la démo</button>
          <button className="btn" onClick={() => switchMode('reel')}>🔐 Passer à la version réelle</button>
        </div>
      </section>}
    </div>
  );
}
