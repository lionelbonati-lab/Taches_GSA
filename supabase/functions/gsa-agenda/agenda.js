// Généré par « npm run fonction » depuis src/data/agendaServeur.ts (contenu de l'agenda) : ne pas modifier à la main.

// src/data/pourInfo.ts
var pourMoi = (t, userId) => !!userId && !t.paiement && !!t.pourInfo?.personnes?.includes(userId);

// src/data/aPrendre.ts
var proposeeA = (t, userId) => !!userId && !t.paiement && !!t.aPrendre?.personnes.includes(userId);

// src/data/permissions.ts
var PERMISSIONS = [
  { id: "tasks.viewAll", label: "Voir toutes les tâches", group: "Tâches", sectionScoped: true },
  { id: "tasks.createAny", label: "Créer / assigner des tâches à d’autres", group: "Tâches", sectionScoped: true },
  { id: "tasks.editAny", label: "Modifier toutes les tâches", group: "Tâches", sectionScoped: true },
  { id: "tasks.editOwn", label: "Créer et modifier ses propres tâches", group: "Tâches", sectionScoped: true },
  { id: "tasks.delete", label: "Supprimer des tâches", group: "Tâches", sectionScoped: true },
  { id: "tab.meetings", label: "Comité › Séances (liste des séances, excuses)", group: "Pages visibles" },
  { id: "tab.events", label: "Agenda › Événements", group: "Pages visibles" },
  { id: "tab.people", label: "Coordonnées (email, téléphone) des personnes du club", group: "Pages visibles" },
  { id: "tab.pv", label: "Comité › Ordre du jour", group: "Pages visibles" },
  { id: "tab.minutes", label: "Comité › PV (prise de notes, PV)", group: "Pages visibles" },
  { id: "club.membres", label: "Personnes du club : coordonnées, groupes, ajout et modification des personnes", group: "Pages visibles" },
  { id: "meetings.manage", label: "Gérer les séances de comité", group: "Gestion" },
  { id: "events.manage", label: "Gérer les événements", group: "Gestion" },
  { id: "people.manage", label: "Gérer les personnes du club (ajouter, modifier, retirer du club)", group: "Gestion" },
  { id: "polls.create", label: "Créer des sondages", group: "Gestion" },
  { id: "polls.manage", label: "Gérer tous les sondages (clôturer, supprimer)", group: "Gestion" },
  { id: "paiements.valider", label: "Paiements : peut viser (signer) les tickets, sur demande de la caisse", group: "Gestion" },
  { id: "paiements.payer", label: "Caisse : reçoit les tickets, demande les visas, fait les virements", group: "Gestion" },
  { id: "settings.lists", label: "Gérer sections / statuts", group: "Administration" },
  { id: "admin.access", label: "Accès console admin", group: "Administration" }
];
var ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id);
var userRoles = (roles, p) => p ? roles.filter((r) => p.roles.includes(r.id)) : [];
function hasPermission(roles, perm, sectionId) {
  return roles.some(
    (r) => (r.locked || r.permissions.includes(perm)) && (!sectionId || r.sections.length === 0 || r.sections.includes(sectionId))
  );
}
function voitTache(t, userId, roles) {
  if (!!userId && (t.responsables.includes(userId) || t.createdBy === userId) || pourMoi(t, userId) || proposeeA(t, userId)) return true;
  const p = t.paiement;
  if (!p) return hasPermission(roles, "tasks.viewAll", t.sectionId);
  return !!userId && [p.demandePar, p.visa?.a, p.validation?.par].includes(userId) || hasPermission(roles, "paiements.payer");
}

