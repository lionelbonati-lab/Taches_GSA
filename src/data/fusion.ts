// Fusion à trois versions d'un élément modifié en même temps par deux personnes (cloud.ts, migration 070).
// base : la version du serveur d'où partait la modification ; locale : celle de cet appareil ; serveur : la version
// actuelle du serveur. Chaque côté garde ce qu'il a changé par rapport à la base : deux votes dans le même sondage, ou
// une séance modifiée à deux endroits différents, se retrouvent tous les deux. Seul un même champ changé des deux côtés
// est un vrai conflit : la version locale (la dernière voulue) l'emporte, et la fusion le signale.

import { stable } from './stable';

type Obj = Record<string, unknown>;
const estObjet = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const avecId = (v: unknown): v is { id: unknown } => estObjet(v) && (typeof v.id === 'string' || typeof v.id === 'number');
const egal = (a: unknown, b: unknown) => stable(a) === stable(b);

export interface Fusion {
  valeur: unknown;
  /** Un même champ changé des deux côtés (la version locale a été gardée). */
  conflit: boolean;
}

export function fusionner(base: unknown, locale: unknown, serveur: unknown): Fusion {
  let conflit = false;
  const f = (b: unknown, l: unknown, s: unknown): unknown => {
    if (egal(l, s) || egal(b, s)) return l;
    if (egal(b, l)) return s;
    // Objet : champ par champ (un champ absent d'un côté = retiré de ce côté).
    if (estObjet(l) && estObjet(s)) {
      const bo = estObjet(b) ? b : {};
      const out: Obj = {};
      for (const k of new Set([...Object.keys(l), ...Object.keys(s), ...Object.keys(bo)])) {
        const v = f(bo[k], l[k], s[k]);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    if (Array.isArray(l) && Array.isArray(s)) {
      const ba = Array.isArray(b) ? b : [];
      // Liste de fiches (options d'un sondage, points d'une séance…) : fiche par fiche, d'après leur id.
      if ([...l, ...s].every(avecId)) {
        const parId = (a: unknown[]) => new Map((a.filter(avecId) as { id: unknown }[]).map((x) => [x.id, x as unknown]));
        const [bm, lm, sm] = [parId(ba), parId(l), parId(s)];
        const out: unknown[] = [];
        // Ordre local, puis les fiches ajoutées sur le serveur ; une fiche retirée d'un côté (et pas changée de l'autre)
        // disparaît.
        const ids = [...lm.keys(), ...[...sm.keys()].filter((id) => !lm.has(id))];
        for (const id of ids) {
          const [x, y, z] = [bm.get(id), lm.get(id), sm.get(id)];
          if (x !== undefined && (y === undefined || z === undefined)) {
            const reste = y ?? z;
            if (!egal(x, reste)) {
              // Retirée d'un côté, changée de l'autre : gardée (rien de perdu), signalé.
              conflit = true;
              out.push(reste);
            }
            continue;
          }
          out.push(y !== undefined && z !== undefined ? f(x, y, z) : (y ?? z));
        }
        return out;
      }
      // Liste de valeurs simples (votants, responsables…) : ajouts et retraits des deux côtés.
      if ([...l, ...s, ...ba].every((x) => x === null || typeof x !== 'object')) {
        const cle = (x: unknown) => stable(x);
        const [bk, sk] = [new Set(ba.map(cle)), new Set(s.map(cle))];
        const out = l.filter((x) => !(bk.has(cle(x)) && !sk.has(cle(x))));
        const vus = new Set(out.map(cle));
        for (const x of s)
          if (!bk.has(cle(x)) && !vus.has(cle(x))) {
            out.push(x);
            vus.add(cle(x));
          }
        return out;
      }
    }
    conflit = true;
    return l;
  };
  return { valeur: f(base, locale, serveur), conflit };
}
