import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from './icones';
import { cleEtiquette, commentairesEtiquette, nonLus } from '../data/commentaires';
import { useStore } from '../data/store';
import type { AppData, ClubEvent, Etiquette, Section, SerieEvenements } from '../data/types';
import { COULEURS, fmtRange, fullName } from '../data/utils';
import { COULEURS_APPLI, deTsl, isCouleur, versTsl } from '../data/couleur';
import { hasPermission, userRoles } from '../data/permissions';
import {
  aReprendre, aReprendrePourSerie, etiquetteDeLaSection, etiquetteDeLaSerie, etiquetteDeLEvenement, etiquetteDuComite, etiquettesAReprendre,
  etiquettesAReprendrePourSerie, lieuxDe, nomLieu, reglerComite, reglerEtiquetteEvenement, reglerEtiquetteSerie, reglerGroupe, sectionEvenements, sorteDe,
  type ChoixEtiquette,
} from '../data/etiquettes';
import { BadgeEtiquette, ChoixIconeEtiquette } from './IconesEtiquette';

// Pièces communes du réglage des étiquettes : la case « Étiquette » d'un événement ou d'une série d'événements, la coche
// « Groupe » d'une section, leurs membres, leur couleur (etiquettes.ts).

/** Couleurs proposées pour une étiquette. */
const PROPOSEES = [...new Set([...COULEURS, ...COULEURS_APPLI.map((x) => x.c)])];

/**
 * Couleur d'une étiquette, choisie dans l'appli (le sélecteur des appareils ne repart pas toujours de la couleur
 * actuelle) : teinte, saturation et luminosité partent de la couleur actuelle, pour la retoucher un peu ; son code
 * (#rrggbb) ; des couleurs proposées ; « Revenir à la couleur d'avant ». Enregistrée une fois choisie (pas à chaque
 * mouvement des curseurs), et en fermant.
 */
export function CouleurEtiquette({ e, onChange, onFermer }: { e: Etiquette; onChange: (c: string) => void; onFermer: () => void }) {
  const avant = useRef(e.couleur);
  // Couleur choisie (son code) et position des curseurs : gardée à part, pour ne pas perdre la teinte d'un gris.
  const [couleur, setCouleur] = useState(e.couleur);
  const [tsl, setTsl] = useState(() => versTsl(e.couleur));
  const [code, setCode] = useState(e.couleur);
  const envoyee = useRef(e.couleur);
  const derniere = useRef(e.couleur);
  const minuterie = useRef<ReturnType<typeof setTimeout>>();
  const envoyer = () => {
    clearTimeout(minuterie.current);
    minuterie.current = undefined;
    if (derniere.current !== envoyee.current) {
      envoyee.current = derniere.current;
      onChange(derniere.current);
    }
  };
  const envoyerRef = useRef(envoyer);
  envoyerRef.current = envoyer;
  // En fermant : la couleur pas encore enregistrée l'est.
  useEffect(() => () => envoyerRef.current(), []);
  // Changée ailleurs (Annuler, autre appareil) : les curseurs la reprennent.
  useEffect(() => {
    if (e.couleur === envoyee.current) return;
    envoyee.current = derniere.current = e.couleur;
    setCouleur(e.couleur);
    setCode(e.couleur);
    setTsl(versTsl(e.couleur));
  }, [e.couleur]);
  const choisir = (c: string, o: { tsl?: [number, number, number]; tout?: boolean } = {}) => {
    derniere.current = c;
    setCouleur(c);
    setCode(c);
    setTsl(o.tsl ?? versTsl(c));
    clearTimeout(minuterie.current);
    if (o.tout) envoyer();
    else minuterie.current = setTimeout(envoyer, 600);
  };
  const [h, s, l] = tsl;
  const curseur = (nom: string, i: 0 | 1 | 2, max: number, fond: string) => (
    <label className="couleur-curseur">
      <span>{nom}</span>
      <input type="range" min={0} max={max} value={tsl[i]} style={{ background: fond }}
        onChange={(ev) => {
          const x = [...tsl] as [number, number, number];
          x[i] = Number(ev.target.value);
          choisir(deTsl(...x), { tsl: x });
        }} />
    </label>
  );
  const teintes = [0, 60, 120, 180, 240, 300, 360].map((x) => `hsl(${x} ${s}% ${l}%)`).join(', ');
  return (
    <div className="couleur-etiquette" role="group" aria-label={`Couleur de l’étiquette ${e.nom}`}>
      <div className="row wrap couleur-apercu">
        <BadgeEtiquette e={{ ...e, couleur }} />
        {couleur !== avant.current && (
          <small className="muted">
            avant : <span className="couleur-pastille" style={{ background: avant.current }} aria-hidden /> {avant.current}
          </small>
        )}
      </div>
      {curseur('Teinte', 0, 360, `linear-gradient(to right, ${teintes})`)}
      {curseur('Saturation', 1, 100, `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`)}
      {curseur('Luminosité', 2, 100, `linear-gradient(to right, hsl(${h} ${s}% 0%), hsl(${h} ${s}% 50%), hsl(${h} ${s}% 100%))`)}
      <div className="row wrap couleur-codes">
        <label className="inline">
          Code
          <input className="couleur-code" value={code} maxLength={7} spellCheck={false} aria-label={`Code de la couleur de ${e.nom}`}
            onChange={(ev) => {
              const v = ev.target.value.trim();
              setCode(v);
              const x = (v.startsWith('#') ? v : `#${v}`).toLowerCase();
              if (isCouleur(x)) choisir(x);
            }}
            onBlur={() => setCode(couleur)}
            onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()} />
        </label>
        <span className="couleur-proposees">
          {PROPOSEES.map((c) => (
            <button key={c} type="button" className={`couleur-pastille choix ${c === couleur ? 'on' : ''}`} style={{ background: c }} title={c} aria-label={`Couleur ${c}`} aria-pressed={c === couleur}
              onClick={() => choisir(c, { tout: true })} />
          ))}
        </span>
      </div>
      <div className="row wrap">
        {couleur !== avant.current && (
          <button type="button" className="btn small link" onClick={() => choisir(avant.current, { tout: true })}><Icone n="revenir" /> Revenir à la couleur d’avant</button>
        )}
        <button type="button" className="btn small" onClick={onFermer}>OK</button>
      </div>
    </div>
  );
}

