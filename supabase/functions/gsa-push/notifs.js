// Généré par « npm run fonction » depuis src/data/pushServeur.ts (notifications appli fermée) : ne pas modifier à la main.

// src/data/aPrendre.ts
var nombreAPrendre = (a) => Math.min(Math.max(Math.floor(a?.nombre ?? 1) || 1, 1), 100);
var volontaires = (t) => (t.aPrendre?.personnes ?? []).filter((id) => t.responsables.includes(id));
var respDe = (t, u) => (u === t.source?.uniteId ? t.source.responsables : t.respPartage?.[u]) ?? [];
var ailleurs = (t) => Object.entries(t.aPrendre?.partage ?? {}).filter(([, a]) => a.personnes?.length);
var prisAilleurs = (t) => ailleurs(t).reduce((n, [u, a]) => n + a.personnes.filter((id) => respDe(t, u).includes(id)).length, 0);
var attenteAilleurs = (t) => ailleurs(t).reduce((n, [u, a]) => n + a.personnes.filter((id) => !respDe(t, u).includes(id) && !a.refus?.includes(id)).length, 0);
var aPrendreOuverte = (t) => (!!t.aPrendre?.personnes.length || ailleurs(t).length > 0) && !t.paiement && volontaires(t).length + prisAilleurs(t) < nombreAPrendre(t.aPrendre);
var proposeeA = (t, userId) => !!userId && !t.paiement && !!t.aPrendre?.personnes.includes(userId);
var peutPrendre = (t, userId) => proposeeA(t, userId) && !t.responsables.includes(userId) && aPrendreOuverte(t);
var pasDispo = (t, userId) => !!userId && !!t.aPrendre?.refus?.includes(userId);
var aPrendrePourMoi = (t, userId) => peutPrendre(t, userId) && !pasDispo(t, userId);
var sansReponse = (t) => (t.aPrendre?.personnes ?? []).filter((id) => !t.responsables.includes(id) && !t.aPrendre?.refus?.includes(id));
var plusPersonne = (t) => !sansReponse(t).length && !attenteAilleurs(t);

