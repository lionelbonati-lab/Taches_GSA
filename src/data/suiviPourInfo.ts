import { useContext, useEffect, useMemo, useState } from 'react';
import { useClubOptional } from './club';
import { cleVue, type Attendus } from './pourInfo';
import { StoreCtx } from './storeCtx';
import type { Task } from './types';

// Suivi des « Pour info » (052) : les personnes attendues des tâches (avec un compte ; entités : qui les reçoit), lues sur le
// serveur par lots et gardées 5 minutes (un compte créé entre-temps compte au plus tard 5 minutes après). Une tâche modifiée
// (updatedAt) est relue. Serveur sans 052 : rien, l'appli fait sans (bilanVu).

const DUREE = 5 * 60e3;
const lus = new Map<string, { at: number; attendus: Attendus }>();
const enCours = new Set<string>();
/** Entités dont le serveur ne donne pas encore le suivi (052). */
const sans052 = new Set<string>();
/** Composants à redessiner quand des réponses arrivent. */
const abonnes = new Set<() => void>();

const uniteDe = (t: Task, ici: string) => t.source?.uniteId ?? ici;
const idDe = (t: Task) => t.source?.id ?? t.id;
const cle = (t: Task, ici: string) => `${uniteDe(t, ici)}|${idDe(t)}|${t.updatedAt}`;

/**
 * Personnes attendues déjà lues pour la tâche, vues de l'entité ouverte `ici` ; undefined : pas (encore) connues. Vue du
 * club (`versClub`) : les personnes sous leur identifiant au club (comme ses « ✓ Vu », vueClub.ts).
 */
export function attendusLus(t: Task, ici: string, versClub?: (uniteId: string, fiche: string) => string): Attendus | undefined {
  const c = lus.get(cle(t, ici));
  if (!c) return undefined;
  const src = t.source?.uniteId;
  if (src && versClub)
    return [...new Set(c.attendus.map((k) => {
      const [g, a, b] = k.split(':');
      return g === 'p' ? `p:${versClub(src, a)}` : g === 'a' ? `p:${versClub(a, b)}` : k;
    }))];
  return src ? c.attendus.map((k) => cleVue(k, src, ici)).filter((k): k is string => !!k) : c.attendus;
}

/**
 * Personnes attendues des tâches « Pour info » `taches` (de l'entité ouverte, ou partagées avec elle), vues d'ici :
 * tâche → clés. Lues au besoin ; le composant se redessine quand elles arrivent.
 */
export function useSuiviPourInfo(taches: Task[]): Record<string, Attendus> {
  const club = useClubOptional();
  const versClub = useContext(StoreCtx)?.versClub;
  const ici = club?.current.id ?? '';
  const avec = taches.filter((t) => t.pourInfo && !t.paiement);
  const signature = avec.map((t) => cle(t, ici)).join(',');
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const redessiner = () => setTour((n) => n + 1);
    abonnes.add(redessiner);
    return () => { abonnes.delete(redessiner); };
  }, []);
  useEffect(() => {
    if (!club || !ici) return;
    const parUnite = new Map<string, Task[]>();
    for (const t of avec) {
      const k = cle(t, ici);
      const deja = lus.get(k);
      if (sans052.has(uniteDe(t, ici)) || enCours.has(k) || (deja && Date.now() - deja.at < DUREE)) continue;
      enCours.add(k);
      parUnite.set(uniteDe(t, ici), [...(parUnite.get(uniteDe(t, ici)) ?? []), t]);
    }
    for (const [u, l] of parUnite)
      club.suiviPourInfo(u, l.map(idDe)).then(
        (r) => {
          if (!r) sans052.add(u);
          // Tâche enregistrée il y a moins de 20 s : le serveur n'a peut-être pas encore sa dernière version (relue la prochaine fois).
          else for (const t of l) lus.set(cle(t, ici), { at: Date.parse(t.updatedAt) > Date.now() - 20e3 ? 0 : Date.now(), attendus: r[idDe(t)] ?? [] });
          for (const t of l) enCours.delete(cle(t, ici));
          abonnes.forEach((f) => f());
        },
        () => { for (const t of l) enCours.delete(cle(t, ici)); },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relu quand les tâches (ou leur version) changent
  }, [signature, ici]);
  // Même objet tant que rien ne change (dépendance de useMemo chez l'appelant).
  return useMemo(() => {
    const out: Record<string, Attendus> = {};
    for (const t of avec) {
      const a = attendusLus(t, ici, versClub);
      if (a) out[t.id] = a;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `avec` suit `signature`
  }, [signature, ici, tour, versClub]);
}
