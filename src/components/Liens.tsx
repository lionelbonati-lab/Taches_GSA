import type { ReactNode } from 'react';
import type { Meeting } from '../data/types';
import { lienCarte } from '../data/lieux';

// Adresses web d'un texte libre (remarque, note, point de checklist) rendues cliquables :
// à l'écran, dans le PDF créé par l'appli et dans les archives.

const ADRESSE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Adresse sûre pour un lien (http, https, mailto), sinon rien. */
export const lienSur = (url: string) => (/^(https?:|mailto:)/i.test(url) ? url : /^www\./i.test(url) ? `https://${url}` : undefined);

/** Lien vers l'extérieur ; le clic n'ouvre pas la tâche autour. */
export function Lien({ href, children }: { href: string; children: ReactNode }) {
  const sur = lienSur(href);
  if (!sur) return <>{children}</>;
  return (
    <a href={sur} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}

/** Texte avec ses adresses web en liens (ponctuation finale laissée hors du lien). */
export function AvecLiens({ texte }: { texte: string }) {
  const out: ReactNode[] = [];
  let i = 0;
  for (const m of texte.matchAll(ADRESSE)) {
    let url = m[0];
    while (/[.,;:!?»”’'")\]]$/.test(url) && !(url.endsWith(')') && url.includes('('))) url = url.slice(0, -1);
    const debut = m.index ?? 0;
    if (debut > i) out.push(texte.slice(i, debut));
    out.push(<Lien key={debut} href={url}>{url}</Lien>);
    i = debut + url.length;
  }
  if (!out.length) return <>{texte}</>;
  if (i < texte.length) out.push(texte.slice(i));
  return <>{out}</>;
}

/** Lieu d'une séance : lien « voir sur la carte » quand il y est placé (écran, PDF, archives). */
export function LieuSeance({ m, vide = 'à définir' }: { m: Pick<Meeting, 'lieu' | 'lieuGeo'>; vide?: string }) {
  const nom = m.lieu?.trim() || (m.lieuGeo ? 'voir sur la carte' : vide);
  return m.lieuGeo ? <Lien href={lienCarte(m.lieuGeo)}>{nom}</Lien> : <>{nom}</>;
}