/** Membres d'une étiquette : ils voient ses points. « ＋ Le comité » : les personnes qui ont accès aux séances. */
export function MembresEtiquette({ membres, onChange, disabled, nom }: { membres: string[]; onChange: (m: string[]) => void; disabled?: boolean; nom: string }) {
  const { data } = useStore();
  const personnes = data.people.filter((p) => p.actif).sort((a, b) => fullName(a).localeCompare(fullName(b), 'fr'));
  const comite = personnes.filter((p) => hasPermission(userRoles(data.roles, p), 'tab.meetings')).map((p) => p.id);
  const bascule = (id: string) => onChange(membres.includes(id) ? membres.filter((x) => x !== id) : [...membres, id]);
  return (
    <fieldset className="etiquette-personnes">
      <legend>Membres ({membres.length}) : ils voient les points de « {nom || '…'} »</legend>
      <div className="chips">
        {personnes.map((p) => {
          const on = membres.includes(p.id);
          return (
            <button key={p.id} type="button" className={`chip ${on ? 'on' : ''}`} disabled={disabled} aria-pressed={on} onClick={() => bascule(p.id)}>
              {fullName(p)}
            </button>
          );
        })}
      </div>
      {!disabled && comite.some((id) => !membres.includes(id)) && (
        <button type="button" className="btn small" onClick={() => onChange([...new Set([...membres, ...comite])])}>＋ Le comité</button>
      )}
    </fieldset>
  );
}

/** Nombre de points d'une étiquette (pour la choisir). */
const resume = (data: { tasks: { etiquettes?: string[] }[] }, e: Etiquette) => {
  const n = data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
  const m = e.membres?.length ?? 0;
  return `${n} point${n > 1 ? 's' : ''}, ${m} membre${m > 1 ? 's' : ''}`;
};

