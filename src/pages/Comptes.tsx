import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { accessAction, type CompteClub } from '../data/cloud';
import { fmtDateTime } from '../data/utils';
import { UNIT_TYPES } from '../data/units';
import { CredentialsModal, type Shown } from '../components/Acces';
import { AppLogo, Empty, Modal } from '../components/ui';
import { nomAppli } from '../data/nomAppli';

// Comptes du club (super-admins, hors des entités) : chaque compte, ses entités et sa fiche dans chacune ; nouveau mot de
// passe provisoire, blocage, fusion de deux comptes d'une même personne. Tout passe par la fonction gsa-acces
// (comptes.ts), qui vérifie que l'appelant est super-admin.

type Filtre = 'tous' | 'demandes' | 'provisoires' | 'bloques';

const nomCompte = (c: CompteClub) => [...new Set(c.entites.map((e) => e.fiche).filter((x): x is string => !!x))].join(' / ') || c.email;

/** Prénom et nom pour le message à transmettre (première fiche du compte). */
function personne(c: CompteClub): Shown['person'] {
  const fiche = c.entites.find((e) => e.fiche)?.fiche;
  if (!fiche) return { prenom: '', nom: c.email };
  const [prenom, ...reste] = fiche.split(' ');
  return { prenom, nom: reste.join(' ') };
}

