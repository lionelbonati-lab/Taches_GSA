// Généré par « npm run fonction » depuis src/data/organigrammeServeur.ts (règles de l'organigramme) : ne pas modifier à la main.

// src/data/permissions.ts
var PERMISSIONS = [
  { id: "tasks.viewAll", label: "Voir toutes les tâches", group: "Tâches", sectionScoped: true },
  { id: "tasks.createAny", label: "Créer / assigner des tâches à d’autres", group: "Tâches", sectionScoped: true },
  { id: "tasks.editAny", label: "Modifier toutes les tâches", group: "Tâches", sectionScoped: true },
  { id: "tasks.editOwn", label: "Créer et modifier ses propres tâches", group: "Tâches", sectionScoped: true },
  { id: "tasks.delete", label: "Supprimer des tâches", group: "Tâches", sectionScoped: true },
  { id: "tab.meetings", label: "Comité › Séances (liste des séances, excuses)", group: "Pages visibles" },
  { id: "tab.events", label: "Agenda › Événements", group: "Pages visibles" },
  { id: "tab.people", label: "Organigramme : email et téléphone des personnes de l’entité (dans leur fiche)", group: "Pages visibles" },
  { id: "tab.pv", label: "Comité › Ordre du jour", group: "Pages visibles" },
  { id: "tab.minutes", label: "Comité › PV (prise de notes, PV)", group: "Pages visibles" },
  { id: "club.membres", label: "Membres du club (registre commun : coordonnées, IBAN, groupes)", group: "Pages visibles" },
  { id: "meetings.manage", label: "Gérer les séances de comité", group: "Gestion" },
  { id: "events.manage", label: "Gérer les événements", group: "Gestion" },
  { id: "people.manage", label: "Gérer les personnes de l’entité (ajouter, modifier leur fiche)", group: "Gestion" },
  { id: "polls.create", label: "Créer des sondages", group: "Gestion" },
  { id: "polls.manage", label: "Gérer tous les sondages (clôturer, supprimer)", group: "Gestion" },
  { id: "paiements.valider", label: "Paiements : peut viser (signer) les tickets, sur demande de la caisse", group: "Gestion" },
  { id: "paiements.payer", label: "Caisse : reçoit les tickets, demande les visas, fait les virements", group: "Gestion" },
  { id: "settings.lists", label: "Gérer sections / statuts", group: "Administration" },
  { id: "admin.access", label: "Accès console admin", group: "Administration" }
];
var ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id);
var ADMIN_ROLE_ID = "admin";

// src/data/utils.ts
var uid = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// src/data/units.ts
var UNIT_TYPES = {
  central: { label: "Comité central", plural: "Comité central", icon: "🏛️", chef: "Président", seances: "Comité", aide: "Direction du club." },
  "sous-comite": {
    label: "Sous-comité",
    plural: "Sous-comités",
    icon: "🎪",
    chef: "Président",
    seances: "Comité",
    aide: "Organisation d’un événement, avec son président et ses membres."
  },
  groupe: {
    label: "Groupe",
    plural: "Groupes",
    icon: "🚴",
    chef: "Responsable",
    seances: "Séances",
    aide: "Activité permanente du club (école de cyclisme, compétition…) avec ses propres membres (moniteurs…)."
  },
  equipe: {
    label: "Équipe d’événement",
    plural: "Équipes d’événement",
    icon: "🎉",
    chef: "Responsable",
    seances: "Réunions",
    aide: "Événement sans comité : quelques personnes, souvent déjà actives ailleurs dans le club."
  }
};
function parentDans(units, u) {
  if (u.type === "central") return void 0;
  const central = units.find((x) => x.type === "central");
  const parId = new Map(units.map((x) => [x.id, x]));
  const choisi = u.dependDe ? parId.get(u.dependDe) : void 0;
  if (!choisi || choisi.type === "central") return central;
  for (let p = choisi, n = 0; p && n <= units.length; p = p.dependDe ? parId.get(p.dependDe) : void 0, n++) {
    if (p.id === u.id) return central;
  }
  return choisi;
}
var MEMBER_PERMS = ["tasks.viewAll", "tasks.editOwn", "tab.meetings", "tab.events", "tab.people", "polls.create"];
var CAISSE_PERMS = [...MEMBER_PERMS, "paiements.payer"];
var CO_PERMS = [...MEMBER_PERMS, "events.manage"];
function defaultRoleId(roles) {
  const plain = roles.find((r) => r.id === "comite" || r.id === "membre");
  if (plain) return plain.id;
  const others = roles.filter((r) => r.id !== ADMIN_ROLE_ID).sort((a, b) => a.permissions.length - b.permissions.length);
  return others[0]?.id ?? ADMIN_ROLE_ID;
}

// src/data/membres.ts
var emailKey = (e) => (e ?? "").trim().toLowerCase();

// src/data/cablage.ts
var cle = (s) => (s ?? "").trim().toLowerCase();
function ficheDe(people, r) {
  const email = cle(r.email);
  const meme = (p) => !!r.membreId && p.membreId === r.membreId || !!email && cle(p.email) === email;
  return people.find((p) => meme(p) && p.actif) ?? people.find(meme);
}