// src/data/repetition.ts
var pad = (n) => String(n).padStart(2, "0");
var parts = (d) => d.split("-").map(Number);
var utc = (y, m, j) => new Date(Date.UTC(y, m - 1, j));
var iso = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
var plus = (d, n) => {
  const [y, m, j] = parts(d);
  return iso(utc(y, m, j + n));
};
var ecart = (a, b) => Math.round((utc(...parts(b)).getTime() - utc(...parts(a)).getTime()) / 864e5);
var joursDuMois = (y, m) => utc(y, m + 1, 0).getUTCDate();
var jourSemaine = (d) => (utc(...parts(d)).getUTCDay() + 6) % 7 + 1;
function rangDansMois(d) {
  const [y, m, j] = parts(d);
  return { rang: Math.ceil(j / 7), dernier: j + 7 > joursDuMois(y, m) };
}
var joursDe = (r, date) => {
  const js = [...new Set((r.jours ?? []).filter((j) => j >= 1 && j <= 7))].sort();
  return js.length ? js : [jourSemaine(date)];
};
var TOURS_MAX = 5e3;
function* candidats(e, depuis) {
  const r = e.repetition;
  if (!r) {
    yield e.date;
    return;
  }
  const n = Math.max(1, Math.round(r.intervalle ?? 1));
  const saut = depuis && !r.nombre && depuis > e.date ? depuis : void 0;
  const [y0, m0, j0] = parts(e.date);
  const lundi = plus(e.date, 1 - jourSemaine(e.date));
  const jours = joursDe(r, e.date);
  const pas = r.freq === "an" ? 12 * n : n;
  let k = 0;
  if (saut) {
    if (r.freq === "jour") k = Math.floor(ecart(e.date, saut) / n);
    else if (r.freq === "semaine") k = Math.floor(ecart(lundi, saut) / (7 * n));
    else {
      const [ys, ms] = parts(saut);
      k = Math.max(0, Math.floor(((ys - y0) * 12 + ms - m0) / pas) - 1);
    }
  }
  let compte = 0;
  for (let tours = 0; tours < TOURS_MAX; tours++, k++) {
    let lot;
    if (r.freq === "jour") lot = [plus(e.date, k * n)];
    else if (r.freq === "semaine") lot = jours.map((j) => plus(lundi, k * 7 * n + j - 1));
    else {
      const t = m0 - 1 + k * pas;
      const [y, m] = [y0 + Math.floor(t / 12), t % 12 + 1];
      const fin = joursDuMois(y, m);
      let j = Math.min(j0, fin);
      if (r.freq === "mois" && r.mensuel) {
        const js = jourSemaine(e.date);
        if (r.mensuel === "dernier") j = fin - (jourSemaine(`${y}-${pad(m)}-${pad(fin)}`) - js + 7) % 7;
        else j = 1 + (js - jourSemaine(`${y}-${pad(m)}-01`) + 7) % 7 + 7 * (rangDansMois(e.date).rang - 1);
      }
      lot = j <= fin ? [`${y}-${pad(m)}-${pad(j)}`] : [];
    }
    for (const d of lot) {
      if (d < e.date) continue;
      if (r.jusquau && d > r.jusquau) return;
      yield d;
      if (r.nombre && ++compte >= r.nombre) return;
    }
  }
}
var retiree = (e, d) => !!e.sauf?.includes(d);
var duree = (e) => e.dateFin && e.dateFin > e.date ? ecart(e.date, e.dateFin) : 0;
var aLaDate = (e, date) => {
  const d = duree(e);
  return { ...e, date, dateFin: d ? plus(date, d) : void 0 };
};
function occurrencesEntre(e, de, a, max = 500) {
  const d = duree(e);
  const out = [];
  for (const x of candidats(e, plus(de, -d))) {
    if (x > a || out.length >= max) break;
    if (plus(x, d) >= de && !retiree(e, x)) out.push(x);
  }
  return out;
}
function occurrenceDu(e, jour2) {
  const d = duree(e);
  for (const x of candidats(e, plus(jour2, -d))) if (plus(x, d) >= jour2 && !retiree(e, x)) return x;
  return void 0;
}
var estOccurrence = (e, date) => occurrencesEntre(e, date, date).includes(date);
var fmtHeure = (h) => h ? h.replace(":", "h") : "";

// src/data/utils.ts
var fullName = (p) => p ? `${p.prenom} ${p.nom}`.trim() : "Inconnu";
function isDone(data, t) {
  return data.statuses.find((s) => s.id === t.statusId)?.done ?? false;
}
var pad2 = (n) => String(n).padStart(2, "0");
var ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

