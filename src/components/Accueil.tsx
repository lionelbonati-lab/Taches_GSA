import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import type { Prefs, Status } from '../data/types';
import { hasEdition } from './Edition';
import { Modal } from './ui';

/** Écran de téléphone : même limite que la mise en page (styles.css). */
const ETROIT = '(max-width: 767px)';

export function useTelephone() {
  const [tel, setTel] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(ETROIT).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(ETROIT);
    if (!mq) return;
    const maj = () => setTel(mq.matches);
    maj();
    mq.addEventListener?.('change', maj);
    return () => mq.removeEventListener?.('change', maj);
  }, []);
  return tel;
}

export type Appareil = 'telephone' | 'ordinateur';
type Element = { id: string; label: string; couleur?: string };

/** Blocs de l'accueil que la personne peut afficher ou masquer, dans l'ordre d'origine. */
export function useBlocsAccueil(): Element[] {
  const { can, guest } = useStore();
  const club = useClubOptional();
  const central = club?.current.type === 'central';
  return [
    { id: 'edition', label: '📅 Date de l’édition', si: hasEdition(club?.current) },
    { id: 'compteurs', label: '🔢 Compteurs de mes tâches', si: true },
    { id: 'retard', label: guest ? '⚠ Tâches en retard' : '⚠ Mes tâches en retard', si: true },
    { id: 'semaine', label: '📅 À faire dans les 7 jours', si: true },
    { id: 'demandes', label: central ? '📨 Demandes reçues' : '📨 Demandes au comité central', si: !!club && (central || !guest) },
    { id: 'emails', label: '📧 Mes emails à envoyer et programmés', si: true },
    { id: 'sondages', label: '📊 Sondages à voter', si: true },
    { id: 'seance', label: club?.current.type === 'equipe' ? '🗓️ Prochaine réunion' : '🗓️ Prochaine séance', si: can('tab.meetings') },
    { id: 'evenements', label: '🎪 Prochains événements', si: can('tab.events') },
  ]
    .filter((b) => b.si)
    .map(({ id, label }) => ({ id, label }));
}

/** Compteurs : un par statut de l'entité, puis « En retard ». */
export const compteursAccueil = (statuses: Status[]): Element[] => [
  ...statuses.map((s) => ({ id: s.id, label: s.label, couleur: s.couleur })),
  { id: 'retard', label: 'En retard', couleur: 'var(--late)' },
];

/** Ordre choisi ; un élément qu'il ne connaît pas (statut ajouté depuis…) reprend sa place d'origine. */
export function ordonner(ids: string[], ordre?: string[]) {
  if (!ordre?.length) return ids;
  const r = ordre.filter((x, i) => ids.includes(x) && ordre.indexOf(x) === i);
  ids.forEach((id, i) => {
    if (r.includes(id)) return;
    const avant = ids.slice(0, i).reverse().find((x) => r.includes(x));
    r.splice(avant ? r.indexOf(avant) + 1 : 0, 0, id);
  });
  return r;
}

/** La personne a changé son accueil (ordre ou blocs / compteurs masqués). */
export const accueilPerso = (p: Prefs) =>
  !!(p.accueilOrdre?.length || p.compteursOrdre?.length || p.accueilMasque?.telephone?.length || p.accueilMasque?.ordinateur?.length || p.compteursMasque?.telephone?.length || p.compteursMasque?.ordinateur?.length);

/** Ce que la personne voit sur son accueil, sur cet appareil, dans son ordre. */
export function useAccueil() {
  const { prefs, data } = useStore();
  const tel = useTelephone();
  const blocs = useBlocsAccueil();
  const appareil: Appareil = tel ? 'telephone' : 'ordinateur';
  const masques = prefs.accueilMasque?.[appareil] ?? [];
  const cMasques = prefs.compteursMasque?.[appareil] ?? [];
  const compteurs = compteursAccueil(data.statuses);
  return {
    appareil,
    blocs: ordonner(blocs.map((b) => b.id), prefs.accueilOrdre).filter((id) => !masques.includes(id)),
    compteurs: ordonner(compteurs.map((c) => c.id), prefs.compteursOrdre)
      .filter((id) => !cMasques.includes(id))
      .map((id) => compteurs.find((c) => c.id === id)!),
  };
}