/**
 * Case « Étiquette » (formulaire d'un événement) ou coche « Groupe » (section) : cochée, on choisit les membres ; sans
 * étiquette reliée, on peut reprendre une ancienne étiquette (proposée d'office si elle a le même nom ou le même jour).
 */
export function CaseEtiquette({ titre, aide, deja, nom, date, valeur, onChange, disabled }: {
  titre: string;
  aide: string;
  deja?: Etiquette;
  nom: string;
  date?: string;
  valeur: ChoixEtiquette;
  onChange: (c: ChoixEtiquette) => void;
  disabled?: boolean;
}) {
  const { data } = useStore();
  const candidates = deja ? [] : etiquettesAReprendre(data, nom, date);
  const cocher = (on: boolean) => {
    if (!on) return onChange(null);
    const p = deja ? undefined : aReprendre(data, nom, date);
    onChange({ membres: deja?.membres ?? p?.membres ?? [], reprise: p?.id });
  };
  const reprendre = (id: string) => {
    const e = candidates.find((x) => x.id === id);
    onChange({ membres: e?.membres ?? valeur?.membres ?? [], reprise: e?.id });
  };
  return (
    <fieldset className="full case-etiquette">
      <label className="inline">
        <input type="checkbox" checked={!!valeur} disabled={disabled} onChange={(e) => cocher(e.target.checked)} /> <b>{titre}</b>
      </label>
      <small className="muted">{aide}</small>
      {valeur && candidates.length > 0 && (
        <label>
          Étiquette
          <select value={valeur.reprise ?? ''} disabled={disabled} onChange={(e) => reprendre(e.target.value)}>
            <option value="">Nouvelle étiquette</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>Reprendre « {e.nom} » ({resume(data, e)})</option>)}
          </select>
        </label>
      )}
      {valeur && <MembresEtiquette nom={nom} membres={valeur.membres} disabled={disabled} onChange={(membres) => onChange({ ...valeur, membres })} />}
    </fieldset>
  );
}

/**
 * D'où vient une étiquette qu'une série peut reprendre : celle d'un événement, d'une autre série, ou ancienne, à relier.
 */
export function origineEtiquette(data: Pick<AppData, 'events' | 'seriesEvenements'>, e: Etiquette) {
  switch (sorteDe(e)) {
    case 'evenement': return `de l’événement « ${data.events.find((x) => x.id === e.eventId)?.nom ?? e.nom} »`;
    case 'serie': return `de la série « ${data.seriesEvenements?.find((x) => x.id === e.serieId)?.nom ?? e.nom} »`;
    default: return 'à relier';
  }
}

/** « Reprendre « Championnat » (de l'événement « Manche 1 », 3 points, 4 membres) ». */
const libelleReprise = (data: AppData, e: Etiquette) => `Reprendre « ${e.nom} » (${origineEtiquette(data, e)}, ${resume(data, e)})`;

/**
 * Case « Étiquette » d'une série d'événements (fiche de la série) : cochée, on choisit ses membres. Sans étiquette
 * reliée, on peut reprendre une étiquette déjà là (proposée d'office si elle a le même nom que la série) : une ancienne à
 * relier, celle d'un événement ou d'une autre série ; elle garde ses membres, sa couleur, son icône et ses points.
 */
