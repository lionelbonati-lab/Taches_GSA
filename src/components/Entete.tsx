import { useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { DOC_LABEL, defaultEntete, enteteImage, enteteOf, type DocKind } from '../data/entete';
import { isImage } from '../data/logo';
import type { Entete } from '../data/types';
import { ImagePicker } from './ImagePicker';
import { Modal } from './ui';

// En-tête des documents imprimés (ordre du jour, PV) et son réglage, commun à toute l'entité.

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
export function DocEntete({ e, source, logo }: { e: Entete; source: DocKind | null; logo?: string }) {
  const img = enteteImage(e, source, logo);
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

/** Réglage de l'en-tête d'un document, avec aperçu. */
export function EnteteEditor({ doc, texte, onClose }: { doc: DocKind; texte: string; onClose: () => void }) {
  const { data, update } = useStore();
  const logo = useUnitLogo();
  const current = enteteOf(data, doc, texte);
  const [e, setE] = useState<Entete>(current.e);
  const [err, setErr] = useState('');
  const set = (patch: Partial<Entete>) => setE((x) => ({ ...x, ...patch }));
  const odj = data.entetes?.odj;
  const label = doc === 'odj' ? 'de l’ordre du jour' : 'du PV';

  const save = () => {
    if (e.image === 'perso' && !isImage(e.imagePerso)) return setErr('Choisis l’image, ou une autre option.');
    const clean: Entete = { ...e, texte: e.texte.trim(), imagePerso: e.image === 'perso' ? e.imagePerso : undefined };
    update((d) => {
      d.entetes = { ...d.entetes, [doc]: clean };
    }, `En-tête ${label} modifié`);
    onClose();
  };
  const reset = () => {
    update((d) => {
      const next = { ...d.entetes };
      delete next[doc];
      d.entetes = next;
    }, `En-tête ${label} : retour à l’en-tête ${doc === 'pv' && odj ? 'de l’ordre du jour' : 'par défaut'}`);
    onClose();
  };

  return (
    <Modal title={`En-tête ${label}`} onClose={onClose} wide>
      <p className="muted small-note">
        Commun à toute l’entité : chacun imprime {DOC_LABEL[doc]} avec cet en-tête.
        {doc === 'pv' && current.source === 'odj' && ' Pour l’instant, le PV reprend l’en-tête de l’ordre du jour.'}
      </p>
      <div className="form">
        <div className="full">
          <span className="field-label">Image</span>
          <div className="row wrap">
            <label className="inline"><input type="radio" name="entete-image" checked={e.image === 'logo'} onChange={() => set({ image: 'logo' })} /> {isImage(logo) ? 'Logo de l’entité' : 'Logo (pas encore de logo : console admin › Logo)'}</label>
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
            <DocEntete e={e} source={doc} logo={logo} />
            <p className="pv-kicker">{doc === 'odj' ? 'Ordre du jour' : 'Procès-verbal'}</p>
            <h1>Comité …</h1>
          </header>
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot wrap">
        {doc === 'pv' && odj && <button className="btn" onClick={() => setE({ ...defaultEntete(texte), ...odj })}>Reprendre l’en-tête de l’ordre du jour</button>}
        {current.source === doc && <button className="btn link" onClick={reset}>{doc === 'pv' && odj ? 'Revenir à l’en-tête de l’ordre du jour' : 'Revenir à l’en-tête par défaut'}</button>}
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" onClick={save}>Enregistrer</button>
      </div>
    </Modal>
  );
}
