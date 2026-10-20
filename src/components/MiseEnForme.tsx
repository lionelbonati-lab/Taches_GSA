import { useState } from 'react';
import { useStore } from '../data/store';
import type { ElementDoc, StyleDocs, StyleElement } from '../data/types';
import { ELEMENTS, INTERLIGNES, MARGES, POLICES, TAILLES, epurer, styleDe, traitDuFond } from '../data/styleDocs';

// Mise en forme de l'ordre du jour et du PV : police, interligne, marges, puis chaque élément (taille, gras, couleur…).
// Commune à l'entité (réglages de l'ordre du jour), appliquée tout de suite à l'aperçu.

const COULEURS = ['#111111', '#475569', '#1d4ed8', '#047857', '#b91c1c', '#7c3aed', '#c2410c'];
// Fonds clairs (éléments encadrés) : le texte reste lisible ; blanc = sans fond. Le trait de l'encadré suit le fond.
const FONDS = ['#ffffff', '#f1f5f9', '#ecfdf5', '#fef9c3', '#fff7ed', '#fef2f2', '#f5f3ff'];

export function MiseEnForme({ disabled }: { disabled?: boolean }) {
  const { data, updateSilent } = useStore();
  const st = data.reglagesOdj?.style;
  const [id, setId] = useState<ElementDoc>('titre');
  const def = ELEMENTS.find((x) => x.id === id)!;
  const e = styleDe(st, id);
  const regle = (x: ElementDoc) => !!st?.elements?.[x];

  const changer = (fn: (x: StyleDocs) => StyleDocs) =>
    updateSilent((d) => {
      d.reglagesOdj = { ...d.reglagesOdj, style: epurer(fn(d.reglagesOdj?.style ?? {})) };
    });
  const setElement = (patch: Partial<StyleElement>) =>
    changer((x) => ({ ...x, elements: { ...x.elements, [id]: { ...x.elements?.[id], ...patch } } }));
  const couleurs = [...new Set([def.couleur, ...COULEURS])];
  const fonds = def.fond ? [...new Set([def.fond, ...FONDS])] : [];

  return (
    <div className="mef">
      <label>
        Police
        <select value={st?.police ?? ''} disabled={disabled} onChange={(x) => changer((s) => ({ ...s, police: (x.target.value || undefined) as StyleDocs['police'] }))}>
          {POLICES.map((p) => <option key={p.id} value={p.id} style={p.css ? { fontFamily: p.css } : undefined}>{p.label}</option>)}
        </select>
      </label>
      <label>
        Interligne
        <select value={st?.interligne ?? ''} disabled={disabled} onChange={(x) => changer((s) => ({ ...s, interligne: (x.target.value || undefined) as StyleDocs['interligne'] }))}>
          {INTERLIGNES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label>
        Marges
        <select value={st?.marges ?? ''} disabled={disabled} onChange={(x) => changer((s) => ({ ...s, marges: (x.target.value || undefined) as StyleDocs['marges'] }))}>
          {MARGES.map((p) => <option key={p.id} value={p.id} title={`${p.mm} mm`}>{p.label}</option>)}
        </select>
      </label>
      <label className="full">
        Élément à mettre en forme
        <select value={id} onChange={(x) => setId(x.target.value as ElementDoc)}>
          {ELEMENTS.map((x) => <option key={x.id} value={x.id}>{x.label}{regle(x.id) ? ' (modifié)' : ''}</option>)}
        </select>
      </label>
      <label>
        Taille
        <select value={e.taille} disabled={disabled} onChange={(x) => setElement({ taille: Number(x.target.value) })}>
          {TAILLES.map((n) => <option key={n} value={n}>{n} %</option>)}
        </select>
      </label>
      <div className="full chips mef-styles" role="group" aria-label="Style">
        <button type="button" className={`chip ${e.gras ? 'on' : ''}`} disabled={disabled} aria-pressed={e.gras} onClick={() => setElement({ gras: !e.gras })}><b>Gras</b></button>
        <button type="button" className={`chip ${e.italique ? 'on' : ''}`} disabled={disabled} aria-pressed={e.italique} onClick={() => setElement({ italique: !e.italique })}><i>Italique</i></button>
        <button type="button" className={`chip ${e.majuscules ? 'on' : ''}`} disabled={disabled} aria-pressed={e.majuscules} onClick={() => setElement({ majuscules: !e.majuscules })}>MAJUSCULES</button>
        {def.centrable && (
          <button type="button" className={`chip ${e.centre ? 'on' : ''}`} disabled={disabled} aria-pressed={e.centre} onClick={() => setElement({ centre: !e.centre })}>Centré</button>
        )}
      </div>
      <div className="full">
        <span className="field-label">Couleur</span>
        <div className="swatches">
          {couleurs.map((c) => (
            <button key={c} type="button" className={`swatch ${c === e.couleur ? 'on' : ''}`} style={{ background: c }} disabled={disabled} onClick={() => setElement({ couleur: c })} aria-label={`Couleur ${c}`} title={c === def.couleur ? 'Couleur par défaut' : undefined} />
          ))}
          <label className="swatch-perso" title="Autre couleur">
            <input type="color" value={e.couleur} disabled={disabled} onChange={(x) => setElement({ couleur: x.target.value })} aria-label="Autre couleur" />
          </label>
        </div>
      </div>
      {def.fond && e.fond && (
        <div className="full">
          <span className="field-label">Fond</span>
          <div className="swatches">
            {fonds.map((c) => (
              <button key={c} type="button" className={`swatch fond ${c === e.fond ? 'on' : ''}`} style={{ background: c, ['--trait' as string]: c === def.fond ? '#1d4ed8' : traitDuFond(c) }} disabled={disabled} onClick={() => setElement({ fond: c })} aria-label={`Fond ${c}`} title={c === def.fond ? 'Fond par défaut' : c === '#ffffff' ? 'Sans fond (blanc)' : undefined} />
            ))}
            <label className="swatch-perso" title="Autre fond">
              <input type="color" value={e.fond} disabled={disabled} onChange={(x) => setElement({ fond: x.target.value })} aria-label="Autre fond" />
            </label>
          </div>
        </div>
      )}
      {!disabled && (regle(id) || st) && (
        <div className="full row wrap">
          {regle(id) && <button type="button" className="btn small link" onClick={() => changer((s) => ({ ...s, elements: { ...s.elements, [id]: undefined } }))}>Rétablir cet élément</button>}
          {st && <button type="button" className="btn small link" onClick={() => changer(() => ({}))}>Tout rétablir</button>}
        </div>
      )}
      <small className="full muted">Commune à l’ordre du jour et au PV, pour tout le monde. Les documents archivés gardent la leur.</small>
    </div>
  );
}
