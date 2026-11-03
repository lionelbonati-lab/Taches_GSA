import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import type { Etiquette } from '../data/types';
import { fullName } from '../data/utils';
import { hasPermission, userRoles } from '../data/permissions';
import { aReprendre, etiquettesAReprendre, type ChoixEtiquette } from '../data/etiquettes';

// Pièces communes du réglage des étiquettes : la case « Étiquette » d'un événement, la coche « Groupe » d'une section,
// leurs membres, leur couleur (etiquettes.ts).

/** Couleur d'une étiquette : enregistrée une fois choisie (pas à chaque mouvement dans la palette). */
export function CouleurEtiquette({ valeur, onChange, disabled, label }: { valeur: string; onChange: (c: string) => void; disabled?: boolean; label: string }) {
  const [c, setC] = useState(valeur);
  const minuterie = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setC(valeur), [valeur]);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const envoyer = (x: string) => {
    clearTimeout(minuterie.current);
    if (x !== valeur) onChange(x);
  };
  return (
    <input type="color" value={c} disabled={disabled} aria-label={label}
      onChange={(e) => {
        const x = e.target.value;
        setC(x);
        clearTimeout(minuterie.current);
        minuterie.current = setTimeout(() => envoyer(x), 700);
      }}
      onBlur={() => envoyer(c)} />
  );
}

/** Membres d'une étiquette : ils voient ses points. « ＋ Le comité » : les personnes qui ont accès aux séances. */
export function MembresEtiquette({ membres, onChange, disabled, nom }: { membres: string[]; onChange: (m: string[]) => void; disabled?: boolean; nom: string }) {
  const { data } = useStore();
  const personnes = data.people.filter((p) => p.actif).sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));
  const comite = personnes.filter((p) => hasPermission(userRoles(data.roles, p), 'tab.meetings')).map((p) => p.id);
  const bascule = (id: string) => onChange(membres.includes(id) ? membres.filter((x) => x !== id) : [...membres, id]);
  return (
    <fieldset className="etiquette-personnes">
      <legend>Membres ({membres.length}) : ils voient les points de « {nom || '…'} »</legend>
      <div className="chips">
        {personnes.map((p) => {
          const on = membres.includes(p.id);
          return (
            <button key={p.id} type="button" className={`chip ${on ? 'on' : ''}`} disabled={disabled} aria-pressed={on} onClick={() => bascule(p.id)}>
              {fullName(p)}
            </button>
          );
        })}
      </div>
      {!disabled && comite.some((id) => !membres.includes(id)) && (
        <button type="button" className="btn small" onClick={() => onChange([...new Set([...membres, ...comite])])}>＋ Le comité</button>
      )}
    </fieldset>
  );
}

/** Nombre de points d'une étiquette (pour la choisir). */
const resume = (data: { tasks: { etiquettes?: string[] }[] }, e: Etiquette) => {
  const n = data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
  const m = e.membres?.length ?? 0;
  return `${n} point${n > 1 ? 's' : ''}, ${m} membre${m > 1 ? 's' : ''}`;
};

/**
 * Case « Étiquette » (formulaire d'un événement) ou coche « Groupe » (section) : cochée, on choisit les membres ; sans
 * étiquette reliée, on peut reprendre une ancienne étiquette (proposée d'office si elle a le même nom ou le même jour).
 */
export function CaseEtiquette({ titre, aide, deja, nom, date, valeur, onChange, disabled }: {
  titre: string;
  aide: string;
  deja?: Etiquette;
  nom: string;
  date?: string;
  valeur: ChoixEtiquette;
  onChange: (c: ChoixEtiquette) => void;
  disabled?: boolean;
}) {
  const { data } = useStore();
  const candidates = deja ? [] : etiquettesAReprendre(data, nom, date);
  const cocher = (on: boolean) => {
    if (!on) return onChange(null);
    const p = deja ? undefined : aReprendre(data, nom, date);
    onChange({ membres: deja?.membres ?? p?.membres ?? [], reprise: p?.id });
  };
  const reprendre = (id: string) => {
    const e = candidates.find((x) => x.id === id);
    onChange({ membres: e?.membres ?? valeur?.membres ?? [], reprise: e?.id });
  };
  return (
    <fieldset className="full case-etiquette">
      <label className="inline">
        <input type="checkbox" checked={!!valeur} disabled={disabled} onChange={(e) => cocher(e.target.checked)} /> <b>{titre}</b>
      </label>
      <small className="muted">{aide}</small>
      {valeur && candidates.length > 0 && (
        <label>
          Étiquette
          <select value={valeur.reprise ?? ''} disabled={disabled} onChange={(e) => reprendre(e.target.value)}>
            <option value="">Nouvelle étiquette</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>Reprendre « {e.nom} » ({resume(data, e)})</option>)}
          </select>
        </label>
      )}
      {valeur && <MembresEtiquette nom={nom} membres={valeur.membres} disabled={disabled} onChange={(membres) => onChange({ ...valeur, membres })} />}
    </fieldset>
  );
}
