import { useStore } from '../data/store';
import { InstallButton } from '../components/InstallButton';

export function Settings() {
  const { prefs, setPrefs, can, reset, login } = useStore();
  return (
    <div className="narrow">
      <h1>Réglages</h1>
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
      <section className="panel">
        <h2>Application</h2>
        <p className="muted">Installe Tâches GSA comme une application sur ton ordinateur ou ton téléphone : icône sur le bureau / l’écran d’accueil, fenêtre dédiée, ouverture même hors connexion.</p>
        <InstallButton />
      </section>
      <section className="panel">
        <h2>Données de démonstration</h2>
        <p className="muted">Les modifications sont conservées uniquement dans ce navigateur. La réinitialisation recharge les données fictives d'origine.</p>
        <button className="btn danger" onClick={() => { if (confirm('Réinitialiser toutes les données de démonstration ?')) { reset(); login(null); } }}>Réinitialiser la démo</button>
      </section>
    </div>
  );
}
