// Généré par « npm run fonction » depuis src/data/pushServeur.ts (notifications appli fermée) : ne pas modifier à la main.

// src/data/aPrendre.ts
var nombreAPrendre = (a) => Math.min(Math.max(Math.floor(a?.nombre ?? 1) || 1, 1), 100);
var volontaires = (t) => (t.aPrendre?.personnes ?? []).filter((id) => t.responsables.includes(id));
var aPrendreOuverte = (t) => !!t.aPrendre?.personnes.length && !t.paiement && volontaires(t).length < nombreAPrendre(t.aPrendre);
var proposeeA = (t, userId) => !!userId && !t.paiement && !!t.aPrendre?.personnes.includes(userId);
var peutPrendre = (t, userId) => proposeeA(t, userId) && !t.responsables.includes(userId) && aPrendreOuverte(t);
var pasDispo = (t, userId) => !!userId && !!t.aPrendre?.refus?.includes(userId);
var aPrendrePourMoi = (t, userId) => peutPrendre(t, userId) && !pasDispo(t, userId);
var sansReponse = (t) => (t.aPrendre?.personnes ?? []).filter((id) => !t.responsables.includes(id) && !t.aPrendre?.refus?.includes(id));
var plusPersonne = (t) => !sansReponse(t).length;

// src/data/repetition.ts
var pad = (n) => String(n).padStart(2, "0");
var parts = (d) => d.split("-").map(Number);
var utc = (y, m, j) => new Date(Date.UTC(y, m - 1, j));
var iso = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
var plus = (d, n) => {
  const [y, m, j] = parts(d);
  return iso(utc(y, m, j + n));
};
var jourSemaine = (d) => (utc(...parts(d)).getUTCDay() + 6) % 7 + 1;
var finDeSemaine = (d) => plus(d, 7 - jourSemaine(d));

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
var pad2 = (n) => String(n).padStart(2, "0");
var ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
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

// src/data/pourInfo.ts
var pourMoi = (t, userId) => !!userId && !t.paiement && !!t.pourInfo?.personnes?.includes(userId);
var cleVu = (fiche) => `p:${fiche}`;
var dernierVu = (v) => v.revu ?? v.le;
var vuAvantModif = (v, t) => !!v && !!t.contenuLe && t.contenuLe > dernierVu(v);

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
  { id: "settings.lists", label: "Gérer sections, statuts et étiquettes", group: "Administration" },
  { id: "admin.access", label: "Accès console admin", group: "Administration" }
];
var ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id);
var userRoles = (roles, p) => p ? roles.filter((r) => p.roles.includes(r.id)) : [];
function hasPermission(roles, perm, sectionId) {
  return roles.some(
    (r) => (r.locked || r.permissions.includes(perm)) && (!sectionId || r.sections.length === 0 || r.sections.includes(sectionId))
  );
}

// src/data/seances.ts
function convoquesDe(data) {
  return data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), "tab.meetings"));
}
var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
var AVEC_MOIS = new RegExp(`^(.+?) (?:de |d['’])(?:${MOIS.join("|")}) \\d{4}$`, "i");