export function CaseEtiquetteSerie({ serie, valeur, onChange, disabled }: {
  serie: Pick<SerieEvenements, 'id' | 'nom'>;
  valeur: ChoixEtiquette;
  onChange: (c: ChoixEtiquette) => void;
  disabled?: boolean;
}) {
  const { data } = useStore();
  const deja = etiquetteDeLaSerie(data, serie.id);
  const candidates = deja ? [] : etiquettesAReprendrePourSerie(data, serie);
  const cocher = (on: boolean) => {
    if (!on) return onChange(null);
    const p = deja ? undefined : aReprendrePourSerie(data, serie);
    onChange({ membres: deja?.membres ?? p?.membres ?? [], reprise: p?.id });
  };
  const reprendre = (id: string) => {
    const e = candidates.find((x) => x.id === id);
    onChange({ membres: e?.membres ?? valeur?.membres ?? [], reprise: e?.id });
  };
  const choisie = valeur?.reprise ? candidates.find((x) => x.id === valeur.reprise) : undefined;
  const lieu = (deja ?? choisie) && lieuxDe((deja ?? choisie)!, data.sections).find((l) => l.sousSection);
  const place = lieu && (deja || sorteDe(choisie!) !== 'libre') ? nomLieu(lieu, data.sections) : `${sectionEvenements(data)?.nom ?? 'Événements'} › ${serie.nom.trim() || '…'}`;
  return (
    <fieldset className="full case-etiquette">
      <label className="inline">
        <input type="checkbox" checked={!!valeur} disabled={disabled} onChange={(e) => cocher(e.target.checked)} /> <b>Étiquette de la série</b>
      </label>
      <small className="muted">
        Ses membres, du comité ou non, voient les points de toute la série : ceux rattachés à ses événements, et ceux de la sous-section « {place} »
        {deja || choisie ? '' : ' (créée d’office)'}, pour ce qui vaut pour toute la série.
      </small>
      {valeur && candidates.length > 0 && (
        <label>
          Laquelle
          <select value={valeur.reprise ?? ''} disabled={disabled} aria-label="Étiquette de la série : nouvelle, ou une étiquette déjà là" onChange={(e) => reprendre(e.target.value)}>
            <option value="">Nouvelle étiquette</option>
            {candidates.map((e) => <option key={e.id} value={e.id}>{libelleReprise(data, e)}</option>)}
          </select>
        </label>
      )}
      {choisie && sorteDe(choisie) !== 'libre' && (
        <small className="reprise-deja">
          <Icone n="alerte" /> « {choisie.nom} » devient l’étiquette de la série, avec ses membres et ses points : {sorteDe(choisie) === 'evenement' ? 'l’événement' : 'la série'}{' '}
          {origineEtiquette(data, choisie).replace(/^de (l’événement|la série) /, '')} n’en aura plus.
        </small>
      )}
      {valeur && <MembresEtiquette nom={serie.nom} membres={valeur.membres} disabled={disabled} onChange={(membres) => onChange({ ...valeur, membres })} />}
    </fieldset>
  );
}

/** Points qui portent l'étiquette. */
const nbPoints = (data: { tasks: { etiquettes?: string[] }[] }, e: Etiquette) => data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Une étiquette réglée : sa couleur et sa pastille (un clic sur chacune pour la changer), ses membres et ses points ;
 * dépliée, son icône et ses membres. `onMembres` : enregistre les membres (selon la sorte : événement, groupe, comité).
 */
