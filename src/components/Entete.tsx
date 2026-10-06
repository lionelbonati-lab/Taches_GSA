import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { defaultEntete, defaultTexte, enteteDe, enteteImage } from '../data/entete';
import { isImage } from '../data/logo';
import type { Entete } from '../data/types';
import { ImagePicker } from './ImagePicker';

// En-tête des documents imprimés (ordre du jour, PV, bon de paiement) : un seul pour toute l'entité, réglé dans la console admin.

const TAILLES: { id: Entete['taille']; label: string }[] = [
  { id: 'petite', label: 'Petite' },
  { id: 'moyenne', label: 'Moyenne' },
  { id: 'grande', label: 'Grande' },
  { id: 'pleine', label: 'Toute la largeur (bannière)' },
];
const DISPOSITIONS: { id: Entete['disposition']; label: string }[] = [
  { id: 'gauche', label: 'Image à gauche, texte à côté' },
  { id: 'opposes', label: 'Image à gauche, texte à droite' },
  { id: 'centre', label: 'Centré : image au-dessus du texte' },
  { id: 'droite', label: 'Texte à gauche, image à droite' },
];
const COULEURS = ['#1d4ed8', '#0f172a', '#047857', '#b91c1c', '#7c3aed', '#c2410c'];

/** Logo affiché par l'entité ouverte : le sien, sinon celui du club. */
export function useUnitLogo() {
  const club = useClubOptional();
  return club?.current.logo ?? club?.central?.logo;
}

/** En-tête tel qu'il s'imprime. */
export function DocEntete({ e, logo }: { e: Entete; logo?: string }) {
  const img = enteteImage(e, logo);
  const lines = e.texte.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!img && !lines.length) return null;
  return (
    <div className={`doc-entete d-${e.disposition} t-${e.taille} ${e.trait ? 'trait' : ''}`} style={{ color: e.couleur, borderColor: e.couleur }}>
      {img && <img className="doc-entete-img" data-img={img.key} src={img.src} alt="" />}
      {lines.length > 0 && (
        <div className="doc-entete-texte">
          {lines.map((l, i) => (i === 0 ? <strong key={i}>{l}</strong> : <span key={i}>{l}</span>))}
        </div>
      )}
    </div>
  );
}

/** En-tête de l'entité ouverte, tel que ses documents l'impriment. */
export function useEntete() {
  const { data } = useStore();
  const club = useClubOptional();
  return enteteDe(data, defaultTexte(club?.current));
}

/** Là où un document s'imprime : l'en-tête se règle dans la console admin (lien pour ses admins). */
export function LienEntete({ className = 'btn small' }: { className?: string }) {
  const { can } = useStore();
  if (!can('admin.access')) return null;
  return <Link to="/admin/entete" className={className} title="Le même pour l’ordre du jour, le PV et le bon de paiement">✏️ En-tête (console admin)</Link>;
}

/** Console admin : l'en-tête de tous les documents de l'entité, avec aperçu. */
export function EnteteReglage() {
  const { data, update, setToast } = useStore();
  const club = useClubOptional();
  const logo = useUnitLogo();
  const texte = defaultTexte(club?.current);
  const actuel = enteteDe(data, texte);
  const [e, setE] = useState<Entete>(actuel);
  const [err, setErr] = useState('');
  const set = (patch: Partial<Entete>) => {
    setErr('');
    setE((x) => ({ ...x, ...patch }));
  };
  const propre = (x: Entete): Entete => ({ ...x, texte: x.texte.trim(), imagePerso: x.image === 'perso' ? x.imagePerso : undefined });
  const modifie = JSON.stringify(propre(e)) !== JSON.stringify(propre(actuel));
  const parDefaut = JSON.stringify(propre(e)) === JSON.stringify(propre(defaultEntete(texte)));

  const save = () => {
    if (e.image === 'perso' && !isImage(e.imagePerso)) return setErr('Choisis l’image, ou une autre option.');
    update((d) => {
      d.entete = propre(e);
    }, 'En-tête des documents modifié');
    setToast('📄 En-tête enregistré : ordre du jour, PV et bon de paiement');
  };

  return (
    <section className="panel entete-reglage">
      <div className="form">
        <div className="full">
          <span className="field-label">Image</span>
          <div className="row wrap">
            <label className="inline"><input type="radio" name="entete-image" checked={e.image === 'logo'} onChange={() => set({ image: 'logo' })} /> {isImage(logo) ? 'Logo de l’entité' : 'Logo (pas encore de logo : console admin › Apparence)'}</label>
            <label className="inline"><input type="radio" name="entete-image" checked={e.image === 'perso'} onChange={() => set({ image: 'perso' })} /> Image propre (ex. papier à lettres)</label>
            <label className="inline"><input type="radio" name="entete-image" checked={e.image === 'aucune'} onChange={() => set({ image: 'aucune' })} /> Aucune</label>
          </div>
          {e.image === 'perso' && (
            <ImagePicker kind="banniere" value={e.imagePerso} onChange={(v) => set({ imagePerso: v, ...(v && !e.imagePerso ? { taille: 'pleine' } : {}) })} empty="Pas encore d’image" />
          )}
        </div>
        {e.image !== 'aucune' && (
          <label>
            Taille de l’image
            <select value={e.taille} onChange={(x) => set({ taille: x.target.value as Entete['taille'] })}>
              {TAILLES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
        )}
        <label>
          Disposition
          <select value={e.disposition} onChange={(x) => set({ disposition: x.target.value as Entete['disposition'] })}>
            {DISPOSITIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="full">
          Texte
          <textarea rows={4} value={e.texte} onChange={(x) => set({ texte: x.target.value })} placeholder={'G.S. Ajoie\nCase postale…, 2900 Porrentruy\nwww…'} />
          <small className="muted">Une information par ligne ; la première s’affiche en gras. Laisser vide pour n’avoir que l’image.</small>
        </label>
        <div className="full">
          <span className="field-label">Couleur</span>
          <div className="swatches">
            {COULEURS.map((c) => (
              <button key={c} type="button" className={`swatch ${c === e.couleur ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ couleur: c })} aria-label={`Couleur ${c}`} />
            ))}
            <input type="color" value={e.couleur} onChange={(x) => set({ couleur: x.target.value })} aria-label="Autre couleur" />
          </div>
        </div>
        <label className="inline full"><input type="checkbox" checked={e.trait} onChange={(x) => set({ trait: x.target.checked })} /> Trait sous l’en-tête</label>
      </div>
      <span className="field-label">Aperçu</span>
      <div className="entete-apercu">
        <div className="pv-sheet portrait t-normale">
          <header className="pv-head">
            <DocEntete e={e} logo={logo} />
            <p className="pv-kicker">Ordre du jour · Procès-verbal · Bon de paiement</p>
            <h1>Comité …</h1>
          </header>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row wrap">
        {!parDefaut && <button className="btn link" onClick={() => setE(defaultEntete(texte))}>Revenir à l’en-tête par défaut</button>}
        <span className="grow" />
        {modifie && <button className="btn" onClick={() => { setE(actuel); setErr(''); }}>Annuler</button>}
        <button className="btn primary" disabled={!modifie} onClick={save}>Enregistrer</button>
      </div>
    </section>
  );
}
