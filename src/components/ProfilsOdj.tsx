import { useState } from 'react';
import { useStore } from '../data/store';
import type { ProfilOdj, PvSettings } from '../data/types';
import { epurer } from '../data/styleDocs';
import { fmtDateTime, fullName, uid } from '../data/utils';
import { Icone } from './icones';

// Profils de l'ordre du jour : les réglages du moment (contenu, mise en page, et au choix la mise en forme) enregistrés
// sous un nom, communs à l'entité, puis réappliqués en un clic (« Comité ordinaire », « Assemblée générale »…).

/** Même valeur, sans tenir compte de l'ordre des clés ni des listes. */
const cle = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(cle).sort().join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => `${k}:${cle((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v ?? null);

const MAX_PROFILS = 30;

export function ProfilsOdj({ s, normaliser, appliquerReglages, canEdit }: {
  /** Réglages affichés. */
  s: PvSettings;
  /** Réglages complets (valeurs par défaut des réglages ajoutés depuis l'enregistrement du profil). */
  normaliser: (r: Partial<PvSettings>) => PvSettings;
  appliquerReglages: (r: PvSettings) => void;
  /** Droit « Comité › Ordre du jour » : enregistrer les profils, appliquer les réglages communs. */
  canEdit: boolean;
}) {
  const { data, user, update, setToast } = useStore();
  const profils = data.reglagesOdj?.profils ?? [];
  const joursApres = data.reglagesOdj?.joursApres ?? 0;
  const style = epurer(data.reglagesOdj?.style ?? {}) ?? {};
  const [nom, setNom] = useState('');
  const [avecStyle, setAvecStyle] = useState(true);
  const [renomme, setRenomme] = useState<{ id: string; nom: string } | null>(null);
  const [err, setErr] = useState('');

  const correspond = (p: ProfilOdj) =>
    cle(normaliser(p.reglages)) === cle(s) &&
    (p.joursApres === undefined || p.joursApres === joursApres) &&
    (!p.style || cle(epurer(p.style) ?? {}) === cle(style));
  const actif = profils.find(correspond);

  const ecrire = (fn: (l: ProfilOdj[]) => ProfilOdj[], msg: string) =>
    update((d) => {
      const l = fn(d.reglagesOdj?.profils ?? []);
      const { profils: _old, ...reste } = d.reglagesOdj ?? {};
      void _old;
      d.reglagesOdj = l.length ? { ...reste, profils: l } : reste;
    }, msg);
  const instantane = (p: Pick<ProfilOdj, 'id' | 'nom'>, garderStyle: boolean): ProfilOdj => ({
    ...p,
    reglages: s,
    joursApres,
    ...(garderStyle ? { style } : {}),
    par: user?.id,
    le: new Date().toISOString(),
  });
  const nomPris = (n: string, sauf?: string) => profils.some((p) => p.id !== sauf && p.nom.toLocaleLowerCase('fr') === n.toLocaleLowerCase('fr'));

  const enregistrer = () => {
    const n = nom.trim().slice(0, 60);
    if (!n) return setErr('Donne un nom au profil.');
    if (nomPris(n)) return setErr(`Un profil s’appelle déjà « ${n} » : choisis un autre nom, ou « 💾 » sur ce profil pour le remplacer.`);
    if (profils.length >= MAX_PROFILS) return setErr(`${MAX_PROFILS} profils au plus : supprime-en un.`);
    setErr('');
    setNom('');
    ecrire((l) => [...l, instantane({ id: uid('prof'), nom: n }, avecStyle)], `Ordre du jour : profil « ${n} » enregistré`);
  };
  const remplacer = (p: ProfilOdj) => {
    if (!confirm(`Remplacer le profil « ${p.nom} » par les réglages actuels ?`)) return;
    ecrire((l) => l.map((x) => (x.id === p.id ? instantane(x, !!x.style) : x)), `Ordre du jour : profil « ${p.nom} » mis à jour`);
  };
  const renommer = () => {
    if (!renomme) return;
    const n = renomme.nom.trim().slice(0, 60);
    const p = profils.find((x) => x.id === renomme.id);
    if (!n || !p) return setRenomme(null);
    if (nomPris(n, p.id)) return setErr(`Un profil s’appelle déjà « ${n} ».`);
    setErr('');
    setRenomme(null);
    if (n !== p.nom) ecrire((l) => l.map((x) => (x.id === p.id ? { ...x, nom: n } : x)), `Ordre du jour : profil « ${p.nom} » renommé « ${n} »`);
  };
  const supprimer = (p: ProfilOdj) => {
    if (!confirm(`Supprimer le profil « ${p.nom} » ? Les réglages actuels ne changent pas.`)) return;
    ecrire((l) => l.filter((x) => x.id !== p.id), `Ordre du jour : profil « ${p.nom} » supprimé`);
  };
  const deplacer = (p: ProfilOdj, sens: -1 | 1) =>
    ecrire((l) => {
      const i = l.findIndex((x) => x.id === p.id);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const m = [...l];
      [m[i], m[j]] = [m[j], m[i]];
      return m;
    }, `Ordre du jour : profils rangés`);

  const appliquer = (p: ProfilOdj) => {
    appliquerReglages(normaliser(p.reglages));
    // Réglages communs à l'entité : seulement avec le droit de les changer.
    const communs = canEdit && ((p.joursApres !== undefined && p.joursApres !== joursApres) || (p.style && cle(epurer(p.style) ?? {}) !== cle(style)));
    if (communs)
      update((d) => {
        d.reglagesOdj = {
          ...d.reglagesOdj,
          ...(p.joursApres !== undefined ? { joursApres: p.joursApres } : {}),
          ...(p.style ? { style: epurer(p.style) } : {}),
        };
      }, `Ordre du jour : profil « ${p.nom} » appliqué${p.style ? ' (avec sa mise en forme)' : ''}`);
    setToast(`Profil « ${p.nom} » appliqué.${!canEdit && p.style ? ' (Sa mise en forme est réglée par le comité.)' : ''}`);
  };

  const auteur = (p: ProfilOdj) => {
    const qui = data.people.find((x) => x.id === p.par);
    return [qui && fullName(qui), p.le && fmtDateTime(p.le)].filter(Boolean).join(', ');
  };

  if (!profils.length && !canEdit) return null;
  return (
    <details className="pv-profils">
      <summary>Profils{actif ? <span className="muted"> · {actif.nom}</span> : profils.length ? <span className="muted"> ({profils.length})</span> : null}</summary>
      <p className="muted small">
        Un profil garde les réglages du moment : contenu (parties, sections, statuts, tri, ce qui est affiché, annexes), orientation, taille du
        texte et, au choix, la mise en forme 🎨. Un clic sur son nom les rétablit. Communs à l’entité.
      </p>
      {profils.length > 0 && (
        <ul className="profils-odj">
          {profils.map((p, i) => (
            <li key={p.id} className={p === actif ? 'on' : ''}>
              {renomme?.id === p.id ? (
                <form className="row" onSubmit={(e) => { e.preventDefault(); renommer(); }}>
                  <input className="grow" value={renomme.nom} autoFocus maxLength={60} onChange={(e) => setRenomme({ id: p.id, nom: e.target.value })} aria-label="Nouveau nom du profil" />
                  <button className="btn small primary" type="submit">OK</button>
                  <button className="btn small" type="button" onClick={() => { setRenomme(null); setErr(''); }}>Annuler</button>
                </form>
              ) : (
                <>
                  <button type="button" className="profil-nom" onClick={() => appliquer(p)} aria-pressed={p === actif} title={`Appliquer ce profil${auteur(p) ? ` (enregistré par ${auteur(p)})` : ''}`}>
                    <span aria-hidden="true">{p === actif ? '✓' : '▸'}</span> {p.nom}
                    {p.style && <span className="muted" title="Avec sa mise en forme"> 🎨</span>}
                  </button>
                  {canEdit && (
                    <span className="profil-actions">
                      <button type="button" className="btn small link" onClick={() => remplacer(p)} title="Remplacer par les réglages actuels" aria-label={`Remplacer le profil ${p.nom} par les réglages actuels`}><Icone n="enregistrer" /></button>
                      <button type="button" className="btn small link" onClick={() => { setRenomme({ id: p.id, nom: p.nom }); setErr(''); }} title="Renommer" aria-label={`Renommer le profil ${p.nom}`}><Icone n="modifier" /></button>
                      {profils.length > 1 && <button type="button" className="btn small link" disabled={i === 0} onClick={() => deplacer(p, -1)} title="Monter" aria-label={`Monter le profil ${p.nom}`}><Icone n="monter" /></button>}
                      <button type="button" className="btn small link danger-link" onClick={() => supprimer(p)} title="Supprimer" aria-label={`Supprimer le profil ${p.nom}`}><Icone n="supprimer" /></button>
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {!profils.length && <p className="muted small">Aucun profil pour l’instant.</p>}
      {canEdit && (
        <form className="profil-nouveau" onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
          <label>
            Enregistrer les réglages actuels
            <input value={nom} maxLength={60} placeholder="Nom : Comité ordinaire, AG…" onChange={(e) => { setNom(e.target.value); setErr(''); }} aria-label="Nom du nouveau profil" />
          </label>
          <label className="inline">
            <input type="checkbox" checked={avecStyle} onChange={(e) => setAvecStyle(e.target.checked)} /> Avec la mise en forme (police, couleurs, marges…)
          </label>
          <button className="btn small primary" type="submit" disabled={!nom.trim()}><Icone n="enregistrer" /> Enregistrer le profil</button>
        </form>
      )}
      {err && <p className="error small">{err}</p>}
    </details>
  );
}
