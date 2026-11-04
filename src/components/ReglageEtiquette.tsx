import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icone } from './icones';
import { cleEtiquette, commentairesEtiquette, nonLus } from '../data/commentaires';
import { useStore } from '../data/store';
import type { ClubEvent, Etiquette, Section } from '../data/types';
import { fmtRange, fullName } from '../data/utils';
import { hasPermission, userRoles } from '../data/permissions';
import {
  aReprendre, etiquetteDeLaSection, etiquetteDeLEvenement, etiquetteDuComite, etiquettesAReprendre, lieuxDe, nomLieu, reglerComite,
  reglerEtiquetteEvenement, reglerGroupe, type ChoixEtiquette,
} from '../data/etiquettes';
import { BadgeEtiquette, ChoixIconeEtiquette } from './IconesEtiquette';

// Pièces communes du réglage des étiquettes : la case « Étiquette » d'un événement, la coche « Groupe » d'une section,
// leurs membres, leur couleur (etiquettes.ts).

/** Couleur d'une étiquette : enregistrée une fois choisie (pas à chaque mouvement dans la palette). */
export function CouleurEtiquette({ valeur, onChange, disabled, label }: { valeur: string; onChange: (c: string) => void; disabled?: boolean; label: string }) {
  const [c, setC] = useState(valeur);
  const minuterie = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setC(valeur), [valeur]);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const envoyer = (x: string) => {
    clearTimeout(minuterie.current);
    if (x !== valeur) onChange(x);
  };
  return (
    <input type="color" value={c} disabled={disabled} aria-label={label}
      onChange={(e) => {
        const x = e.target.value;
        setC(x);
        clearTimeout(minuterie.current);
        minuterie.current = setTimeout(() => envoyer(x), 700);
      }}
      onBlur={() => envoyer(c)} />
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

/** Points qui portent l'étiquette. */
const nbPoints = (data: { tasks: { etiquettes?: string[] }[] }, e: Etiquette) => data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Une étiquette réglée : sa pastille, sa couleur, ses membres et ses points ; dépliée, son icône et ses membres.
 * `onMembres` : enregistre les membres (selon la sorte : événement, groupe, comité).
 */
export function EtiquetteReglee({ e, peut, onMembres, detail, deplie }: { e: Etiquette; peut: boolean; onMembres: (m: string[]) => void; detail?: string; deplie?: boolean }) {
  const { data, user, update, discussionLueLe } = useStore();
  const navigate = useNavigate();
  // Juste créée : dépliée, pour choisir ses membres.
  const [ouvert, setOuvert] = useState(!!deplie);
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
        <CouleurEtiquette valeur={e.couleur} disabled={!peut} label={`Couleur de l’étiquette ${e.nom}`} onChange={(c) => changer({ couleur: c }, 'couleur')} />
        <BadgeEtiquette e={e} />
        {detail && <small className="muted">{detail}</small>}
        <button type="button" className="btn small" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
          {pluriel(m, 'membre')} · {pluriel(nbPoints(data, e), 'point')}
        </button>
        {membre && (
          <button type="button" className="btn small" title={`Discussion de « ${e.nom} » : ses membres`} aria-label={`Discussion de l’étiquette ${e.nom}`}
            onClick={() => navigate(`/messages?d=${encodeURIComponent(cleEtiquette(e.id))}`)}>
            <Icone n="message" /> Discussion{aLire > 0 && <span className="discussion-nb">{aLire}</span>}
          </button>
        )}
      </span>
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
function useCreation(nom: string, date: string | undefined, creer: (c: ChoixEtiquette) => void) {
  const { data } = useStore();
  const [choix, setChoix] = useState<ChoixEtiquette>(null);
  const [cree, setCree] = useState(false);
  const candidates = etiquettesAReprendre(data, nom, date);
  const faire = (c: ChoixEtiquette) => {
    setCree(true);
    creer(c);
  };
  const commencer = () => {
    if (!candidates.length) return faire({ membres: [] });
    const p = aReprendre(data, nom, date);
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

/** Choix « Nouvelle étiquette / Reprendre « … » », puis « Créer ». */
function ChoixReprise({ nom, c, bouton }: { nom: string; c: ReturnType<typeof useCreation>; bouton: string }) {
  if (!c.choix) return null;
  return (
    <span className="row wrap">
      <select value={c.choix.reprise ?? ''} aria-label={`Étiquette de ${nom}`} onChange={(e) => c.choisir(e.target.value)}>
        <option value="">Nouvelle étiquette</option>
        {c.candidates.map((e) => <option key={e.id} value={e.id}>Reprendre « {e.nom} »</option>)}
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