// src/data/polls.ts
function finSondage(p) {
  if (!p.dateLimite || p.clotureAuto === false) return null;
  const [y, m, d] = p.dateLimite.split("-").map(Number);
  const [h, mn] = (p.heureLimite || "24:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, mn).getTime();
}
var isOpen = (p) => !p.clotureLe && (finSondage(p) ?? Infinity) > Date.now();
var echeance = (p) => p.dateLimite ? `${fmtDate(p.dateLimite)}${p.heureLimite ? ` à ${p.heureLimite.replace(":", "h")}` : ""}` : "";

// src/data/lienPartage.ts
function lienAppli(chemin, mode = getMode()) {
  return `${location.origin}${location.pathname}${mode ? `?${mode}` : ""}#${chemin}`;
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
function appLink(taskId) {
  return lienAppli(`/taches?tache=${encodeURIComponent(taskId)}`);
}
function fillTemplate(data, task, e, text) {
  const person = (id) => data.people.find((p) => p.id === id);
  const values = {
    "{tâche}": task.titre,
    "{délai}": task.delai ? fmtDate(task.delai) : "sans délai",
    "{section}": [data.sections.find((s) => s.id === task.sectionId)?.nom, task.sousSection].filter(Boolean).join(" › "),
    "{responsables}": task.responsables.map((id) => fullName(person(id))).join(", "),
    "{statut}": data.statuses.find((s) => s.id === task.statusId)?.label ?? "",
    "{remarque}": task.remarque,
    // Seulement s'il sert : le serveur (notifications appli fermée) n'a pas l'adresse de l'appli.
    "{lien}": text.includes("{lien}") ? appLink(task.id) : "",
    "{expéditeur}": fullName(person(e.creePar))
  };
  return text.replace(/\{[^}]+\}/g, (k) => values[k] ?? k);
}

// src/data/destinataires.ts
var EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
var actives = (people) => people.filter((p) => p.actif);
var adressesLibres = (autres) => (autres ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
var membresDe = (data, e) => e ? actives(data.people).filter((p) => e.membres.includes(p.id)) : [];
function choisis(data, e) {
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
        alerte: !p || !p.actif ? "ne fait plus partie du club" : !p.email ? "pas d’adresse email" : void 0
      };
    }),
    ...(e.etiquettes ?? []).map((id) => {
      const et = data.etiquettes?.find((x) => x.id === id);
      const n = new Set(membresDe(data, et).map((p) => (p.email || "").toLowerCase()).filter(Boolean)).size;
      return {
        cle: `e:${id}`,
        genre: "etiquette",
        id,
        texte: et ? `🏷 ${et.nom}` : "Étiquette retirée",
        detail: `tous ses membres (${n})`,
        alerte: !et ? "n’existe plus" : n ? void 0 : "aucune adresse email"
      };
    }),
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
var nomsDestinataires = (data, e) => choisis(data, e).map((d) => (d.genre === "etiquette" ? `${d.texte} (tous ses membres)` : d.texte) + (d.alerte ? " ⚠" : ""));

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
  messages: true,
  echeance: true,
  echeanceJours: 3,
  retard: true,
  seance: true,
  seanceJours: 7,
  sondage: true,
  email: true,
  semaine: true,
  systeme: false
};
var lireNotif = (p) => ({ ...DEFAULT_NOTIF, ...p, messages: p?.messages ?? p?.modif ?? DEFAULT_NOTIF.messages });
function computeNotifications(data, user, p, demandesMdp = []) {
  const seen = new Set(data.notifLues?.[user.id] ?? []);
  const items = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const mine = data.tasks.filter((t) => t.responsables.includes(user.id) && !isDone(data, t));
  if (p.semaine && jourSemaine(today()) === 1) {
    const r = resumeSemaine(data, user, mine);
    if (r) items.push({ ...r, at: now });
  }
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
  if (p.seance && convoquesDe(data).some((x) => x.id === user.id)) {
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
      if (!isOpen(poll) || !poll.votants.includes(user.id) || poll.votes[user.id]) continue;
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
      const to = nomsDestinataires(data, e);
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
        sub: d.peut ? "demande un mot de passe provisoire" : "à valider par un admin ou un super-admin",
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
      const qui = shortName(data.people.find((x) => x.id === demandePar));
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
  const mentions = new Set(p.messages ? (data.notifications ?? []).filter((n) => n.userId === user.id && n.type === "mention").map(memeMessage) : []);
  for (const n of data.notifications ?? []) {
    if (n.userId !== user.id) continue;
    const message = n.type === "comment" || n.type === "mention";
    const nouvelle = ["assign", "info", "propose", "pris", "refus", "relance"].includes(n.type);
    if (message ? !p.messages : nouvelle ? !p.assign : !p.modif) continue;
    if (n.type === "comment" && mentions.has(memeMessage(n))) continue;
    if (n.type === "comment" || n.type === "mention" || n.type === "relance") {
      const ici = data.tasks.find((x) => x.id === n.taskId);
      const titre = ici?.titre ?? n.titre;
      if (titre === void 0) continue;
      const auteur = fullName(data.people.find((x) => x.id === n.by)) || n.byName || "?";
      if (n.type === "relance") {
        if (ici?.pourInfoVus?.[cleVu(user.id)]) continue;
        items.push({
          key: n.id,
          icon: "🔔",
          text: `${auteur} te rappelle « ${titre} »`,
          sub: "pour info · pas encore marquée « ✓ Vu »",
          link: `/taches?tache=${n.taskId}`,
          at: n.at,
          kind: "activite"
        });
        continue;
      }
      items.push({
        key: n.id,
        icon: n.type === "mention" ? "📣" : "💬",
        text: `${auteur} ${n.type === "mention" ? "te mentionne dans" : "a commenté"} « ${titre} »`,
        sub: n.detail,
        link: `/taches?tache=${n.taskId}&discussion=1`,
        at: n.at,
        kind: "activite"
      });
      continue;
    }
    const t = data.tasks.find((x) => x.id === n.taskId);
    if (!t || t.paiement && n.type === "assign") continue;
    if (n.type === "propose" && (!aPrendrePourMoi(t, user.id) || isDone(data, t))) continue;
    const by = fullName(data.people.find((x) => x.id === n.by)) || n.byName || "?";
    items.push({
      key: n.id,
      icon: n.type === "assign" ? "🆕" : n.type === "recur" ? "🔁" : n.type === "info" ? "👁" : n.type === "propose" || n.type === "pris" ? "🙋" : n.type === "refus" ? "🙅" : n.type === "toutVu" ? "✅" : "✏️",
      text: n.type === "assign" ? `${by} t’a attribué « ${t.titre} »` : n.type === "toutVu" ? `Tout le monde a vu « ${t.titre} »` : n.type === "info" ? `${by} te met au courant : « ${t.titre} »` : n.type === "propose" ? `${by} te propose « ${t.titre} » : tu t’en charges ?` : n.type === "pris" ? `${by} se charge de « ${t.titre} »` : n.type === "refus" ? `${by} n’est pas dispo pour « ${t.titre} »` : n.type === "recur" ? `Tâche récurrente reconduite : « ${t.titre} »` : `${by} a modifié « ${t.titre} »`,
      sub: n.type === "recur" ? n.detail ? `nouveau délai : ${n.detail}` : "sans délai" : n.type === "modif" ? n.detail : n.type === "refus" ? etatRefus(t) : n.type === "toutVu" ? `pour info · dernier « ✓ Vu » : ${by}` : t.delai ? `délai : ${fmtDate(t.delai)}` : void 0,
      link: `/taches?tache=${t.id}`,
      at: n.at,
      kind: "activite"
    });
  }
  if (p.modif) {
    for (const t of data.tasks) {
      if (!pourMoi(t, user.id) || isDone(data, t) || !vuAvantModif(t.pourInfoVus?.[cleVu(user.id)], t)) continue;
      items.push({ key: `revoir:${t.id}:${t.contenuLe}`, icon: "✏️", text: `« ${t.titre} » a changé depuis ton « ✓ Vu »`, sub: "pour info · à revoir", link: `/taches?tache=${t.id}`, at: t.contenuLe, kind: "activite" });
    }
  }
  return items.map((x) => ({ ...x, unread: !seen.has(x.key) })).sort((a, b) => a.kind !== b.kind ? a.kind === "alerte" ? -1 : 1 : b.at.localeCompare(a.at));
}
var JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
var nomJour = (jour) => jour === today() ? "aujourd’hui" : JOURS[jourSemaine(jour) - 1];
var nombre = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
function resumeSemaine(data, user, mine) {
  const auj = today();
  const fin = finDeSemaine(auj);
  const taches = mine.filter((t) => !!t.delai && t.delai <= fin).sort((a, b) => a.delai.localeCompare(b.delai));
  const retard = taches.filter((t) => t.delai < auj).length;
  const seances = hasPermission(userRoles(data.roles, user), "tab.meetings") ? data.meetings.filter((m) => m.date >= auj && m.date <= fin).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const evenements = data.events.filter((e) => !e.repetition && e.date <= fin && (e.dateFin || e.date) >= auj).sort((a, b) => a.date.localeCompare(b.date));
  const sondages = (data.polls ?? []).filter((x) => isOpen(x) && x.votants.includes(user.id) && !x.votes[user.id]);
  if (!taches.length && !seances.length && !evenements.length && !sondages.length) return null;
  const quandEv = (e) => e.date < auj ? "en cours" : nomJour(e.date);
  const parts2 = [
    taches.length && `${nombre(taches.length, "tâche")} à faire${retard ? ` (${retard} en retard)` : ""}`,
    seances.length === 1 ? `${seances[0].titre} ${nomJour(seances[0].date)}` : seances.length && nombre(seances.length, "séance"),
    evenements.length === 1 ? `${evenements[0].nom} ${quandEv(evenements[0])}` : evenements.length && nombre(evenements.length, "événement"),
    sondages.length && `${nombre(sondages.length, "sondage")} à répondre`
  ].filter(Boolean);
  const ordre = [...taches.filter((t) => t.delai >= auj), ...taches.filter((t) => t.delai < auj)];
  const detail = taches.length ? ordre.slice(0, 3).map((t) => `« ${t.titre} » ${t.delai < auj ? "en retard" : nomJour(t.delai)}`).join(" · ") + (taches.length > 3 ? " …" : "") : [
    ...seances.map((m) => `${m.titre} ${nomJour(m.date)}${m.heure ? ` à ${m.heure.replace(":", "h")}` : ""}`),
    ...evenements.map((e) => `${e.nom} ${quandEv(e)}${e.lieu ? ` · ${e.lieu}` : ""}`)
  ].slice(0, 3).join(" · ");
  return {
    key: `semaine:${auj}`,
    icon: "📅",
    text: `Cette semaine : ${parts2.join(", ")}`,
    sub: detail || void 0,
    link: taches.length ? "/taches?delai=semaine" : seances.length ? "/comite" : evenements.length ? "/evenements" : "/sondages",
    kind: "alerte"
  };
}
function etatRefus(t) {
  if (!aPrendreOuverte(t)) return "quelqu’un s’en charge";
  if (plusPersonne(t)) return "plus personne n’a à répondre : propose-la à d’autres";
  const n = sansReponse(t).length;
  return `${n} personne${n > 1 ? "s n’ont" : " n’a"} pas encore répondu`;
}
var memeMessage = (n) => `${n.taskId}|${n.by}|${(n.detail ?? "").replace(/\s+/g, " ").trim().slice(0, 80)}`;

// src/data/pushServeur.ts
var LISTES = ["people", "roles", "sections", "statuses", "meetings", "events", "tasks", "polls", "emails", "notifications", "propositions", "etiquettes"];
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
  const p = lireNotif(prefs[o.fiche]?.notif);
  return computeNotifications(data, moi, p, o.demandesMdp ?? []).filter((x) => x.unread);
}
var cleEnvoi = (cle) => cle.startsWith("retard:") ? cle.split(":").slice(0, 2).join(":") : cle;
var urlPush = (_unite, lien) => `./?reel#${lien}`;
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