export function EtiquetteReglee({ e, peut, onMembres, detail, deplie }: { e: Etiquette; peut: boolean; onMembres: (m: string[]) => void; detail?: string; deplie?: boolean }) {
  const { data, user, update, discussionLueLe } = useStore();
  const navigate = useNavigate();
  // Une partie dépliée à la fois : sa couleur, son icône, ou ses membres (juste créée : ses membres, à choisir).
  const [panneau, setPanneau] = useState<'couleur' | 'icone' | 'membres' | null>(deplie ? 'membres' : null);
  const basculer = (p: typeof panneau) => setPanneau(panneau === p ? null : p);
  const ouvert = panneau === 'membres';
  // Sa discussion (066) : pour ses membres ; les messages pas encore lus sur le bouton.
  const membre = !!user && !!e.membres?.includes(user.id);
  const aLire = membre ? nonLus(commentairesEtiquette(data, e.id), discussionLueLe(cleEtiquette(e.id)), user.id) : 0;
  const changer = (p: Partial<Etiquette>, quoi: string) =>
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).map((x) => (x.id === e.id ? { ...x, ...p } : x));
    }, `Étiquette « ${e.nom} » : ${quoi}`);
  const m = e.membres?.length ?? 0;
  return (
    <>
      <span className="etiquette-reglee">
        <button type="button" className="couleur-bouton" style={{ background: e.couleur }} disabled={!peut} aria-expanded={panneau === 'couleur'}
          aria-label={`Changer la couleur (${e.nom})`} title="Changer la couleur" onClick={() => basculer('couleur')} />
        {peut ? (
          <button type="button" className="etiquette-badge-btn" aria-expanded={panneau === 'icone'} aria-label={`Changer l’icône (${e.nom})`} title="Changer l’icône"
            onClick={() => basculer('icone')}>
            <BadgeEtiquette e={e} /> <Icone n="modifier" />
          </button>
        ) : (
          <BadgeEtiquette e={e} />
        )}
        {detail && <small className="muted">{detail}</small>}
        <button type="button" className="btn small" aria-expanded={ouvert} onClick={() => basculer('membres')}>
          {pluriel(m, 'membre')} · {pluriel(nbPoints(data, e), 'point')}
        </button>
        {membre && (
          <button type="button" className="btn small" title={`Discussion de « ${e.nom} » : ses membres`} aria-label={`Discussion de l’étiquette ${e.nom}`}
            onClick={() => navigate(`/messages?d=${encodeURIComponent(cleEtiquette(e.id))}`)}>
            <Icone n="message" /> Discussion{aLire > 0 && <span className="discussion-nb">{aLire}</span>}
          </button>
        )}
      </span>
      {panneau === 'couleur' && peut && (
        <div className="etiquette-detail">
          <CouleurEtiquette e={e} onChange={(c) => changer({ couleur: c }, 'couleur')} onFermer={() => setPanneau(null)} />
        </div>
      )}
      {panneau === 'icone' && peut && (
        <div className="etiquette-detail">
          <ChoixIconeEtiquette e={e} ouvert onFermer={() => setPanneau(null)} onChange={(icone) => { changer({ icone }, icone ? 'icône' : 'icône par défaut'); setPanneau(null); }} />
        </div>
      )}
      {ouvert && (
        <div className="etiquette-detail">
          <ChoixIconeEtiquette e={e} disabled={!peut} onChange={(icone) => changer({ icone }, icone ? 'icône' : 'icône par défaut')} />
          <MembresEtiquette nom={e.nom} membres={e.membres ?? []} disabled={!peut} onChange={onMembres} />
        </div>
      )}
    </>
  );
}

/**
 * Cocher crée l'étiquette ; s'il y a d'anciennes étiquettes à reprendre, on choisit d'abord (la plus proche proposée).
 * Renvoie l'état du choix en cours et les actions.
 */
function useCreation(nom: string, date: string | undefined, creer: (c: ChoixEtiquette) => void, autres?: { candidates: Etiquette[]; proposee?: Etiquette }) {
  const { data } = useStore();
  const [choix, setChoix] = useState<ChoixEtiquette>(null);
  const [cree, setCree] = useState(false);
  const candidates = autres?.candidates ?? etiquettesAReprendre(data, nom, date);
  const faire = (c: ChoixEtiquette) => {
    setCree(true);
    creer(c);
  };
  const commencer = () => {
    if (!candidates.length) return faire({ membres: [] });
    const p = autres ? autres.proposee : aReprendre(data, nom, date);
    setChoix({ membres: p?.membres ?? [], reprise: p?.id });
  };
  const valider = () => {
    if (choix) faire(choix);
    setChoix(null);
  };
  const choisir = (id: string) => {
    const x = candidates.find((y) => y.id === id);
    setChoix({ membres: x?.membres ?? [], reprise: x?.id });
  };
  return { choix, cree, candidates, commencer, valider, choisir, annuler: () => setChoix(null) };
}

/** Choix « Nouvelle étiquette / Reprendre « … » », puis « Créer ». `libelle` : le texte de chaque étiquette à reprendre. */
function ChoixReprise({ nom, c, bouton, libelle }: { nom: string; c: ReturnType<typeof useCreation>; bouton: string; libelle?: (e: Etiquette) => string }) {
  if (!c.choix) return null;
  return (
    <span className="row wrap">
      <select value={c.choix.reprise ?? ''} aria-label={`Étiquette de ${nom}`} onChange={(e) => c.choisir(e.target.value)}>
        <option value="">Nouvelle étiquette</option>
        {c.candidates.map((e) => <option key={e.id} value={e.id}>{libelle ? libelle(e) : `Reprendre « ${e.nom} »`}</option>)}
      </select>
      <button type="button" className="btn small primary" onClick={c.valider}>{bouton}</button>
    </span>
  );
}

