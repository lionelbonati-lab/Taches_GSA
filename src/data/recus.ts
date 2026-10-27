import { useCallback, useEffect, useRef, useState } from 'react';
import type { Club } from './club';
import { entitesDependantes, evenementsDependants, type Externes } from './externes';
import type { SondagePartage, TachePartagee } from './types';
import { parentDans } from './units';

/**
 * Données venues des autres entités du club, en lecture (leurs modifications ne passent pas par la synchronisation de
 * l'entité) : relues à l'ouverture, au retour sur l'appli et chaque minute (entité en arrière-plan : toutes les
 * 5 minutes). `chargerPartagees` : les relire tout de suite.
 */
export function useRecus(club: Club | null) {
  const clubRef = useRef(club);
  clubRef.current = club;
  const moi = club?.current.id;
  const [partagees, setPartagees] = useState<TachePartagee[]>([]);
  const lecture = useRef(0);
  // Tâches d'autres entités pour info de celle-ci ou de l'une de ses personnes (lecture seule).
  const [pourInfoRecus, setPourInfoRecus] = useState<TachePartagee[]>([]);
  const lecturePourInfo = useRef(0);
  // Sondages des autres entités ouverts à celle-ci (null : le serveur ne les gère pas encore).
  const [sondagesRecus, setSondagesRecus] = useState<SondagePartage[]>([]);
  const [sondagesEntites, setSondagesEntites] = useState(false);
  const lectureSondages = useRef(0);
  // Séances du comité dont l'entité dépend ; agenda du club, si des événements dépendent d'elle (tâches liées : externes.ts) ;
  // sections des entités qui dépendent d'elle (tâche attribuée à l'une d'elles).
  const [externes, setExternes] = useState<Externes>({});
  const lectureExternes = useRef(0);
  const chargerPartagees = useCallback(() => {
    const c = clubRef.current;
    if (!c) return;
    const n = ++lecture.current;
    c.tachesPartagees()
      .then((l) => n === lecture.current && setPartagees(l))
      .catch(() => {});
    const i = ++lecturePourInfo.current;
    c.tachesPourInfo()
      .then((l) => i === lecturePourInfo.current && setPourInfoRecus(l ?? []))
      .catch(() => {});
    const s = ++lectureSondages.current;
    c.sondagesPartages()
      .then((l) => {
        if (s !== lectureSondages.current) return;
        setSondagesEntites(l !== null);
        setSondagesRecus(l ?? []);
      })
      .catch(() => {});
    const x = ++lectureExternes.current;
    const actives = c.units.filter((u) => !u.archive);
    const parent = c.current.type !== 'central' && parentDans(actives, c.current);
    if (parent) {
      c.seancesComite()
        .then((seances) => x === lectureExternes.current && setExternes((e) => ({ ...e, seances })))
        .catch(() => {});
    }
    if (evenementsDependants(c.units, c.current).length) {
      c.agendaClub()
        .then((agenda) => x === lectureExternes.current && setExternes((e) => ({ ...e, agenda })))
        .catch(() => {});
    }
    if (entitesDependantes(c.units, c.current).length) {
      c.sectionsDependantes()
        .then((sections) => x === lectureExternes.current && setExternes((e) => ({ ...e, sections })))
        .catch(() => {});
    }
  }, []);
  // Entité en arrière-plan (vue « moi ») : toutes les 5 minutes seulement.
  const arriere = !!club?.arrierePlan;
  useEffect(() => {
    chargerPartagees();
    const timer = setInterval(chargerPartagees, arriere ? 300_000 : 60_000);
    if (arriere) return () => clearInterval(timer);
    const vis = () => document.visibilityState === 'visible' && chargerPartagees();
    window.addEventListener('focus', chargerPartagees);
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', chargerPartagees);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [chargerPartagees, moi, arriere]);
  return { partagees, setPartagees, pourInfoRecus, sondagesRecus, setSondagesRecus, sondagesEntites, externes, chargerPartagees };
}
