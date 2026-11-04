import { useEffect, useState, type InputHTMLAttributes } from 'react';

/**
 * Champ enregistré en le quittant ou avec Entrée, pas à chaque touche (la valeur est commune et partagée) : motif d'une
 * absence ou d'un retard, heure d'arrivée.
 */
export function ChampValide({ valeur, onValider, ...props }: { valeur: string; onValider: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [texte, setTexte] = useState(valeur);
  useEffect(() => setTexte(valeur), [valeur]);
  const valider = () => {
    const v = texte.trim();
    if (v !== valeur) onValider(v);
  };
  return (
    <input
      {...props}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          valider();
        }
      }}
    />
  );
}