/** Coche « Groupe » d'une section : son étiquette (à son nom), ses membres ; on peut reprendre une ancienne étiquette. */
export function GroupeSection({ s, peut, titre }: { s: Section; peut: boolean; titre?: boolean }) {
  const { data, update } = useStore();
  const deja = etiquetteDeLaSection(data, s.id);
  const c = useCreation(s.nom, undefined, (x) => update((d) => reglerGroupe(d, s.id, x), `Section « ${s.nom} » : groupe (étiquette)`));
  const cocher = (on: boolean) => {
    if (on) return c.commencer();
    if (c.choix) return c.annuler();
    const n = deja ? nbPoints(data, deja) : 0;
    if (!confirm(`« ${s.nom} » n’est plus un groupe : son étiquette est retirée${n ? ` de ses ${n} point(s) (ils restent dans la section)` : ''}. Continuer ?`)) return;
    update((d) => reglerGroupe(d, s.id, null), `Section « ${s.nom} » : plus un groupe`);
  };
  return (
    <div className="groupe-section">
      <label className="inline" title="La section devient une étiquette : ses membres voient ses points">
        <input type="checkbox" checked={!!deja || !!c.choix} disabled={!peut} aria-label={`Groupe : la section ${s.nom} est une étiquette`} onChange={(e) => cocher(e.target.checked)} />
        {titre ? <b>{s.nom}</b> : 'Groupe'}
      </label>
      <ChoixReprise nom={`la section ${s.nom}`} c={c} bouton="Créer le groupe" />
      {deja && <EtiquetteReglee e={deja} peut={peut} deplie={c.cree} onMembres={(membres) => update((d) => reglerGroupe(d, s.id, { membres }), `Groupe « ${s.nom} » : membres modifiés`)} />}
    </div>
  );
}

/**
 * Case « Étiquette » d'un événement (page Étiquettes) : enregistrée tout de suite ; sa sous-section dans « Événements ».
 * `etat` : où en est un événement passé (« passé · 2 points pas terminés »).
 */
export function EvenementEtiquette({ ev, peut, etat }: { ev: ClubEvent; peut: boolean; etat?: string }) {
  const { data, update } = useStore();
  const deja = etiquetteDeLEvenement(data, ev.id);
  const c = useCreation(ev.nom, ev.date, (x) =>
    update((d) => {
      const e = d.events.find((y) => y.id === ev.id);
      if (e) reglerEtiquetteEvenement(d, e, x);
    }, `Événement « ${ev.nom} » : étiquette`),
  );
  const cocher = (on: boolean) => {
    if (on) return c.commencer();
    if (c.choix) return c.annuler();
    const n = deja ? nbPoints(data, deja) : 0;
    if (!confirm(`Retirer l’étiquette de « ${ev.nom} » ?${n ? ` Ses ${n} point(s) la perdent ; ils restent dans leur sous-section.` : ''}`)) return;
    update((d) => reglerEtiquetteEvenement(d, ev, null), `Événement « ${ev.nom} » : sans étiquette`);
  };
  const lieu = deja ? lieuxDe(deja, data.sections)[0] : undefined;
  return (
    <div className="groupe-section">
      <label className="inline">
        <input type="checkbox" checked={!!deja || !!c.choix} disabled={!peut} aria-label={`Étiquette de l’événement ${ev.nom}`} onChange={(e) => cocher(e.target.checked)} />
        <b>{ev.nom}</b> <small className="muted">{fmtRange(ev.date, ev.dateFin)}{ev.repetition ? ' 🔁' : ''}</small>
      </label>
      {etat && <small className="etat-passe">{etat}</small>}
      <ChoixReprise nom={`l’événement ${ev.nom}`} c={c} bouton="Créer l’étiquette" />
      {deja && (
        <EtiquetteReglee e={deja} peut={peut} deplie={c.cree} detail={lieu ? nomLieu(lieu, data.sections) : undefined}
          onMembres={(membres) => update((d) => reglerEtiquetteEvenement(d, ev, { membres }), `Événement « ${ev.nom} » : membres de l’étiquette modifiés`)} />
      )}
    </div>
  );
}