const COLONNES: { a: Appareil; icone: string; label: string }[] = [
  { a: 'telephone', icone: '📱', label: 'Téléphone' },
  { a: 'ordinateur', icone: '💻', label: 'Ordinateur' },
];

/** Tableau d'éléments à cocher par appareil et à ranger (↑ ↓). */
function Rangement({ titre, elements, masque, ordre, appareil, setMasque, setOrdre }: {
  titre: string;
  elements: Element[];
  masque?: Prefs['accueilMasque'];
  ordre?: string[];
  appareil: Appareil;
  setMasque: (m: Prefs['accueilMasque']) => void;
  setOrdre: (o: string[]) => void;
}) {
  const ids = ordonner(elements.map((e) => e.id), ordre);
  const deplacer = (i: number, d: number) => {
    const l = [...ids];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    setOrdre(l);
  };
  const bascule = (a: Appareil, id: string, voir: boolean) => {
    const l = (masque?.[a] ?? []).filter((x) => x !== id);
    setMasque({ ...masque, [a]: voir ? l : [...l, id] });
  };
  return (
    <div className="table-scroll">
      <table className="table accueil-blocs">
        <thead>
          <tr>
            <th className="ordre" aria-label="Ordre" />
            <th>{titre}</th>
            {COLONNES.map((c) => (
              <th key={c.a} className={c.a === appareil ? 'ici' : ''} title={c.label}>
                {c.icone}<span className="hide-mobile"> {c.label}</span>
                {c.a === appareil && <small className="muted"> (ici)</small>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id, i) => {
            const e = elements.find((x) => x.id === id)!;
            return (
              <tr key={id}>
                <td className="ordre">
                  <button type="button" className="icon-btn" disabled={i === 0} aria-label={`Monter « ${e.label} »`} title="Monter" onClick={() => deplacer(i, -1)}>↑</button>
                  <button type="button" className="icon-btn" disabled={i === ids.length - 1} aria-label={`Descendre « ${e.label} »`} title="Descendre" onClick={() => deplacer(i, 1)}>↓</button>
                </td>
                <td>{e.couleur ? <span className="compteur-nom" style={{ borderLeftColor: e.couleur }}>{e.label}</span> : e.label}</td>
                {COLONNES.map((c) => (
                  <td key={c.a} className={c.a === appareil ? 'ici' : ''}>
                    <input type="checkbox" checked={!(masque?.[c.a] ?? []).includes(id)} onChange={(ev) => bascule(c.a, id, ev.target.checked)} aria-label={`${e.label} — ${c.label}`} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Choix et ordre des blocs et des compteurs de l'accueil ; affichage séparé sur téléphone et sur ordinateur. */
export function AccueilModal({ onClose }: { onClose: () => void }) {
  const { prefs, setPrefs, data } = useStore();
  const blocs = useBlocsAccueil();
  const { appareil } = useAccueil();
  return (
    <Modal title="Mon accueil" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Coche ce que tu veux voir, sur 📱 téléphone et sur 💻 ordinateur (tablette comprise) séparément ; ↑ ↓ change l’ordre, le même partout. Le réglage te suit sur tous tes appareils.
      </p>
      <Rangement
        titre="Blocs"
        elements={blocs}
        masque={prefs.accueilMasque}
        ordre={prefs.accueilOrdre}
        appareil={appareil}
        setMasque={(m) => setPrefs({ accueilMasque: m })}
        setOrdre={(o) => setPrefs({ accueilOrdre: o })}
      />
      <Rangement
        titre="Compteurs"
        elements={compteursAccueil(data.statuses)}
        masque={prefs.compteursMasque}
        ordre={prefs.compteursOrdre}
        appareil={appareil}
        setMasque={(m) => setPrefs({ compteursMasque: m })}
        setOrdre={(o) => setPrefs({ compteursOrdre: o })}
      />
      <p className="muted small-note">Sur ordinateur, quand des tâches et d’autres blocs se suivent, les tâches vont à gauche et les autres à droite, chacun dans cet ordre.</p>
      <div className="modal-foot">
        <button className="btn" disabled={!accueilPerso(prefs)} onClick={() => setPrefs({ accueilMasque: undefined, accueilOrdre: undefined, compteursMasque: undefined, compteursOrdre: undefined })}>
          Accueil d’origine
        </button>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </div>
    </Modal>
  );
}