export function Comptes({ intro }: { intro?: ReactNode }) {
  const [liste, setListe] = useState<CompteClub[] | null>(null);
  const [moi, setMoi] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [texte, setTexte] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [shown, setShown] = useState<(Shown & { intro: string }) | null>(null);
  const [fusion, setFusion] = useState<CompteClub | null>(null);

  const charger = useCallback(() => {
    accessAction<{ comptes: CompteClub[]; moi: string }>({ action: 'comptes' })
      .then((r) => {
        setListe(r.comptes);
        setMoi(r.moi);
        setErr('');
      })
      .catch((e: Error) => setErr(/action inconnue/i.test(e.message) ? 'Le serveur ne gère pas encore les comptes du club : la fonction « gsa-acces » doit d’abord être mise à jour.' : e.message));
  }, []);
  useEffect(charger, [charger]);

  const agir = async (c: CompteClub, action: 'reinitialiserCompte' | 'bloquer' | 'debloquer') => {
    const nom = nomCompte(c);
    const question =
      action === 'reinitialiserCompte'
        ? `Donner un nouveau mot de passe provisoire à ${nom} (${c.email}) ? L’actuel ne fonctionnera plus ; ses sessions ouvertes sont fermées.`
        : action === 'bloquer'
          ? `Bloquer le compte de ${nom} (${c.email}) ? Il ne pourra plus se connecter (l’accès en cours s’arrête dans l’heure au plus tard). Ses fiches et ses données restent.`
          : `Débloquer le compte de ${nom} (${c.email}) ?`;
    if (!confirm(question)) return;
    setBusy(c.user_id);
    setMsg('');
    try {
      const r = await accessAction<{ email?: string; password?: string }>({ action, userId: c.user_id });
      if (action === 'reinitialiserCompte' && r.password)
        setShown({ person: personne(c), email: r.email || c.email, password: r.password, intro: `Nouveau mot de passe provisoire pour ${nom}. Il devra le changer à sa connexion.` });
      else setMsg(action === 'bloquer' ? `⛔ ${nom} est bloqué.` : `✅ ${nom} est débloqué.`);
      charger();
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const compte = (f: Filtre) => (liste ?? []).filter((c) => (f === 'demandes' ? !!c.demande : f === 'provisoires' ? c.provisoire : f === 'bloques' ? c.bloque : true)).length;
  const visibles = useMemo(() => {
    const q = texte.trim().toLowerCase();
    return (liste ?? []).filter(
      (c) =>
        (filtre === 'tous' || (filtre === 'demandes' ? !!c.demande : filtre === 'provisoires' ? c.provisoire : c.bloque)) &&
        (!q || c.email.toLowerCase().includes(q) || c.entites.some((e) => (e.fiche ?? '').toLowerCase().includes(q) || e.nom.toLowerCase().includes(q))),
    );
  }, [liste, texte, filtre]);

  return (
    <div className="narrow comptes">
      <h1>Comptes du club</h1>
      {intro}
      {err && <p className="error">{err}</p>}
      {msg && <p className="panel" role="status">{msg}</p>}
      {liste === null && !err && <p className="muted">Chargement…</p>}
      {liste && (
        <>
          <div className="row wrap comptes-outils">
            <input type="search" placeholder="Rechercher un nom, une adresse, une entité…" value={texte} onChange={(e) => setTexte(e.target.value)} />
          </div>
          <div className="chips">
            {(
              [
                ['tous', 'Tous'],
                ['demandes', '🔑 Demandes'],
                ['provisoires', '⏳ Provisoires'],
                ['bloques', '⛔ Bloqués'],
              ] as [Filtre, string][]
            ).map(([f, label]) => (
              <button key={f} className={`chip ${filtre === f ? 'on' : ''}`} onClick={() => setFiltre(f)}>
                {label} ({compte(f)})
              </button>
            ))}
          </div>
          {!visibles.length && <Empty>Aucun compte.</Empty>}
          {visibles.map((c) => (
            <div key={c.user_id} className={`panel compte ${c.bloque ? 'bloque' : ''}`}>
              <div className="compte-tete">
                <span>
                  <b>{nomCompte(c)}</b>
                  <br />
                  <small className="muted">{c.email}</small>
                </span>
                <span className="compte-etats">
                  {c.user_id === moi && <span className="etiquette">c’est toi</span>}
                  {c.super_admin && <span className="etiquette">🛡️ super-admin</span>}
                  {c.bloque && <span className="etiquette danger">⛔ bloqué</span>}
                  {c.provisoire && <span className="etiquette">⏳ mot de passe provisoire</span>}
                  {c.demande && <span className="etiquette alerte">🔑 demande du {fmtDateTime(c.demande_le!)}</span>}
                </span>
              </div>
              <div className="compte-entites">
                {c.entites.length ? (
                  c.entites.map((e) => (
                    <span key={e.committeeId} className={`etiquette ${e.actif && !e.archive ? '' : 'eteinte'}`} title={e.actif ? (e.archive ? 'Entité archivée' : '') : 'Fiche désactivée ou retirée : pas d’accès'}>
                      {UNIT_TYPES[e.type]?.icon ?? '•'} {e.nom}
                      {e.owner ? ' 👑' : e.admin ? ' ★' : ''}
                    </span>
                  ))
                ) : (
                  <small className="muted">Aucune entité</small>
                )}
              </div>
              <small className="muted">{c.derniere_connexion ? `Dernière connexion : ${fmtDateTime(c.derniere_connexion)}` : 'Jamais connecté'}</small>
              <div className="row wrap compte-actions">
                <button className={`btn small ${c.demande ? 'primary' : ''}`} disabled={!!busy} onClick={() => agir(c, 'reinitialiserCompte')}>
                  🔑 {c.demande ? 'Valider la demande : nouveau mot de passe' : 'Nouveau mot de passe'}
                </button>
                {c.user_id !== moi && (
                  <button className={`btn small ${c.bloque ? '' : 'danger'}`} disabled={!!busy} onClick={() => agir(c, c.bloque ? 'debloquer' : 'bloquer')}>
                    {c.bloque ? '✅ Débloquer' : '⛔ Bloquer'}
                  </button>
                )}
                {liste.length > 1 && (
                  <button className="btn small" disabled={!!busy} onClick={() => setFusion(c)} title="Une même personne a deux comptes : on garde celui-ci, l’autre y est fondu">
                    🔗 Fusionner un autre compte dans celui-ci
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}
      {shown && <CredentialsModal {...shown} onClose={() => setShown(null)} />}
      {fusion && liste && (
        <Fusion
          garder={fusion}
          autres={liste.filter((x) => x.user_id !== fusion.user_id && x.user_id !== moi)}
          onClose={() => setFusion(null)}
          onDone={(m) => {
            setFusion(null);
            setMsg(m);
            charger();
          }}
        />
      )}
    </div>
  );
}

function Fusion({ garder, autres, onClose, onDone }: { garder: CompteClub; autres: CompteClub[]; onClose: () => void; onDone: (msg: string) => void }) {
  const [absorber, setAbsorber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const autre = autres.find((x) => x.user_id === absorber);
  const go = async () => {
    if (!autre) return;
    if (!confirm(`Fondre le compte ${autre.email} dans ${garder.email} ? Le compte ${autre.email} sera supprimé ; on ne peut pas revenir en arrière.`)) return;
    setBusy(true);
    setErr('');
    try {
      const r = await accessAction<{ deplaces: number; communes: number; fichesEnDouble: number; supprime: boolean; raison?: string }>({ action: 'fusionner', userId: garder.user_id, absorber: autre.user_id });
      onDone(
        `🔗 Fusion faite : ${r.deplaces} entité${r.deplaces > 1 ? 's' : ''} reprise${r.deplaces > 1 ? 's' : ''}` +
          (r.communes ? `, ${r.communes} en commun` : '') +
          (r.fichesEnDouble ? ` (dont ${r.fichesEnDouble} où la personne avait deux fiches : celle de ${garder.email} garde l’accès, l’autre reste sans compte)` : '') +
          `. ${r.supprime ? `Le compte ${autre.email} est supprimé.` : `Le compte ${autre.email} est bloqué (pas supprimé : ${r.raison}).`}`,
      );
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Fusionner deux comptes" onClose={onClose}>
      <p>
        On garde <b>{garder.email}</b> ({nomCompte(garder)}). Le compte choisi ci-dessous y est fondu : ses entités, sa fiche dans chacune, les tickets envoyés à la
        caisse centrale et les propositions passent à <b>{garder.email}</b>, puis il est supprimé.
      </p>
      <label className="full">
        Compte à fondre
        <select value={absorber} onChange={(e) => setAbsorber(e.target.value)}>
          <option value="">— choisir —</option>
          {autres.map((x) => (
            <option key={x.user_id} value={x.user_id}>
              {x.email} · {nomCompte(x)}
            </option>
          ))}
        </select>
      </label>
      {autre && (
        <p className="muted">
          Entités de {autre.email} : {autre.entites.map((e) => e.nom).join(', ') || 'aucune'}.
          {autre.super_admin && ' Il est super-admin : ce droit passe au compte gardé.'}
        </p>
      )}
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>Annuler</button>
        <span className="grow" />
        <button className="btn danger" disabled={!autre || busy} onClick={go}>{busy ? 'Fusion…' : '🔗 Fusionner'}</button>
      </div>
    </Modal>
  );
}

/** Super-admin sans entité du club : la page des comptes, seule. */
export function ComptesSeuls({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="comptes-seuls">
      <header className="row wrap">
        <AppLogo size={32} />
        <b>{nomAppli()}</b>
        <span className="grow" />
        <small className="muted">{email}</small>
        <button className="btn small" onClick={onSignOut}>Se déconnecter</button>
      </header>
      <Comptes intro={<p className="page-intro">Tu es super-admin du club, sans entité : tu gères ici les comptes de tout le club.</p>} />
    </div>
  );
}