/**
 * Case « Étiquette » d'une série d'événements (page Étiquettes) : enregistrée tout de suite ; sa sous-section dans
 * « Événements » ; on peut reprendre une étiquette déjà là (à relier, d'un événement, d'une autre série).
 */
export function SerieEtiquette({ s, peut, etat }: { s: SerieEvenements; peut: boolean; etat?: string }) {
  const { data, update } = useStore();
  const deja = etiquetteDeLaSerie(data, s.id);
  const c = useCreation(s.nom, undefined, (x) => update((d) => reglerEtiquetteSerie(d, s, x), `Série « ${s.nom} » : étiquette`), {
    candidates: etiquettesAReprendrePourSerie(data, s),
    proposee: aReprendrePourSerie(data, s),
  });
  const cocher = (on: boolean) => {
    if (on) return c.commencer();
    if (c.choix) return c.annuler();
    const n = deja ? nbPoints(data, deja) : 0;
    if (!confirm(`Retirer l’étiquette de la série « ${s.nom} » ?${n ? ` Ses ${n} point(s) la perdent ; ils restent dans leur sous-section.` : ''}`)) return;
    update((d) => reglerEtiquetteSerie(d, s, null), `Série « ${s.nom} » : sans étiquette`);
  };
  const n = data.events.filter((e) => e.dansSerie === s.id && !e.serie).length;
  const lieu = deja ? lieuxDe(deja, data.sections)[0] : undefined;
  return (
    <div className="groupe-section">
      <label className="inline">
        <input type="checkbox" checked={!!deja || !!c.choix} disabled={!peut} aria-label={`Étiquette de la série ${s.nom}`} onChange={(e) => cocher(e.target.checked)} />
        <b>{s.nom}</b> <small className="muted">série · {pluriel(n, 'événement')}</small>
      </label>
      {etat && <small className="etat-passe">{etat}</small>}
      <ChoixReprise nom={`la série ${s.nom}`} c={c} bouton="Créer l’étiquette" libelle={(e) => libelleReprise(data, e)} />
      {deja && (
        <EtiquetteReglee e={deja} peut={peut} deplie={c.cree} detail={lieu ? nomLieu(lieu, data.sections) : undefined}
          onMembres={(membres) => update((d) => reglerEtiquetteSerie(d, s, { membres }), `Série « ${s.nom} » : membres de l’étiquette modifiés`)} />
      )}
    </div>
  );
}

/** « Comité » : l'étiquette des points qui n'ont ni groupe ni événement ; ses membres (d'office : accès aux séances). */
export function Comite({ peut }: { peut: boolean }) {
  const { data, update } = useStore();
  const comite = etiquetteDuComite(data);
  const [cree, setCree] = useState(false);
  const cocher = (on: boolean) => {
    if (on) {
      if (!confirm('Créer l’étiquette « Comité » ? Les points qui n’ont ni groupe ni événement la reçoivent ; leur discussion est alors réservée à ses membres (et aux personnes qu’on y ajoute).')) return;
      const membres = data.people.filter((p) => p.actif && hasPermission(userRoles(data.roles, p), 'tab.meetings')).map((p) => p.id);
      setCree(true);
      return update((d) => reglerComite(d, membres), 'Étiquette « Comité » créée, pour les points qui n’ont ni groupe ni événement');
    }
    const n = comite ? nbPoints(data, comite) : 0;
    if (!confirm(`Retirer l’étiquette « Comité » ?${n ? ` Elle est retirée de ${n} point(s) ; les points restent.` : ''}`)) return;
    update((d) => reglerComite(d, null), 'Étiquette « Comité » retirée');
  };
  return (
    <div className="groupe-section comite-reglage">
      <label className="inline">
        <input type="checkbox" checked={!!comite} disabled={!peut} aria-label="Comité : l’étiquette des autres points" onChange={(e) => cocher(e.target.checked)} /> <b>Comité</b>
      </label>
      <small className="muted">l’étiquette des points qui n’ont ni groupe ni événement</small>
      {comite && <EtiquetteReglee e={comite} peut={peut} deplie={cree} onMembres={(membres) => update((d) => reglerComite(d, membres), 'Étiquette « Comité » : membres modifiés')} />}
    </div>
  );
}