// src/data/ics.ts
var FUSEAU = "Europe/Zurich";
var VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${FUSEAU}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE"
];
var JOURS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
var FREQ = { jour: "DAILY", semaine: "WEEKLY", mois: "MONTHLY", an: "YEARLY" };
var pad3 = (n) => String(n).padStart(2, "0");
var jour = (d) => d.replace(/-/g, "");
var lendemain = (d, n = 1) => {
  const x = /* @__PURE__ */ new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
function plusMinutes(d, h, min) {
  const [hh, mm] = h.split(":").map(Number);
  const t = hh * 60 + mm + min;
  return [lendemain(d, Math.floor(t / 1440)), `${pad3(Math.floor(t % 1440 / 60))}:${pad3(t % 60)}`];
}
var local = (d, h) => `${jour(d)}T${h.replace(":", "").padEnd(4, "0").slice(0, 4)}00`;
var dernierDimanche = (an, mois) => {
  const x = new Date(Date.UTC(an, mois, 0));
  return lendemain(x.toISOString().slice(0, 10), -x.getUTCDay());
};
var finDuJourUtc = (d) => {
  const an = Number(d.slice(0, 4));
  const ete = d >= dernierDimanche(an, 3) && d < dernierDimanche(an, 10);
  return `${jour(d)}T${ete ? 21 : 22}5959Z`;
};
var echapper = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function plier(ligne) {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const out = [];
  let cur = "";
  let n = 0;
  for (const c of ligne) {
    const b = enc.encode(c).length;
    if (n + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      n = 0;
    }
    cur += c;
    n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function regleIcs(r, date, avecHeure) {
  const p = [`FREQ=${FREQ[r.freq]}`];
  const n = Math.max(1, Math.round(r.intervalle ?? 1));
  if (n > 1) p.push(`INTERVAL=${n}`);
  const js = jourSemaine(date);
  if (r.freq === "semaine") {
    const jours = [...new Set((r.jours ?? []).filter((j) => j >= 1 && j <= 7))].sort();
    if (jours.length && !jours.includes(js)) return void 0;
    p.push(`BYDAY=${(jours.length ? jours : [js]).map((j) => JOURS[j - 1]).join(",")}`, "WKST=MO");
  } else if (r.freq === "mois" && r.mensuel) {
    const { rang, dernier } = rangDansMois(date);
    if (r.mensuel === "dernier" && !dernier) return void 0;
    p.push(`BYDAY=${r.mensuel === "dernier" ? -1 : rang}${JOURS[js - 1]}`);
  } else if (r.freq === "mois" && Number(date.slice(8)) > 28 || r.freq === "an" && date.slice(5) === "02-29") {
    return void 0;
  }
  if (r.nombre && r.jusquau) return void 0;
  if (r.nombre) p.push(`COUNT=${r.nombre}`);
  else if (r.jusquau) p.push(`UNTIL=${avecHeure ? finDuJourUtc(r.jusquau) : jour(r.jusquau)}`);
  return p.join(";");
}
function debutFin(e) {
  if (!e.heure) return [`DTSTART;VALUE=DATE:${jour(e.date)}`, `DTEND;VALUE=DATE:${jour(lendemain(e.dateFin ?? e.date))}`];
  const dernier = e.dateFin && e.dateFin > e.date ? e.dateFin : e.date;
  let fin;
  if (e.heureFin) fin = [dernier === e.date && e.heureFin <= e.heure ? lendemain(dernier) : dernier, e.heureFin];
  else if (dernier > e.date) fin = [lendemain(dernier), "00:00"];
  else fin = plusMinutes(e.date, e.heure, e.dureeDefaut ?? 60);
  return [`DTSTART;TZID=${FUSEAU}:${local(e.date, e.heure)}`, `DTEND;TZID=${FUSEAU}:${local(...fin)}`];
}
function vevent(e, tampon, regle) {
  const l = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${tampon}`, ...debutFin(e), `SUMMARY:${echapper(e.titre)}`];
  if (regle) {
    l.push(`RRULE:${regle}`);
    const sauf = (e.sauf ?? []).filter((d) => d >= e.date).sort();
    if (sauf.length) l.push(e.heure ? `EXDATE;TZID=${FUSEAU}:${sauf.map((d) => local(d, e.heure)).join(",")}` : `EXDATE;VALUE=DATE:${sauf.map(jour).join(",")}`);
  }
  if (e.lieu?.trim()) l.push(`LOCATION:${echapper(e.lieu.trim())}`);
  if (e.geo) l.push(`GEO:${e.geo.lat};${e.geo.lng}`);
  const desc = [e.description?.trim(), e.url].filter(Boolean).join("\n\n");
  if (desc) l.push(`DESCRIPTION:${echapper(desc)}`);
  if (e.url) l.push(`URL:${e.url}`);
  if (e.libre) l.push("TRANSP:TRANSPARENT");
  l.push("END:VEVENT");
  return l;
}
function calendrierIcs(nom, elements, opts) {
  const t = (opts.maintenant ?? /* @__PURE__ */ new Date()).toISOString();
  const tampon = `${t.slice(0, 4)}${t.slice(5, 7)}${t.slice(8, 10)}T${t.slice(11, 13)}${t.slice(14, 16)}${t.slice(17, 19)}Z`;
  const lignes = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GSA//Taches GSA//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${echapper(nom)}`, `X-WR-TIMEZONE:${FUSEAU}`];
  if (elements.some((e) => e.heure)) lignes.push(...VTIMEZONE);
  for (const e of elements) {
    if (!e.repetition) {
      lignes.push(...vevent(e, tampon));
      continue;
    }
    const regle = regleIcs(e.repetition, e.date, !!e.heure);
    if (regle) lignes.push(...vevent(e, tampon, regle));
    else for (const o of occurrencesEntre(e, opts.depuis > e.date ? opts.depuis : e.date, opts.horizon)) lignes.push(...vevent({ ...aLaDate(e, o), uid: `${o}-${e.uid}`, repetition: void 0 }, tampon));
  }
  lignes.push("END:VCALENDAR");
  return lignes.map(plier).join("\r\n") + "\r\n";
}

// src/data/polls.ts
function finSondage(p) {
  if (!p.dateLimite || p.clotureAuto === false) return null;
  const [y, m, d] = p.dateLimite.split("-").map(Number);
  const [h, mn] = (p.heureLimite || "24:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, mn).getTime();
}
var isOpen = (p) => !p.clotureLe && (finSondage(p) ?? Infinity) > Date.now();

// src/data/units.ts
var UNIT_TYPES = {
  central: { label: "Comité central", plural: "Comité central", icon: "🏛️", trait: "comite", chef: "Président", seances: "Comité", aide: "Direction du club." },
  "sous-comite": {
    label: "Sous-comité",
    plural: "Sous-comités",
    icon: "🎪",
    trait: "sousComite",
    chef: "Président",
    seances: "Comité",
    aide: "Organisation d’un événement, avec son président et ses membres."
  },
  groupe: {
    label: "Groupe",
    plural: "Groupes",
    icon: "🚴",
    trait: "groupe",
    chef: "Responsable",
    seances: "Séances",
    aide: "Activité permanente du club (école de cyclisme, compétition…) avec ses propres membres (moniteurs…)."
  },
  equipe: {
    label: "Équipe d’événement",
    plural: "Équipes d’événement",
    icon: "🎉",
    trait: "evenements",
    chef: "Responsable",
    seances: "Réunions",
    aide: "Événement sans comité : quelques personnes, souvent déjà actives ailleurs dans le club."
  }
};
var MEMBER_PERMS = ["tasks.viewAll", "tasks.editOwn", "tab.meetings", "tab.events", "tab.people", "polls.create"];
var CAISSE_PERMS = [...MEMBER_PERMS, "paiements.payer"];
var CO_PERMS = [...MEMBER_PERMS, "events.manage"];

// src/data/agendaIcs.ts
var DUREE_SEANCE = 120;
var DOMAINE = "taches-gsa";
var HORIZON_AGENDA = 730;
var PASSE_ABONNEMENT = 365;
function manifsAgenda(units, courante, clubEvents, ownEvents) {
  return units.filter((u) => !u.archive).map((u) => {
    const own = u.id === courante;
    const events = own ? [] : clubEvents.filter((e) => e.uniteId === u.id);
    const edition = (u.type === "sous-comite" || u.type === "equipe") && !!u.date && !(own ? ownEvents : events).some((e) => e.date === u.date || !!e.repetition && estOccurrence(e, u.date));
    return { u, events, edition, own };
  }).filter((x) => x.events.length > 0 || x.edition);
}
var lieu = (l) => l?.trim() && !/^à définir$/i.test(l.trim()) ? l.trim() : void 0;
function listesAgenda(o) {
  const { data, userId, depuis, lien } = o;
  const nomPersonne = (id) => fullName(data.people.find((p) => p.id === id));
  const seances = data.meetings.filter((m) => !depuis || m.date >= depuis).map((m) => ({
    uid: `seance-${m.id}@${DOMAINE}`,
    titre: m.titre,
    date: m.date,
    heure: m.heure,
    dureeDefaut: DUREE_SEANCE,
    lieu: lieu(m.lieu),
    geo: m.lieuGeo,
    url: lien("/comite")
  }));
  const evenements = data.events.filter((x) => !depuis || !!occurrenceDu(x, depuis)).map((x) => ({
    uid: `evenement-${x.id}@${DOMAINE}`,
    titre: x.nom,
    date: x.date,
    dateFin: x.dateFin,
    heure: x.heure,
    heureFin: x.heureFin,
    lieu: lieu(x.lieu),
    description: x.description,
    repetition: x.repetition,
    sauf: x.sauf,
    url: lien("/evenements")
  }));
  const club = o.manifs.flatMap(({ u, events, edition }) => [
    ...edition && (!depuis || (u.dateFin ?? u.date) >= depuis) ? [{ uid: `edition-${u.id}-${u.date}@${DOMAINE}`, titre: u.nom, date: u.date, dateFin: u.dateFin, description: UNIT_TYPES[u.type].label }] : [],
    ...events.filter((x) => !depuis || !!occurrenceDu(x, depuis)).map((x) => ({
      uid: `club-${u.id}-${x.id}@${DOMAINE}`,
      titre: x.nom === u.nom ? x.nom : `${x.nom} (${u.nom})`,
      date: x.date,
      dateFin: x.dateFin,
      heure: x.heure,
      heureFin: x.heureFin,
      lieu: lieu(x.lieu),
      repetition: x.repetition,
      sauf: x.sauf
    }))
  ]);
  const taches = !userId || o.taches === "non" ? [] : data.tasks.filter((x) => x.delai && (!depuis || x.delai >= depuis) && !isDone(data, x) && (o.taches === "mes" ? x.responsables.includes(userId) : o.voit(x))).map((x) => ({
    uid: `tache-${x.id}@${DOMAINE}`,
    titre: `Délai : ${x.titre}`,
    date: x.delai,
    libre: true,
    url: lien(`/taches?tache=${encodeURIComponent(x.id)}`),
    description: [
      data.sections.find((z) => z.id === x.sectionId)?.nom,
      data.statuses.find((z) => z.id === x.statusId)?.label,
      x.responsables.length ? `Responsables : ${x.responsables.map(nomPersonne).join(", ")}` : ""
    ].filter(Boolean).join("\n")
  }));
  const sondages = (data.polls ?? []).filter((x) => x.dateLimite && isOpen(x) && (!depuis || x.dateLimite >= depuis)).map((x) => ({
    uid: `sondage-${x.id}@${DOMAINE}`,
    titre: `Fin du sondage${x.heureLimite ? ` (${fmtHeure(x.heureLimite)})` : ""} : ${x.question}`,
    date: x.dateLimite,
    libre: true,
    url: lien(`/sondages?id=${encodeURIComponent(x.id)}`)
  }));
  return { seances, evenements, club, taches, sondages };
}
var elementsChoisis = (l, c) => [
  ...c.seances ? l.seances : [],
  ...c.evenements ? l.evenements : [],
  ...c.club ? l.club : [],
  ...l.taches,
  ...c.sondages ? l.sondages : []
];
var nomAgenda = (appli, entite) => entite ? `${appli} – ${entite}` : appli;

// src/data/agendaServeur.ts
var LISTES = ["people", "roles", "sections", "statuses", "meetings", "events", "tasks", "polls"];
function donnees(lignes) {
  const d = Object.fromEntries(LISTES.map((k) => [k, []]));
  const prefs = {};
  for (const r of [...lignes].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))) {
    if (r.kind === "prefs") prefs[r.id] = r.data;
    else if (r.kind in d) d[r.kind].push(r.data);
  }
  return { data: d, prefs };
}
function agendaAbonnement(o) {
  const { data, prefs } = donnees(o.lignes);
  const moi = data.people.find((p) => p.id === o.fiche && p.actif !== false) ?? null;
  const roles = userRoles(data.roles, moi);
  const can = (p) => hasPermission(roles, p);
  const unites = o.unites.map((u) => ({ id: u.id, nom: u.nom, type: u.type, date: u.info?.date, dateFin: u.info?.dateFin, archive: !!u.info?.archive }));
  const masquees = moi && prefs[moi.id]?.manifsMasquees || [];
  const manifs = manifsAgenda(unites, o.courante, o.clubEvents, data.events).filter((x) => !masquees.includes(x.u.id));
  const jour2 = o.maintenant.toISOString().slice(0, 10);
  const op = o.options;
  const lien = (chemin) => op.appli ? `${op.appli}?reel=${encodeURIComponent(o.courante)}#${chemin}` : "";
  const taches = !moi ? "non" : op.taches === "toutes" && !can("tasks.viewAll") ? "mes" : op.taches ?? "non";
  const listes = listesAgenda({ data, userId: moi?.id, voit: (t) => voitTache(t, moi?.id, roles), manifs, taches, depuis: addDays(jour2, -PASSE_ABONNEMENT), lien });
  const choisis = elementsChoisis(listes, {
    seances: !!op.seances && can("tab.meetings"),
    evenements: !!op.evenements && can("tab.events"),
    club: !!op.club,
    sondages: !!op.sondages
  });
  const entite = o.unites.find((u) => u.id === o.courante)?.nom;
  return calendrierIcs(nomAgenda(op.nomAppli || "Tâches GSA", entite), choisis, { depuis: addDays(jour2, -PASSE_ABONNEMENT), horizon: addDays(jour2, HORIZON_AGENDA), maintenant: o.maintenant });
}
export {
  agendaAbonnement
};