// src/data/utils.ts
var today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var localNow = () => {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
var fmtDate = (s) => s ? (/* @__PURE__ */ new Date(s + (s.length === 10 ? "T12:00:00" : ""))).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
var fullName = (p) => p ? `${p.prenom} ${p.nom}`.trim() : "Inconnu";
var shortName = (p) => p ? `${p.prenom}${p.nom ? ` ${p.nom[0]}.` : ""}` : "?";
function isDone(data, t) {
  return data.statuses.find((s) => s.id === t.statusId)?.done ?? false;
}
function daysUntil(date) {
  const a = (/* @__PURE__ */ new Date(today() + "T12:00:00")).getTime();
  const b = (/* @__PURE__ */ new Date(date + "T12:00:00")).getTime();
  return Math.round((b - a) / 864e5);
}
var pad = (n) => String(n).padStart(2, "0");
var ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

// src/data/mode.ts
var KEY = "taches-gsa-mode";
function getMode() {
  try {
    const m = localStorage.getItem(KEY);
    return m === "demo" || m === "reel" ? m : null;
  } catch {
    return null;
  }
}

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
var userRoles = (roles, p) => p ? roles.filter((r) => p.roles.includes(r.id)) : [];
function hasPermission(roles, perm, sectionId) {
  return roles.some(
    (r) => (r.locked || r.permissions.includes(perm)) && (!sectionId || r.sections.length === 0 || r.sections.includes(sectionId))
  );
}

// src/data/membres.ts
var emailKey = (e) => (e ?? "").trim().toLowerCase();

// src/data/partage.ts
var idPartagee = (uniteId, id) => `x:${uniteId}:${id}`;

// src/data/polls.ts
function finSondage(p) {
  if (!p.dateLimite || p.clotureAuto === false) return null;
  const [y, m, d] = p.dateLimite.split("-").map(Number);
  const [h, mn] = (p.heureLimite || "24:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, mn).getTime();
}
var isOpen = (p) => !p.clotureLe && (finSondage(p) ?? Infinity) > Date.now();
var echeance = (p) => p.dateLimite ? `${fmtDate(p.dateLimite)}${p.heureLimite ? ` à ${p.heureLimite.replace(":", "h")}` : ""}` : "";
var identites = (uniteId, f) => [f.membreId ?? "", emailKey(f.email) && `e:${emailKey(f.email)}`, `f:${uniteId}:${f.id}`, f.viaEntite && f.viaFiche ? `f:${f.viaEntite}:${f.viaFiche}` : ""].filter(
  (x) => !!x
);
function electorat(p, source, fiches, units) {
  const cles = [];
  const de = /* @__PURE__ */ new Map();
  const range = (ks, cle) => ks.forEach((k) => !de.has(k) && de.set(k, cle));
  for (const id of p.votants) {
    if (cles.includes(id)) continue;
    cles.push(id);
    const f = fiches.find((x) => x.id === id);
    range(f ? identites(source, f) : [`f:${source}:${id}`], id);
  }
  for (const e of new Set(p.entites ?? [])) {
    const u = units.find((x) => x.id === e);
    if (!u || u.archive || e === source) continue;
    for (const m of u.membres) {
      const ks = identites(e, m);
      const deja = ks.map((k) => de.get(k)).find((x) => x);
      const cle = deja ?? `${e}:${m.id}`;
      if (!deja) cles.push(cle);
      range(ks, cle);
    }
  }
  return { cles, de };
}
var cleVote = (el, uniteId, f) => identites(uniteId, f).map((k) => el.de.get(k)).find((x) => x);
function avecSondages(data, list, moi, units, userId) {
  const fiches = data.people.filter((x) => x.actif);
  const me = userId ? fiches.find((x) => x.id === userId) : void 0;
  const locaux = (data.polls ?? []).map((p) => {
    if (!p.entites?.length) return { ...p, cleMoi: me && p.votants.includes(me.id) ? me.id : void 0 };
    const el = electorat(p, moi, fiches, units);
    return { ...p, electeurs: el.cles, cleMoi: me && cleVote(el, moi, me) };
  });
  const recus = list.map(({ uniteId, unite, poll }) => {
    const el = electorat(poll, uniteId, units.find((u) => u.id === uniteId)?.membres ?? [], units);
    return { ...poll, id: idPartagee(uniteId, poll.id), taskId: void 0, sectionId: void 0, electeurs: el.cles, cleMoi: me && cleVote(el, moi, me), source: { uniteId, unite, id: poll.id } };
  });
  return locaux.length || recus.length ? { ...data, polls: [...locaux, ...recus] } : data;
}

// src/data/lienPartage.ts
var PARAM = "u";
function lienAppli(chemin, unite, mode = getMode()) {
  const cle = mode ?? (unite ? PARAM : "");
  const q = cle ? `?${cle}${unite ? `=${encodeURIComponent(unite)}` : ""}` : "";
  return `${location.origin}${location.pathname}${q}#${chemin}`;
}

// src/data/emails.ts
function dueAt(task, q) {
  const date = q.type === "date" ? q.date : task.delai ? addDays(task.delai, -q.jours) : "";
  return date ? `${date}T${q.heure || "08:00"}` : null;
}
function emailState(data, task, e) {
  if (e.statut === "envoye") return "envoye";
  if (e.statut === "annule") return "annule";
  const at = dueAt(task, e.quand);
  if (!at) return "sansDate";
  if (at > localNow()) return "programme";
  return e.siNonTerminee && isDone(data, task) ? "sansObjet" : "aEnvoyer";
}
function appLink(taskId, unite) {
  return lienAppli(`/taches?tache=${encodeURIComponent(taskId)}`, unite);
}
function fillTemplate(data, task, e, text, unite) {
  const person = (id) => data.people.find((p) => p.id === id);
  const values = {
    "{tâche}": task.titre,
    "{délai}": task.delai ? fmtDate(task.delai) : "sans délai",
    "{section}": [data.sections.find((s) => s.id === task.sectionId)?.nom, task.sousSection].filter(Boolean).join(" › "),
    "{responsables}": task.responsables.map((id) => fullName(person(id))).join(", "),
    "{statut}": data.statuses.find((s) => s.id === task.statusId)?.label ?? "",
    "{remarque}": task.remarque,
    // Seulement s'il sert : le serveur (notifications appli fermée) n'a pas l'adresse de l'appli.
    "{lien}": text.includes("{lien}") ? appLink(task.id, unite) : "",
    "{expéditeur}": fullName(person(e.creePar))
  };
  return text.replace(/\{[^}]+\}/g, (k) => values[k] ?? k);
}

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

// src/data/destinataires.ts
var EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
var actives = (people) => people.filter((p) => p.actif && !p.exclu);
var adressesLibres = (autres) => (autres ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
function adressesUnite(data, id, units, courante) {
  if (id === courante) return actives(data.people).map((p) => p.email || "");
  return (units.find((u) => u.id === id)?.membres ?? []).map((m) => m.email || "");
}
function choisis(data, e, units, courante) {
  const unite = (id) => units.find((u) => u.id === id);
  return [
    ...e.destinataires.map((id) => {
      const p = data.people.find((x) => x.id === id);
      return {
        cle: `p:${id}`,
        genre: "personne",
        id,
        texte: p ? shortName(p) : "?",
        detail: p ? fullName(p) : "Personne retirée",
        email: p?.email,
        alerte: !p || !p.actif || p.exclu ? "ne fait plus partie de l’entité" : !p.email ? "pas d’adresse email" : void 0
      };
    }),
    ...(e.unites ?? []).map((id) => {
      const u = unite(id);
      const n = new Set(adressesUnite(data, id, units, courante).filter(Boolean).map((x) => x.toLowerCase())).size;
      return {
        cle: `u:${id}`,
        genre: "unite",
        id,
        texte: `${u ? `${UNIT_TYPES[u.type]?.icon ?? ""} ${u.nom}`.trim() : "Entité supprimée"}`,
        detail: `toutes ses personnes (${n})`,
        alerte: !u && id !== courante ? "n’existe plus" : n ? void 0 : "aucune adresse email"
      };
    }),
    ...Object.entries(e.externes ?? {}).flatMap(
      ([uid2, ids]) => ids.map((id) => {
        const u = unite(uid2);
        const m = u?.membres.find((x) => x.id === id);
        return {
          cle: `a:${uid2}:${id}`,
          genre: "externe",
          id,
          unite: uid2,
          texte: `${m ? shortName(m) : "?"} (${u?.nom ?? "?"})`,
          detail: m ? `${fullName(m)} · ${u?.nom}` : "Personne retirée",
          email: m?.email,
          alerte: !m ? `ne fait plus partie de ${u?.nom ?? "son entité"}` : !m.email ? "pas d’adresse email" : void 0
        };
      })
    ),
    ...adressesLibres(e.autres).map((a) => ({
      cle: `m:${a}`,
      genre: "adresse",
      id: a,
      texte: a,
      detail: "adresse email",
      email: a,
      alerte: EMAIL_RE.test(a) ? void 0 : "adresse incomplète"
    }))
  ];
}
var nomsDestinataires = (data, e, units, courante) => choisis(data, e, units, courante).map((d) => (d.genre === "unite" ? `${d.texte} (toute l’entité)` : d.texte) + (d.alerte ? " ⚠" : ""));

// src/data/paiements.ts
var genreDe = (p) => p.type === "facture" ? "facture" : "remboursement";
var GENRES = {
  remboursement: {
    icon: "🧾",
    nom: "Remboursement",
    nouveau: "Nouveau remboursement",
    a: "À rembourser à",
    ce: "ce remboursement",
    duDoc: "du ticket",
    vise: "Ticket visé",
    accord: "le remboursement",
    sous: "Remboursements"
  },
  facture: {
    icon: "💳",
    nom: "Paiement de facture",
    nouveau: "Nouveau paiement",
    a: "À payer à",
    ce: "cette facture",
    duDoc: "de la facture",
    vise: "Facture visée",
    accord: "le paiement",
    sous: "Paiements"
  }
};
var genre = (p) => GENRES[genreDe(p)];
var chf = (n) => `CHF ${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
var holders = (data, perm) => {
  const expres = expresses(data, perm);
  return (expres.length ? expres : data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), perm))).map((p) => p.id);
};
var expresses = (data, perm) => data.people.filter((p) => p.actif && userRoles(data.roles, p).some((r) => !r.locked && r.permissions.includes(perm)));
var paiementTasks = (data) => data.tasks.filter((t) => !!t.paiement);

// src/data/notifs.ts
var DEFAULT_NOTIF = {
  assign: true,
  modif: true,
  echeance: true,
  echeanceJours: 3,
  retard: true,
  seance: true,
  seanceJours: 7,
  sondage: true,
  email: true,
  systeme: false
};
function computeNotifications(data, user, p, demandesMdp = [], pourInfo = [], units = [], courante) {
  const seen = new Set(data.notifLues?.[user.id] ?? []);
  const items = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const mine = data.tasks.filter((t) => t.responsables.includes(user.id) && !isDone(data, t));
  if (p.retard) {
    const late = mine.filter((t) => !!t.delai && t.delai < today());
    if (late.length)
      items.push({
        key: `retard:${today()}:${late.length}`,
        icon: "⚠️",
        text: late.length === 1 ? `« ${late[0].titre} » est en retard` : `${late.length} de tes tâches sont en retard`,
        sub: late.length === 1 ? `délai : ${fmtDate(late[0].delai)}` : late.slice(0, 3).map((t) => t.titre).join(" · ") + (late.length > 3 ? "…" : ""),
        link: late.length === 1 ? `/taches?tache=${late[0].id}` : "/taches?statut=retard",
        at: now,
        kind: "alerte"
      });
  }
  if (p.echeance)
    for (const t of mine) {
      const due = t.delai;
      if (!due) continue;
      const n = daysUntil(due);
      if (n < 0 || n > p.echeanceJours) continue;
      items.push({
        key: `echeance:${t.id}:${due}:${n === 0 ? "j0" : "avant"}`,
        icon: "⏰",
        text: n === 0 ? `« ${t.titre} » est à faire aujourd’hui` : `« ${t.titre} » est à faire dans ${n} jour${n > 1 ? "s" : ""}`,
        sub: `délai : ${fmtDate(due)}`,
        link: `/taches?tache=${t.id}`,
        at: now,
        kind: "alerte"
      });
    }
  if (p.seance && hasPermission(userRoles(data.roles, user), "tab.meetings")) {
    const next = [...data.meetings].filter((m) => m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0];
    const n = next ? daysUntil(next.date) : -1;
    if (next && n <= p.seanceJours) {
      const pv = next.pvArchives?.[0];
      items.push({
        key: `seance:${next.id}:${next.date}${pv ? ":pv" : ""}`,
        icon: "🗓️",
        text: `${next.titre} ${n === 0 ? "aujourd’hui" : n === 1 ? "demain" : `dans ${n} jours`}`,
        sub: `${fmtDate(next.date)}${next.heure ? ` à ${next.heure.replace(":", "h")}` : ""} · ${next.lieu || "lieu à définir"}${pv ? " · ordre du jour disponible" : ""}`,
        link: "/comite",
        at: now,
        kind: "alerte"
      });
    }
  }
  if (p.seance && hasPermission(userRoles(data.roles, user), "tab.meetings"))
    for (const m of data.meetings) {
      const pv = m.minutesArchives?.[0];
      if (!pv || pv.by === user.id || daysUntil(pv.at.slice(0, 10)) < -14) continue;
      items.push({
        key: `pvdispo:${pv.id}`,
        icon: "📝",
        text: (m.minutes?.version ?? 1) > 1 ? `PV du ${m.titre} corrigé (version ${m.minutes.version})` : `PV du ${m.titre} disponible`,
        sub: `validé le ${fmtDate(pv.at.slice(0, 10))}`,
        link: "/comite",
        at: pv.at,
        kind: "activite"
      });
    }
  if (p.sondage)
    for (const poll of data.polls ?? []) {
      if (!isOpen(poll) || !poll.cleMoi || poll.votes[poll.cleMoi]) continue;
      items.push({
        key: `sondage:${poll.id}`,
        icon: "📊",
        text: `Sondage : « ${poll.question} »`,
        sub: poll.dateLimite ? `réponds ${poll.clotureAuto === false ? "si possible " : ""}avant le ${echeance(poll)}` : "en attente de ta réponse",
        link: `/sondages?id=${poll.id}`,
        at: poll.creeLe,
        kind: "alerte"
      });
    }
  if (p.email)
    for (const e of data.emails ?? []) {
      if (e.creePar !== user.id) continue;
      const t = data.tasks.find((x) => x.id === e.taskId);
      if (!t || emailState(data, t, e) !== "aEnvoyer") continue;
      const at = dueAt(t, e.quand);
      const to = nomsDestinataires(data, e, units, courante);
      items.push({
        key: `email:${e.id}:${at}`,
        icon: "📧",
        text: `Email à envoyer : « ${fillTemplate(data, t, e, e.objet)} »`,
        sub: `${to.length ? `à ${to.join(", ")} · ` : ""}prévu le ${fmtDate(at.slice(0, 10))} à ${at.slice(11).replace(":", "h")}`,
        link: `/taches?tache=${t.id}&email=${e.id}`,
        at: now,
        kind: "alerte"
      });
    }
  if (p.assign)
    for (const t of data.tasks) {
      if (!t.proposee || t.responsables.length || isDone(data, t) || !hasPermission(userRoles(data.roles, user), "tasks.createAny", t.sectionId)) continue;
      items.push({
        key: `demande:${t.id}`,
        icon: "📨",
        text: `Demande de « ${t.proposee.unite} » : « ${t.titre} »`,
        sub: `envoyée par ${t.proposee.par}${t.delai ? ` · délai : ${fmtDate(t.delai)}` : ""} · à attribuer`,
        link: `/taches?tache=${t.id}`,
        at: t.proposee.le,
        kind: "activite"
      });
    }
  if (p.assign && data.propositions?.length && hasPermission(userRoles(data.roles, user), "admin.access"))
    for (const x of data.propositions) {
      if (x.statut !== "nouvelle") continue;
      items.push({
        key: `proposition:${x.id}`,
        icon: x.genre === "probleme" ? "🐞" : "💡",
        text: `Proposition d’amélioration : « ${x.texte.length > 70 ? `${x.texte.slice(0, 67)}…` : x.texte} »`,
        sub: `de ${x.par}${x.unite ? ` (${x.unite})` : ""}`,
        link: "/propositions",
        at: x.le,
        kind: "activite"
      });
    }
  if (hasPermission(userRoles(data.roles, user), "admin.access"))
    for (const d of demandesMdp) {
      const fiche = data.people.find((x) => x.id === d.personId);
      items.push({
        key: `mdp:${d.id}`,
        icon: "🔑",
        text: `${fiche ? fullName(fiche) : d.email} a oublié son mot de passe`,
        sub: d.peut ? "demande un mot de passe provisoire" : "à valider par un admin de son entité, du comité central ou un super-admin",
        link: "/mots-de-passe",
        at: d.le,
        kind: "alerte"
      });
    }
  if (p.assign) {
    const caisse = holders(data, "paiements.payer").includes(user.id);
    for (const t of paiementTasks(data)) {
      const { etat, montant, demandePar, visa } = t.paiement;
      const g = genre(t.paiement);
      const qui = t.paiement.externe ? `${t.paiement.externe.par} (${t.paiement.externe.unite})` : shortName(data.people.find((x) => x.id === demandePar));
      const todo = etat === "recu" && caisse ? { icon: "📥", text: `${g.nom} à traiter : « ${t.titre} »`, sub: `${chf(montant)} · ${qui} · visa à demander`, at: t.paiement.demandeLe } : etat === "visa" && visa?.a === user.id && demandePar !== user.id ? { icon: "✍️", text: `Visa demandé (${g.nom.toLowerCase()}) : « ${t.titre} »`, sub: `${chf(montant)} · ${qui} · par ${shortName(data.people.find((x) => x.id === visa.par))}`, at: visa.le } : etat === "valide" && caisse ? { icon: "🏦", text: `Virement à faire : « ${t.titre} »`, sub: `${chf(montant)} · ${qui}`, at: t.paiement.validation?.le ?? t.paiement.demandeLe } : null;
      if (todo) items.push({ key: `paiement:${t.id}:${etat}`, ...todo, link: `/taches?tache=${t.id}`, kind: "alerte" });
      const fait = etat === "paye" ? t.paiement.paye : etat === "refuse" ? t.paiement.refus : etat === "valide" ? t.paiement.validation : void 0;
      if (demandePar === user.id && fait && fait.par !== user.id)
        items.push({
          key: `paiement:${t.id}:${etat}:demandeur`,
          icon: etat === "paye" ? "✅" : etat === "refuse" ? "❌" : "✍️",
          text: etat === "paye" ? g === GENRES.facture ? `Facture « ${t.titre} » payée` : `Ton ticket « ${t.titre} » a été remboursé` : `${g.nom} « ${t.titre} » ${etat === "refuse" ? "refusé" : "visé"}`,
          sub: etat === "refuse" ? t.paiement.refus?.motif : `${chf(montant)} · par ${shortName(data.people.find((x) => x.id === fait.par))}`,
          link: `/taches?tache=${t.id}`,
          at: fait.le,
          kind: "activite"
        });
    }
  }
  for (const n of data.notifications ?? []) {
    if (n.userId !== user.id) continue;
    const nouvelle = ["assign", "info", "propose", "pris", "refus"].includes(n.type);
    if (nouvelle && !p.assign || !nouvelle && !p.modif) continue;
    if (n.type === "comment") {
      const ici = data.tasks.find((x) => x.id === n.taskId);
      const recue = ici ? void 0 : pourInfo.find((x) => `x:${x.uniteId}:${x.task.id}` === n.taskId);
      const titre = ici?.titre ?? recue?.task.titre ?? n.titre;
      if (titre === void 0) continue;
      items.push({
        key: n.id,
        icon: "💬",
        text: `${n.byName ?? fullName(data.people.find((x) => x.id === n.by))} a commenté « ${titre} »`,
        sub: n.detail,
        link: recue ? `/taches?pourinfo=${recue.uniteId}:${recue.task.id}` : `/taches?tache=${n.taskId}`,
        at: n.at,
        kind: "activite"
      });
      continue;
    }
    const t = data.tasks.find((x) => x.id === n.taskId);
    if (!t || t.paiement && n.type === "assign") continue;
    if (n.type === "propose" && (!aPrendrePourMoi(t, user.id) || isDone(data, t))) continue;
    const by = n.byName ?? fullName(data.people.find((x) => x.id === n.by));
    items.push({
      key: n.id,
      icon: n.type === "assign" ? "🆕" : n.type === "recur" ? "🔁" : n.type === "info" ? "👁" : n.type === "propose" || n.type === "pris" ? "🙋" : n.type === "refus" ? "🙅" : "✏️",
      text: n.type === "assign" ? `${by} t’a attribué « ${t.titre} »` : n.type === "info" ? `${by} te met au courant : « ${t.titre} »` : n.type === "propose" ? `${by} te propose « ${t.titre} » : tu t’en charges ?` : n.type === "pris" ? `${by} se charge de « ${t.titre} »` : n.type === "refus" ? `${by} n’est pas dispo pour « ${t.titre} »` : n.type === "recur" ? `Tâche récurrente reconduite : « ${t.titre} »` : `${by} a modifié « ${t.titre} »`,
      sub: n.type === "recur" ? n.detail ? `nouveau délai : ${n.detail}` : "sans délai" : n.type === "modif" ? n.detail : n.type === "refus" ? etatRefus(t) : t.delai ? `délai : ${fmtDate(t.delai)}` : void 0,
      link: `/taches?tache=${t.id}`,
      at: n.at,
      kind: "activite"
    });
  }
  if (p.assign)
    for (const x of pourInfo) {
      const t = x.task;
      if (x.statuts.find((s) => s.id === t.statusId)?.done) continue;
      items.push({
        key: `info:${x.uniteId}:${t.id}`,
        icon: "👁",
        text: `Pour info : « ${t.titre} »`,
        sub: `${x.unite}${t.delai ? ` · délai : ${fmtDate(t.delai)}` : ""}`,
        link: `/taches?pourinfo=${x.uniteId}:${t.id}`,
        at: t.updatedAt,
        kind: "activite"
      });
    }
  return items.map((x) => ({ ...x, unread: !seen.has(x.key) })).sort((a, b) => a.kind !== b.kind ? a.kind === "alerte" ? -1 : 1 : b.at.localeCompare(a.at));
}
function etatRefus(t) {
  if (!aPrendreOuverte(t)) return "quelqu’un s’en charge";
  if (plusPersonne(t)) return "plus personne n’a à répondre : propose-la à d’autres";
  const n = sansReponse(t).length + attenteAilleurs(t);
  return `${n} personne${n > 1 ? "s n’ont" : " n’a"} pas encore répondu`;
}

// src/data/pushServeur.ts
var LISTES = ["people", "roles", "sections", "statuses", "meetings", "events", "tasks", "polls", "emails", "notifications", "propositions"];
function donnees(lignes) {
  const d = Object.fromEntries(LISTES.map((k) => [k, []]));
  const prefs = {};
  const lues = {};
  for (const r of [...lignes].sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1))) {
    if (r.kind === "prefs") prefs[r.id] = r.data;
    else if (r.kind === "notifLues") lues[r.id] = r.data;
    else if (r.kind in d) d[r.kind].push(r.data);
  }
  return { data: { ...d, prefs, notifLues: lues }, prefs };
}
function notificationsPush(o) {
  const { data, prefs } = donnees(o.lignes);
  const moi = data.people.find((p2) => p2.id === o.fiche);
  if (!moi || moi.actif === false) return [];
  const p = { ...DEFAULT_NOTIF, ...prefs[o.fiche]?.notif };
  const d = avecSondages(data, [], o.courante, [], o.fiche);
  return computeNotifications(d, moi, p, o.demandesMdp ?? [], o.pourInfo ?? [], [], o.courante).filter((x) => x.unread);
}
var cleEnvoi = (cle) => cle.startsWith("retard:") ? cle.split(":").slice(0, 2).join(":") : cle;
var urlPush = (unite, lien) => `./?reel=${encodeURIComponent(unite)}#${lien}`;
function messagesPush(items, plusieurs) {
  const ou = (x) => plusieurs ? x.nomUnite : "";
  if (items.length <= 3)
    return items.map((x) => ({
      titre: `${x.icon} ${x.text}`,
      corps: [x.sub, ou(x)].filter(Boolean).join(" · "),
      url: urlPush(x.unite, x.link),
      tag: `${x.unite}|${x.key}`
    }));
  const lignes = items.slice(0, 4).map((x) => `${x.icon} ${x.text}${ou(x) ? ` (${ou(x)})` : ""}`);
  return [{
    titre: `${items.length} nouvelles notifications`,
    corps: lignes.join("\n") + (items.length > 4 ? "\n…" : ""),
    url: urlPush(items[0].unite, "/"),
    tag: "resume"
  }];
}
export {
  cleEnvoi,
  messagesPush,
  notificationsPush,
  urlPush
};