// src/data/organigramme.ts
var cle2 = (s) => (s ?? "").trim().toLowerCase();
var liste = (s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
var fonctionsDe = (p) => [p.poste?.trim() ?? "", ...liste(p.autresPostes)].filter(Boolean);
var ecrire = (p, l) => {
  p.poste = l[0] ?? "";
  p.autresPostes = l.length > 1 ? l.slice(1).join(", ") : void 0;
};
var sansUne = (l, nom) => {
  const i = l.findIndex((x) => cle2(x) === cle2(nom));
  return i < 0 ? l : [...l.slice(0, i), ...l.slice(i + 1)];
};
var estEtoile = (p) => p.actif && p.roles.includes(ADMIN_ROLE_ID);
var nomDe = (p) => `${p.prenom} ${p.nom}`.trim() || p.poste?.trim() || p.email || "?";
var memeQui = (a, b) => !!a.membreId && a.membreId === b.membreId || !!emailKey(a.email) && emailKey(a.email) === emailKey(b.email);
var benevolesDe = (type) => type === "groupe" ? { un: "membre", plusieurs: "membres", titre: "Membres" } : { un: "bénévole", plusieurs: "bénévoles", titre: "Bénévoles" };
var nonAdmin = (roles) => roles.filter((r) => r.id !== ADMIN_ROLE_ID);
var parDroits = (l) => [...l].sort((a, b) => a.permissions.length - b.permissions.length);
var BENEVOLE = /^b[ée]n[ée]vole/i;
function roleBenevole(roles) {
  const l = nonAdmin(roles);
  return l.find((r) => r.id === "benevole")?.id ?? l.find((r) => BENEVOLE.test(r.label.trim()))?.id ?? parDroits(l.filter((r) => !r.locked && !r.permissions.includes("paiements.payer")))[0]?.id ?? parDroits(l)[0]?.id;
}
function roleResponsable(roles) {
  const ben = roleBenevole(roles);
  const def = defaultRoleId(roles);
  if (def !== ADMIN_ROLE_ID && def !== ben) return def;
  return parDroits(nonAdmin(roles).filter((r) => r.id !== ben && !r.permissions.includes("paiements.payer")))[0]?.id ?? ben;
}
var GENERIQUE = /^(b[ée]n[ée]vole|membre)s?\b/i;
function postesDeduits(d, type) {
  const ben = roleBenevole(d.roles);
  const out = [];
  for (const p of d.people) {
    if (!p.actif) continue;
    const etoile = p.roles.includes(ADMIN_ROLE_ID);
    const autres = p.roles.filter((r) => r !== ADMIN_ROLE_ID);
    const benevole = !etoile && autres.length > 0 && autres.every((r) => r === ben) && (ben === "benevole" || type === "groupe");
    if (benevole || !etoile && p.viaEntite && !fonctionsDe(p).length) continue;
    for (const nom of etoile ? liste(p.autresPostes) : fonctionsDe(p)) if (!GENERIQUE.test(nom)) out.push({ id: uid("po"), nom, titulaire: p.id });
  }
  return out;
}
var mots = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
function proche(postes2, nom, strict = false) {
  const m = new Set(mots(nom));
  let [meilleur, score] = strict ? [void 0, 0] : [postes2[0], -1];
  for (const p of postes2) {
    const s = mots(p.nom).filter((w) => m.has(w)).length;
    if (s > score) [meilleur, score] = [p, s];
  }
  return meilleur;
}
var GENERIQUES = /* @__PURE__ */ new Set(["comite", "central", "sous", "groupe", "equipe", "evenement", "responsable", "responsables", "president", "presidente", "chef"]);
var cleNom = (s) => [...new Set(mots(s).filter((w) => !GENERIQUES.has(w)))].sort().join(" ");
function entiteDuNom(units, nom, sauf) {
  const k = cleNom(nom);
  const l = k ? units.filter((u) => !u.archive && u.id !== sauf && cleNom(u.nom) === k) : [];
  return l.length === 1 ? l[0] : void 0;
}
function convertirPostes(units, data, prudent = false) {
  const neufs = units.filter((u) => {
    const d = data.get(u.id);
    return !!d && !d.postes;
  });
  for (const u of neufs) data.get(u.id).postes = postesDeduits(data.get(u.id), u.type);
  const actives = units.filter((u) => !u.archive);
  for (const u of actives) {
    const mere = parentDans(actives, u);
    const dm = mere && neufs.some((x) => x.id === mere.id) ? data.get(mere.id) : void 0;
    const du = data.get(u.id);
    if (!dm?.postes || !du) continue;
    for (const s of du.people.filter(estEtoile)) {
      const pm = dm.people.find((x) => x.actif && memeQui(x, s));
      if (!pm) continue;
      let po = proche(dm.postes.filter((x) => x.titulaire === pm.id && !x.lien), u.nom, prudent);
      if (!po) {
        po = { id: uid("po"), nom: `${UNIT_TYPES[u.type].chef} ${u.nom}`, titulaire: pm.id };
        dm.postes.push(po);
        ajouterFonction(pm, po.nom);
      }
      po.lien = u.id;
    }
  }
  const m = { units, data, notes: [], prudent };
  for (const u of neufs) if (!u.archive) lierNoms(m, u.id, data.get(u.id).postes.map((x) => x.id));
  return units.filter((u) => neufs.includes(u) || m.touchees?.has(u.id)).map((u) => u.id);
}
var quiDe = (p) => ({ prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.telephone, couleur: p.couleur, membreId: p.membreId });
function entite(m, id) {
  const u = m.units.find((x) => x.id === id);
  const d = m.data.get(id);
  if (!u || !d) throw new Error("Cette entité n’existe plus.");
  if (u.archive) throw new Error(`« ${u.nom} » est archivée.`);
  if (!d.postes) d.postes = postesDeduits(d, u.type);
  return { u, d, postes: d.postes };
}
var tenus = (d, p) => (d.postes ?? []).filter((x) => x.titulaire === p.id);
var reste = (d, p) => p.actif && (p.roles.includes(ADMIN_ROLE_ID) || tenus(d, p).length > 0);
function fiche(d, q, parLien = false) {
  const p = ficheDe(d.people, q);
  if (p) {
    if (!p.actif) Object.assign(p, { actif: true, roles: [], poste: "", autresPostes: void 0, parLien: parLien || void 0 });
    else if (!parLien) delete p.parLien;
    if (p.viaEntite || p.exclu) Object.assign(p, { viaEntite: void 0, viaFiche: void 0, exclu: void 0 });
    return p;
  }
  const n = {
    id: uid("p"),
    prenom: q.prenom.trim(),
    nom: q.nom.trim(),
    email: q.email.trim(),
    telephone: q.telephone?.trim() ?? "",
    couleur: q.couleur,
    poste: "",
    roles: [],
    actif: true,
    ...q.membreId ? { membreId: q.membreId } : {},
    ...parLien ? { parLien } : {}
  };
  d.people.push(n);
  return n;
}
function ajouterFonction(p, nom) {
  if (p.roles.includes(ADMIN_ROLE_ID)) p.autresPostes = [...liste(p.autresPostes), nom].join(", ");
  else ecrire(p, [...fonctionsDe(p), nom]);
}
function enleverFonction(p, nom) {
  if (p.roles.includes(ADMIN_ROLE_ID)) {
    const l = sansUne(liste(p.autresPostes), nom);
    p.autresPostes = l.length ? l.join(", ") : void 0;
  } else ecrire(p, sansUne(fonctionsDe(p), nom));
}
function donnerEtoile(d, u, p, titre) {
  if (p.roles.includes(ADMIN_ROLE_ID)) return false;
  const fns = fonctionsDe(p);
  p.poste = titre?.trim() || d.people.find((x) => x.id !== p.id && estEtoile(x) && x.poste.trim())?.poste.trim() || UNIT_TYPES[u.type].chef;
  p.autresPostes = fns.length ? fns.join(", ") : void 0;
  p.roles = [ADMIN_ROLE_ID, ...p.roles];
  return true;
}
function retirerEtoile(d, p) {
  if (!p.roles.includes(ADMIN_ROLE_ID)) return false;
  p.roles = p.roles.filter((r) => r !== ADMIN_ROLE_ID);
  ecrire(p, liste(p.autresPostes));
  if (!p.roles.length) p.roles = [(tenus(d, p).length ? roleResponsable(d.roles) : roleBenevole(d.roles)) ?? defaultRoleId(d.roles)];
  return true;
}
function retirerPoste(d, poste) {
  const p = poste.titulaire ? d.people.find((x) => x.id === poste.titulaire) : void 0;
  poste.titulaire = void 0;
  if (p) enleverFonction(p, poste.nom);
  return p?.actif ? p : void 0;
}
function donnerPoste(d, poste, p) {
  if (poste.titulaire === p.id && p.actif) return void 0;
  const ancien = retirerPoste(d, poste);
  poste.titulaire = p.id;
  ajouterFonction(p, poste.nom);
  if (!p.roles.includes(ADMIN_ROLE_ID)) {
    const ben = roleBenevole(d.roles);
    const resp = roleResponsable(d.roles);
    if (resp && (!p.roles.length || p.roles.every((r) => r === ben))) p.roles = [resp];
  }
  return ancien && ancien.id !== p.id ? ancien : void 0;
}
function rendreBenevole(d, p) {
  retirerEtoile(d, p);
  for (const x of tenus(d, p)) retirerPoste(d, x);
  p.roles = [roleBenevole(d.roles) ?? defaultRoleId(d.roles)];
}
function quitter(d, p) {
  for (const x of tenus(d, p)) x.titulaire = void 0;
  p.actif = false;
  delete p.parLien;
  if (p.viaEntite) p.exclu = true;
}
function liberer(d, p) {
  if (reste(d, p)) return;
  if (p.parLien) quitter(d, p);
  else rendreBenevole(d, p);
}
function etatLiens(m) {
  const out = /* @__PURE__ */ new Map();
  for (const u of m.units) {
    const d = m.data.get(u.id);
    if (u.archive || !d?.postes) continue;
    for (const x of d.postes) {
      const c = x.lien ? m.units.find((v) => v.id === x.lien && !v.archive && v.id !== u.id) : void 0;
      const dc = c && m.data.get(c.id);
      if (!c || !dc) continue;
      const h = x.titulaire ? d.people.find((p) => p.id === x.titulaire && p.actif) : void 0;
      out.set(`${u.id}|${x.id}`, { a: u.id, poste: x.id, c: c.id, h: h && quiDe(h), etoiles: dc.people.filter(estEtoile).map(quiDe) });
    }
  }
  return out;
}
var dans = (l, q) => !!q && l.some((x) => memeQui(x, q));
var titulairesLies = (d, c, sauf) => (d.postes ?? []).flatMap((x) => {
  const p = x.id !== sauf && x.lien === c && x.titulaire ? d.people.find((y) => y.id === x.titulaire && y.actif) : void 0;
  return p ? [p] : [];
});
var etoilesLibres = (d, c, etoiles, sauf) => {
  const pris = titulairesLies(d, c, sauf);
  return etoiles.filter((e) => !pris.some((p) => memeQui(p, e)));
};
function synchroniser(m, avant) {
  for (let tour = 0; tour < 8; tour++) {
    let change = false;
    for (const [k, l] of etatLiens(m)) {
      const b = avant.get(k);
      if (!b) continue;
      const A = entite(m, l.a);
      const C = entite(m, l.c);
      const poste = A.postes.find((x) => x.id === l.poste);
      const pChange = l.h ? !b.h || !memeQui(b.h, l.h) : !!b.h;
      if (pChange) {
        if (b.h && dans(l.etoiles, b.h) && !titulairesLies(A.d, C.u.id, poste.id).some((p) => memeQui(p, b.h))) {
          const x = ficheDe(C.d.people, b.h);
          if (x && estEtoile(x)) {
            retirerEtoile(C.d, x);
            liberer(C.d, x);
            if (!l.h) m.notes.push(`${nomDe(x)} n’est plus ★ de « ${C.u.nom} »`);
            change = true;
          }
        }
        if (l.h && !dans(l.etoiles, l.h)) {
          const p = fiche(C.d, l.h, true);
          donnerEtoile(C.d, C.u, p);
          m.notes.push(`★ de « ${C.u.nom} » : ${nomDe(p)}`);
          change = true;
        }
        continue;
      }
      let libre = !l.h;
      let libere = false;
      if (l.h && !dans(l.etoiles, l.h)) {
        const x = retirerPoste(A.d, poste);
        if (x) liberer(A.d, x);
        change = libre = libere = true;
      }
      const n = libre ? etoilesLibres(A.d, C.u.id, l.etoiles.filter((e) => !dans(b.etoiles, e)), poste.id)[0] : void 0;
      if (n) {
        const p = fiche(A.d, n, true);
        donnerPoste(A.d, poste, p);
        m.notes.push(`${poste.nom} de « ${A.u.nom} » : ${nomDe(p)}`);
        change = true;
      } else if (libere) m.notes.push(`${poste.nom} de « ${A.u.nom} » : à pourvoir`);
    }
    if (!change) return;
  }
}
function placer(m, qui, depuis, vers) {
  const ici = !!depuis && vers.zone !== "corbeille" && vers.uniteId === depuis.uniteId;
  if (depuis && ici) {
    if (vers.zone === depuis.zone && (vers.zone !== "poste" || vers.posteId === depuis.posteId)) return "";
    if (vers.zone === "etoile" && depuis.zone === "titre" && vers.personId === depuis.personId) return "";
    if (vers.zone === "poste" && depuis.zone === "titre" && entite(m, vers.uniteId).postes.find((x) => x.id === vers.posteId)?.titulaire === depuis.personId) return "";
  }
  let p;
  let quitte = "";
  if (depuis) {
    const A = entite(m, depuis.uniteId);
    const avant2 = etatLiens(m);
    const x = A.d.people.find((y) => y.id === depuis.personId && y.actif);
    if (!x) throw new Error("Cette personne ne fait plus partie de l’entité.");
    const po = depuis.zone === "poste" ? A.postes.find((y) => y.id === depuis.posteId && y.titulaire === x.id) : void 0;
    const quoi = depuis.zone === "titre" ? `★ (${(x.poste || UNIT_TYPES[A.u.type].chef).toLowerCase()})` : po ? po.nom : benevolesDe(A.u.type).un;
    if (depuis.zone === "titre") retirerEtoile(A.d, x);
    else if (po) retirerPoste(A.d, po);
    if (ici) p = x;
    else if (!reste(A.d, x)) {
      quitter(A.d, x);
      quitte = A.u.nom;
    }
    synchroniser(m, avant2);
    if (vers.zone === "corbeille") return quitte ? `${nomDe(x)} retiré de « ${A.u.nom} »` : `${nomDe(x)} n’est plus ${quoi} de « ${A.u.nom} »`;
  }
  if (vers.zone === "corbeille") return "";
  const B = entite(m, vers.uniteId);
  const avant = etatLiens(m);
  p ??= fiche(B.d, qui);
  delete p.parLien;
  const nom = nomDe(p);
  const chef = UNIT_TYPES[B.u.type].chef;
  let msg;
  if (vers.zone === "titre") {
    msg = donnerEtoile(B.d, B.u, p) ? `★ ${nom} : ${p.poste.toLowerCase()} de « ${B.u.nom} »` : `${nom} est déjà ★ de « ${B.u.nom} »`;
  } else if (vers.zone === "etoile") {
    const x = B.d.people.find((y) => y.id === vers.personId && estEtoile(y) && y.id !== p.id);
    const titre = x?.poste;
    if (x) {
      retirerEtoile(B.d, x);
      liberer(B.d, x);
    }
    donnerEtoile(B.d, B.u, p, titre);
    msg = `★ ${nom} : ${(p.poste || chef).toLowerCase()} de « ${B.u.nom} »${x ? ` à la place de ${nomDe(x)}` : ""}`;
  } else if (vers.zone === "poste") {
    const po = B.postes.find((y) => y.id === vers.posteId);
    if (!po) throw new Error("Ce poste n’existe plus.");
    const ancien = donnerPoste(B.d, po, p);
    if (ancien) liberer(B.d, ancien);
    msg = `${nom} : ${po.nom} de « ${B.u.nom} »${ancien ? ` à la place de ${nomDe(ancien)}` : ""}`;
  } else if (vers.zone === "nouveau") {
    const n = vers.nom.trim();
    if (!n) throw new Error("Donne un nom au poste.");
    const po = { id: uid("po"), nom: n };
    B.postes.push(po);
    donnerPoste(B.d, po, p);
    msg = `Nouveau poste « ${n} » dans « ${B.u.nom} » : ${nom}`;
    synchroniser(m, avant);
    lierNoms(m, B.u.id, [po.id]);
    return msg + (quitte ? ` (quitte « ${quitte} »)` : "");
  } else {
    rendreBenevole(B.d, p);
    msg = `${nom} : ${benevolesDe(B.u.type).un} de « ${B.u.nom} »`;
  }
  synchroniser(m, avant);
  return msg + (quitte ? ` (quitte « ${quitte} »)` : "");
}
function lier(m, uniteId, posteId, lien) {
  const A = entite(m, uniteId);
  const po = A.postes.find((x) => x.id === posteId);
  if (!po) throw new Error("Ce poste n’existe plus.");
  if (!lien) {
    const avant2 = m.units.find((u) => u.id === po.lien);
    po.lien = void 0;
    return `« ${po.nom} » n’est plus lié${avant2 ? ` à « ${avant2.nom} »` : ""}`;
  }
  if (lien === uniteId) throw new Error("Un poste se lie au ★ d’une autre entité.");
  const C = entite(m, lien);
  const avant = etatLiens(m);
  const h = po.titulaire ? A.d.people.find((x) => x.id === po.titulaire && x.actif) : void 0;
  const etoiles = C.d.people.filter(estEtoile);
  const libre = etoilesLibres(A.d, C.u.id, etoiles.map(quiDe), po.id)[0];
  let suite = "";
  if (!h && libre) {
    donnerPoste(A.d, po, fiche(A.d, libre, true));
    suite = ` : ${nomDe(libre)}`;
  } else if (!h) {
    suite = " : à pourvoir";
  } else if (!etoiles.some((e) => memeQui(e, h))) {
    donnerEtoile(C.d, C.u, fiche(C.d, quiDe(h), true));
    suite = ` : ${nomDe(h)} devient ${etoiles.length ? "co-responsable (★)" : "★"} de « ${C.u.nom} »`;
  }
  po.lien = lien;
  synchroniser(m, avant);
  return `« ${po.nom} » de « ${A.u.nom} » lié au ★ de « ${C.u.nom} »${suite}`;
}
function lierNoms(m, uniteId, ids) {
  const A = entite(m, uniteId);
  for (const id of ids) {
    const po = A.postes.find((x) => x.id === id);
    const c = po && !po.lien ? entiteDuNom(m.units, po.nom, uniteId) : void 0;
    const dc = c && m.data.get(c.id);
    if (!po || !c || !dc || m.peut && !m.peut(c.id)) continue;
    if (m.prudent) {
      const h = po.titulaire ? A.d.people.find((x) => x.id === po.titulaire && x.actif) : void 0;
      if (!h || !dc.people.some((x) => estEtoile(x) && memeQui(x, h))) continue;
    }
    const avant = new Map(m.units.map((u) => [u.id, JSON.stringify(m.data.get(u.id))]));
    m.notes.push(lier(m, uniteId, id, c.id));
    m.touchees ??= /* @__PURE__ */ new Set();
    for (const u of m.units) if (JSON.stringify(m.data.get(u.id)) !== avant.get(u.id)) m.touchees.add(u.id);
  }
}
function lierEntite(m, id) {
  for (const u of m.units) {
    const d = m.data.get(u.id);
    if (u.archive || u.id === id || !d?.postes || m.peut && !m.peut(u.id)) continue;
    lierNoms(m, u.id, d.postes.filter((x) => !x.lien && entiteDuNom(m.units, x.nom, u.id)?.id === id).map((x) => x.id));
  }
}
function appliquer(m, op) {
  const msg = (() => {
    if (op.type === "placer") return placer(m, op.qui, op.depuis, op.vers);
    if (op.type === "lier") return lier(m, op.uniteId, op.posteId, op.lien);
    const A = entite(m, op.uniteId);
    if (op.type === "nouveauPoste") {
      const n = op.nom.trim();
      if (!n) throw new Error("Donne un nom au poste.");
      const po2 = { id: uid("po"), nom: n };
      A.postes.push(po2);
      lierNoms(m, A.u.id, [po2.id]);
      return `Nouveau poste « ${n} » dans « ${A.u.nom} »${po2.titulaire ? "" : " : à pourvoir"}`;
    }
    const po = A.postes.find((x) => x.id === op.posteId);
    if (!po) throw new Error("Ce poste n’existe plus.");
    if (op.type === "renommer") {
      const n = op.nom.trim();
      if (!n) throw new Error("Donne un nom au poste.");
      if (n === po.nom) return "";
      const t2 = po.titulaire ? A.d.people.find((x) => x.id === po.titulaire) : void 0;
      if (t2) {
        enleverFonction(t2, po.nom);
        ajouterFonction(t2, n);
      }
      const ancien = po.nom;
      po.nom = n;
      lierNoms(m, A.u.id, [po.id]);
      return `Poste « ${ancien} » renommé « ${n} »`;
    }
    const t = retirerPoste(A.d, po);
    A.d.postes = A.postes.filter((x) => x.id !== po.id);
    const seul = t && !reste(A.d, t);
    if (t) liberer(A.d, t);
    return `Poste « ${po.nom} » supprimé de « ${A.u.nom} »${seul ? ` ; ${nomDe(t)} : ${t.actif ? benevolesDe(A.u.type).un : "quitte l’entité"}` : ""}`;
  })();
  return msg && m.notes.length ? `${msg} · ⛓ ${m.notes.join(" · ")}` : msg;
}
function suivre(m, id, avant) {
  const u = m.units.find((x) => x.id === id);
  const d = m.data.get(id);
  if (!u || u.archive || !d?.postes) return;
  const postes2 = d.postes;
  const liens = etatLiens({ ...m, data: new Map(m.data).set(id, avant) });
  const ben = roleBenevole(d.roles);
  const benevole = (p) => !p.roles.includes(ADMIN_ROLE_ID) && p.roles.length > 0 && p.roles.every((r) => r === ben) && ben !== roleResponsable(d.roles);
  const nommes = [];
  const occuper = (p, nom) => {
    if (GENERIQUE.test(nom) || postes2.some((po) => po.titulaire === p.id && cle2(po.nom) === cle2(nom))) return;
    if (p.roles.includes(ADMIN_ROLE_ID) && cle2(nom) === cle2(p.poste)) return;
    const libre = postes2.find((po) => !po.titulaire && cle2(po.nom) === cle2(nom));
    if (libre) libre.titulaire = p.id;
    else {
      const po = { id: uid("po"), nom, titulaire: p.id };
      postes2.push(po);
      nommes.push(po.id);
    }
  };
  for (const p of d.people) {
    const tient = postes2.filter((po) => po.titulaire === p.id);
    const q = avant.people.find((x) => x.id === p.id && x.actif);
    if (!p.actif || benevole(p) && !(q && benevole(q))) {
      for (const po of tient) po.titulaire = void 0;
      continue;
    }
    if (benevole(p) || p.viaEntite && !fonctionsDe(p).length) continue;
    const apres = fonctionsDe(p);
    if (!q) {
      for (const nom of apres) occuper(p, nom);
      continue;
    }
    const avantF = fonctionsDe(q);
    const ajoutees = apres.filter((x) => !avantF.some((y) => cle2(y) === cle2(x)));
    for (const po of tient) {
      if (apres.some((x) => cle2(x) === cle2(po.nom))) continue;
      const nouveau = ajoutees.shift();
      if (nouveau) {
        po.nom = nouveau;
        nommes.push(po.id);
      } else po.titulaire = void 0;
    }
    for (const nom of ajoutees) occuper(p, nom);
  }
  synchroniser(m, liens);
  lierNoms(m, id, nommes);
}

// src/data/organigrammeServeur.ts
var TYPES = ["central", "sous-comite", "groupe", "equipe"];
var cleLigne = (c, kind, id) => `${c}|${kind}|${id}`;
function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => x === void 0 ? "null" : stable(x)).join(",")}]`;
  const o = v;
  return `{${Object.keys(o).filter((k) => o[k] !== void 0).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
var propre = (v) => JSON.parse(JSON.stringify(v));
var texte = (v, max = 200) => typeof v === "string" ? v.slice(0, max) : "";
var objet = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function fiche2(d, id) {
  const p = objet(d);
  return {
    ...p,
    id,
    prenom: texte(p.prenom),
    nom: texte(p.nom),
    email: texte(p.email),
    telephone: texte(p.telephone),
    couleur: texte(p.couleur) || "#64748b",
    poste: texte(p.poste),
    roles: Array.isArray(p.roles) ? p.roles.filter((r) => typeof r === "string") : [],
    actif: p.actif !== false
  };
}
function role(d, id) {
  const r = objet(d);
  return { ...r, id, label: texte(r.label), couleur: texte(r.couleur), permissions: Array.isArray(r.permissions) ? r.permissions : [], sections: [], locked: r.locked === true };
}
function postes(d) {
  if (!Array.isArray(d)) return void 0;
  return d.filter((x) => !!x && typeof x === "object" && typeof x.id === "string" && typeof x.nom === "string").map((x) => ({ id: x.id, nom: x.nom.slice(0, 120), titulaire: typeof x.titulaire === "string" ? x.titulaire : void 0, lien: typeof x.lien === "string" ? x.lien : void 0 }));
}
function lireClub(entites, lignes) {
  const central = entites.find((e) => !e.parent_id);
  if (!central) throw new Error("Comité central introuvable.");
  const units = entites.map((e) => {
    const info = objet(e.info);
    return {
      id: e.id,
      nom: e.name,
      type: TYPES.includes(e.type) ? e.type : e.parent_id ? "groupe" : "central",
      parentId: e.parent_id ?? void 0,
      couleur: texte(info.couleur) || "#64748b",
      archive: info.archive === true || void 0,
      dependDe: typeof info.dependDe === "string" ? info.dependDe : void 0
    };
  });
  const data = new Map(units.map((u) => [u.id, { people: [], roles: [] }]));
  const pos = /* @__PURE__ */ new Map();
  const tri = [...lignes].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
  for (const l of tri) {
    const d = data.get(l.committee_id);
    if (!d || l.deleted) continue;
    pos.set(cleLigne(l.committee_id, l.kind, l.id), l.pos);
    if (l.kind === "people") d.people.push(fiche2(l.data, l.id));
    else if (l.kind === "roles") d.roles.push(role(l.data, l.id));
    else if (l.kind === "meta" && l.id === "postes") d.postes = postes(l.data);
  }
  return { units, data, pos, centralId: central.id };
}
function photo(c) {
  const out = /* @__PURE__ */ new Map();
  for (const [u, d] of c.data) {
    for (const p of d.people) out.set(cleLigne(u, "people", p.id), stable(propre(p)));
    if (d.postes) out.set(cleLigne(u, "meta", "postes"), stable(propre(d.postes)));
  }
  return out;
}
function ecritures(c, avant) {
  const apres = photo(c);
  const out = [];
  for (const [u, d] of c.data) {
    let fin = Math.max(0, ...[...c.pos].filter(([k]) => k.startsWith(`${u}|people|`)).map(([, v]) => v));
    const lignes = d.people.map((p) => ["people", p.id, p]);
    if (d.postes) lignes.push(["meta", "postes", d.postes]);
    for (const [kind, id, v] of lignes) {
      const k = cleLigne(u, kind, id);
      const a = avant.get(k);
      if (a === apres.get(k)) continue;
      let pos = c.pos.get(k);
      if (pos === void 0) {
        pos = kind === "people" ? ++fin : 0;
        c.pos.set(k, pos);
      }
      out.push({ ligne: { committee_id: u, kind, id, pos, data: propre(v) }, avant: a === void 0 ? null : { committee_id: u, kind, id, pos, data: JSON.parse(a) } });
    }
  }
  return out;
}
function lireOp(x) {
  const o = objet(x);
  const s = (v, max = 120) => {
    if (typeof v !== "string" || !v) throw new Error("Modification invalide.");
    return v.slice(0, max);
  };
  const zone = (v) => {
    if (v !== "titre" && v !== "poste" && v !== "benevoles") throw new Error("Modification invalide.");
    return v;
  };
  switch (o.type) {
    case "nouveauPoste":
      return { type: "nouveauPoste", uniteId: s(o.uniteId), nom: s(o.nom) };
    case "renommer":
      return { type: "renommer", uniteId: s(o.uniteId), posteId: s(o.posteId), nom: s(o.nom) };
    case "supprimerPoste":
      return { type: "supprimerPoste", uniteId: s(o.uniteId), posteId: s(o.posteId) };
    case "lier":
      return { type: "lier", uniteId: s(o.uniteId), posteId: s(o.posteId), lien: o.lien === null ? null : s(o.lien) };
    case "placer": {
      const q = objet(o.qui);
      const couleur = texte(q.couleur, 7);
      const qui = {
        prenom: texte(q.prenom, 80),
        nom: texte(q.nom, 80),
        email: texte(q.email, 200).trim(),
        telephone: texte(q.telephone, 40) || void 0,
        couleur: /^#[0-9a-f]{6}$/i.test(couleur) ? couleur : "#64748b",
        membreId: texte(q.membreId, 100) || void 0
      };
      const dep = o.depuis ? objet(o.depuis) : null;
      const depuis = dep ? { uniteId: s(dep.uniteId), personId: s(dep.personId), zone: zone(dep.zone), posteId: dep.posteId ? s(dep.posteId) : void 0 } : void 0;
      const v = objet(o.vers);
      let vers;
      if (v.zone === "corbeille") vers = { zone: "corbeille" };
      else if (v.zone === "titre" || v.zone === "benevoles") vers = { zone: v.zone, uniteId: s(v.uniteId) };
      else if (v.zone === "etoile") vers = { zone: "etoile", uniteId: s(v.uniteId), personId: s(v.personId) };
      else if (v.zone === "poste") vers = { zone: "poste", uniteId: s(v.uniteId), posteId: s(v.posteId) };
      else if (v.zone === "nouveau") vers = { zone: "nouveau", uniteId: s(v.uniteId), nom: s(v.nom) };
      else throw new Error("Modification invalide.");
      return { type: "placer", qui, depuis, vers };
    }
  }
  throw new Error("Modification inconnue.");
}
var peutDe = (c, d) => (id) => d.central || d.admin.includes(id) || false;
var nomDe2 = (c, id) => c.units.find((u) => u.id === id)?.nom ?? "?";
function gardeUnEtoile(c, ecr) {
  if (ecr.some((e) => e.ligne.committee_id === c.centralId) && !c.data.get(c.centralId)?.people.some(estEtoile)) throw new Error("Le comité central garde au moins un ★.");
}
function convertir(c) {
  if (![...c.data.values()].some((d) => !d.postes)) return [];
  const avant = photo(c);
  convertirPostes(c.units, c.data, true);
  return ecritures(c, avant);
}
function organiser(c, op, droits) {
  const avant = photo(c);
  const peut = peutDe(c, droits);
  const message = appliquer({ units: c.units, data: c.data, notes: [], peut }, op);
  const ecr = ecritures(c, avant);
  const directes = new Set(
    op.type === "placer" ? [op.depuis?.uniteId, op.vers.zone === "corbeille" ? void 0 : op.vers.uniteId] : op.type === "lier" ? [op.uniteId, op.lien] : [op.uniteId]
  );
  for (const u of new Set(ecr.map((e) => e.ligne.committee_id)))
    if (directes.has(u) && !peut(u)) throw new Error(u === c.centralId ? "Réservé aux admins du comité central." : `Réservé aux admins de « ${nomDe2(c, u)} » ou du comité central.`);
  gardeUnEtoile(c, ecr);
  return { message, ecritures: ecr };
}
function ficheAvant(x) {
  const p = objet(x);
  if (typeof p.id !== "string" || !p.id) return null;
  return fiche2({ prenom: p.prenom, nom: p.nom, email: p.email, poste: p.poste, autresPostes: typeof p.autresPostes === "string" ? p.autresPostes : void 0, roles: p.roles, actif: p.actif, membreId: typeof p.membreId === "string" ? p.membreId : void 0, viaEntite: typeof p.viaEntite === "string" ? p.viaEntite : void 0 }, p.id);
}
function suivreFiches(c, id, avantPeople, droits) {
  const d = c.data.get(id);
  if (!d?.postes || !Array.isArray(avantPeople)) return [];
  const people = avantPeople.slice(0, 5e3).map(ficheAvant).filter((p) => !!p);
  const avant = { ...d, people, postes: propre(d.postes) };
  const photoAvant = photo(c);
  suivre({ units: c.units, data: c.data, notes: [], peut: peutDe(c, droits) }, id, avant);
  const ecr = ecritures(c, photoAvant);
  gardeUnEtoile(c, ecr);
  return ecr;
}
function lierEntiteServeur(c, id, droits) {
  if (!c.data.get(id)) return { message: "", ecritures: [] };
  const avant = photo(c);
  const m = { units: c.units, data: c.data, notes: [], peut: peutDe(c, droits) };
  const d = c.data.get(id);
  d.postes ??= [];
  lierEntite(m, id);
  const ecr = ecritures(c, avant);
  gardeUnEtoile(c, ecr);
  return { message: m.notes.join(" · "), ecritures: ecr };
}
function fichesArrivees(ecr) {
  return ecr.filter((e) => e.ligne.kind === "people").filter((e) => {
    const n = e.ligne.data;
    const a = e.avant?.data;
    return n.actif !== false && (!a || a.actif === false);
  }).map((e) => {
    const n = e.ligne.data;
    return { committee_id: e.ligne.committee_id, id: e.ligne.id, email: (n.email ?? "").trim().toLowerCase(), membreId: n.membreId };
  });
}
export {
  convertir,
  fichesArrivees,
  lierEntiteServeur,
  lireClub,
  lireOp,
  organiser,
  suivreFiches
};
