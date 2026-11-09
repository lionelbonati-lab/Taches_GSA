import type { AppData, CadrePv, ContenuOdj, EtatPoint, Meeting, Section } from './types';
import { meetingContext } from './agenda';
import { committeeOf } from './polls';
import { finSeance } from './etatsPv';

// Cadre du PV, tel que le soir de la séance : le nom du comité, la séance (titre, heure, lieu), les sections (noms, ordre,
// sous-sections), les convoqués, la secrétaire, la séance suivante et les réglages de l'ordre du jour. Pris jusqu'à la
// fin du jour de la séance (à chaque changement du PV) ; un PV repris après coup, corrigé ou revalidé le garde tel quel :
// « comme si on était le soir de la séance ». Pas encore pris (PV ouvert seulement après la séance) : celui du moment,
// où les renommages faits depuis la séance (journal d'activité, sous-sections des points) sont défaits.

/** Le cadre tel qu'il est maintenant. */
export function cadreDe(data: AppData, s1: Meeting, o: { comite?: string; contenu: ContenuOdj; joursApres?: number }): CadrePv {
  const s2 = meetingContext(data, s1).s2;
  const secretaire = data.people.find((p) => p.actif && p.roles.includes('secretaire'));
  return {
    le: new Date().toISOString(),
    comite: o.comite,
    seance: { titre: s1.titre, heure: s1.heure, lieu: s1.lieu, lieuGeo: s1.lieuGeo },
    sections: data.sections.map((s) => ({ id: s.id, nom: s.nom, sousSections: [...s.sousSections] })),
    convoques: committeeOf(data).map((p) => p.id),
    secretaire: secretaire?.id,
    prochaine: s2 && { id: s2.id, titre: s2.titre, date: s2.date, heure: s2.heure, lieu: s2.lieu, lieuGeo: s2.lieuGeo },
    contenu: o.contenu,
    joursApres: o.joursApres,
  };
}

const SECTION = /^Section « (.+) » renommée en « (.+) »$/;
const SOUS_SECTION = /^Sous-section « (.+) » \((.+)\) renommée en « (.+) »(?: · .*)?$/;

/**
 * Cadre pris après la séance : les renommages notés depuis la fin du jour de la séance sont défaits (journal
 * d'activité : sections, sous-sections) ; une sous-section dont un point du PV portait encore l'ancien nom à la fin de
 * la séance (historique du point) le reprend, à sa place.
 */
export function cadreRetrouve(data: AppData, s1: Meeting, cadre: CadrePv, etats?: Record<string, EtatPoint>): CadrePv {
  const fin = finSeance(s1.date);
  const sections = cadre.sections.map((s) => ({ ...s, sousSections: [...s.sousSections] }));
  // Du plus récent au plus ancien : chaque renommage défait remet le nom qu'il avait juste avant.
  const apres = data.log.filter((l) => Date.parse(l.at) > fin).sort((a, b) => b.at.localeCompare(a.at));
  for (const l of apres) {
    const s = SECTION.exec(l.action);
    if (s) {
      const sec = sections.find((x) => x.nom === s[2]);
      if (sec) sec.nom = s[1];
      continue;
    }
    const ss = SOUS_SECTION.exec(l.action);
    if (ss) {
      const sec = sections.find((x) => x.nom === ss[2]);
      const i = sec ? sec.sousSections.indexOf(ss[3]) : -1;
      if (sec && i >= 0) sec.sousSections[i] = ss[1];
    }
  }
  for (const [id, e] of Object.entries(etats ?? {})) {
    const t = data.tasks.find((x) => x.id === id);
    const sec = sections.find((x) => x.id === e.sectionId);
    if (!t || !sec || !e.sousSection || sec.sousSections.includes(e.sousSection) || t.sectionId !== e.sectionId) continue;
    const i = sec.sousSections.indexOf(t.sousSection);
    if (i >= 0) sec.sousSections[i] = e.sousSection;
  }
  return { ...cadre, sections };
}

/**
 * Sections du PV selon son cadre : celles du soir de la séance, dans leur ordre et avec leurs noms d'alors ; une section
 * créée depuis, où se trouve un point du PV (ajouté en le corrigeant), à la suite.
 */
export function sectionsDuCadre(data: AppData, cadre: CadrePv, utilisees: Set<string>): Section[] {
  const alors = cadre.sections.map((c) => ({ ...(data.sections.find((s) => s.id === c.id) ?? ({} as Section)), ...c }) as Section);
  const ajoutees = data.sections.filter((s) => utilisees.has(s.id) && !cadre.sections.some((c) => c.id === s.id));
  return [...alors, ...ajoutees];
}
