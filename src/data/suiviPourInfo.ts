import { useEffect, useMemo, useState } from 'react';
import { useClubOptional } from './club';
import type { Attendus } from './pourInfo';
import type { Task } from './types';

// Suivi des « Pour info » (052) : les personnes attendues des tâches (avec un compte), lues sur le serveur par lots et
// gardées 5 minutes (un compte créé entre-temps compte au plus tard 5 minutes après). Une tâche modifiée (updatedAt) est
// relue. Serveur sans 052 : rien, l'appli fait sans (bilanVu).

const DUREE = 5 * 60e3;
const lus = new Map<string, { at: number; attendus: Attendus }>();
const enCours = new Set<string>();
/** Le serveur ne donne pas encore le suivi (052). */
let sans052 = false;
/** Composants à redessiner quand des réponses arrivent. */
const abonnes = new Set<() => void>();

const cle = (t: Task) => `${t.id}|${t.updatedAt}`;

/** Personnes attendues déjà lues pour la tâche ; undefined : pas (encore) connues. */
export const attendusLus = (t: Task): Attendus | undefined => lus.get(cle(t))?.attendus;

/** Personnes attendues des tâches « Pour info » `taches` : tâche → clés. Lues au besoin ; le composant se redessine quand elles arrivent. */
export function useSuiviPourInfo(taches: Task[]): Record<string, Attendus> {
  const club = useClubOptional();
  const avec = taches.filter((t) => t.pourInfo && !t.paiement);
  const signature = avec.map(cle).join(',');
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const redessiner = () => setTour((n) => n + 1);
    abonnes.add(redessiner);
    return () => { abonnes.delete(redessiner); };
  }, []);
  useEffect(() => {
    if (!club || sans052) return;
    const l = avec.filter((t) => {
      const k = cle(t);
      const deja = lus.get(k);
      return !enCours.has(k) && !(deja && Date.now() - deja.at < DUREE);
    });
    if (!l.length) return;
    l.forEach((t) => enCours.add(cle(t)));
    club.suiviPourInfo(l.map((t) => t.id)).then(
      (r) => {
        if (!r) sans052 = true;
        // Tâche enregistrée il y a moins de 20 s : le serveur n'a peut-être pas encore sa dernière version (relue la prochaine fois).
        else for (const t of l) lus.set(cle(t), { at: Date.parse(t.updatedAt) > Date.now() - 20e3 ? 0 : Date.now(), attendus: r[t.id] ?? [] });
        for (const t of l) enCours.delete(cle(t));
        abonnes.forEach((f) => f());
      },
      () => { for (const t of l) enCours.delete(cle(t)); },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relu quand les tâches (ou leur version) changent
  }, [signature]);
  // Même objet tant que rien ne change (dépendance de useMemo chez l'appelant).
  return useMemo(() => {
    const out: Record<string, Attendus> = {};
    for (const t of avec) {
      const a = attendusLus(t);
      if (a) out[t.id] = a;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `avec` suit `signature`
  }, [signature, tour]);
}
