import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Assemblee, ClubEvent, MajoriteAg, OptionsOdjAg, PointAg, PvArchive, StyleDocs } from '../data/types';
import {
  MAJORITES, agDuClub, agParDefaut, agPrecedente, ficheDe, fichierUtilise, lettre, modeleAg, nouveauVote, nouvelleFiche, optionsOdjAg,
  reprendrePoints, tacheDuPoint, texteConvocation, texteVotes, tousLesPoints, type AgAgenda,
} from '../data/assemblee';
import { fmtDate, fmtDateTime, fullName, today, uid } from '../data/utils';
import { cleanHtml } from '../data/sanitize';
import { archiveHtml, hydrateArchive, sansAnnexes } from '../data/entete';
import { nomAppli } from '../data/nomAppli';
import { convoquesDe } from '../data/seances';
import { lienMailto } from '../data/lienPartage';
import { deleteFiles } from '../data/files';
import { margesMm, styleVars } from '../data/styleDocs';
import { useClubOptional } from '../data/club';
import { DocEntete, LienEntete, useEntete, useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { MiseEnForme } from '../components/MiseEnForme';
import { BoutonPdf, usePiedImprime } from '../components/BoutonPdf';
import { AvecLiens, LieuSeance } from '../components/Liens';
import { DocsTache, ListeAnnexes, PagesAnnexes, annexesDe, useAnnexesArchive, useOuvrirDocs } from '../components/Annexes';
import { DocsField, type DocTracking } from '../components/DocsField';
import { EventModal, newEvent } from '../components/EventModal';
import { ZoneTexte } from '../components/ZoneTexte';
import { Modal } from '../components/ui';
import { Icone } from '../components/icones';
import { moduleIntrouvable } from '../pwa';
import { MeetingModal, PvViewer } from './Agenda';

// Onglet « Assemblée générale » › Ordre du jour (PLAN_ASSEMBLEE_GENERALE.md, étape AG1), visible des seuls rôles qui ont
// le droit « Assemblée générale » (console admin › Rôles et droits). Pour l'AG choisie (celles de l'agenda, assemblee.ts) :
// - « Points » : ses points à elle (ni statut, ni délai, ni responsable), dans l'ordre (glisser, ou ↑ ↓), chacun avec son
//   texte, ses sous-points (a., b.…), ses documents et ses votes prévus ; pour commencer, ceux de l'AG précédente (années
//   avancées d'un an) ou un modèle ;
// - « Convocation » : le document (en-tête et mise en forme communs aux documents du club), PDF, impression, texte modifié
//   à la main, archive dans l'AG, email au comité ou aux membres (copie cachée), texte copié.

/** « samedi 13 mars 2027 » (sans la virgule que certains navigateurs ajoutent après le jour). */
const longDate = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
};
const shortDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;

/** Point ouvert dans sa fiche : un point (parentId absent) ou un sous-point. */
interface Ouvert {
  point: PointAg;
  parentId?: string;
  nouveau: boolean;
}

/** Titre de la fiche : « Point 3 », « Sous-point de « Rapports » », « Nouveau point »… */
function titreFiche(o: Ouvert, points: PointAg[]) {
  if (o.parentId) {
    const parent = points.find((x) => x.id === o.parentId);
    return `${o.nouveau ? 'Nouveau sous-point' : 'Sous-point'} de « ${parent?.titre ?? '…'} »`;
  }
  const i = points.findIndex((x) => x.id === o.point.id);
  return o.nouveau ? 'Nouveau point' : `Point ${i + 1}`;
}

/** Document de la feuille sans ses boutons d'écran : pour l'archive et la version modifiée à la main. */
function htmlFeuille(el: HTMLElement, outer = false) {
  const c = el.cloneNode(true) as HTMLElement;
  return outer ? c.outerHTML : c.innerHTML;
}

export function OrdreDuJourAg() {
  const { data, user, can, update } = useStore();
  const ags = useMemo(() => agDuClub(data), [data]);
  // « ?ag=… » (lien « Ordre du jour de l'AG » de la carte de l'événement) : cette AG ; sinon la prochaine.
  const [params] = useSearchParams();
  const demandee = params.get('ag');
  const [cle, setCle] = useState(() => (demandee && ags.some((a) => a.cle === demandee) ? demandee : agParDefaut(ags)?.cle ?? ''));
  useEffect(() => {
    if (demandee && ags.some((a) => a.cle === demandee)) setCle(demandee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandee]);
  const ag = ags.find((a) => a.cle === cle) ?? agParDefaut(ags);
  const fiche = ficheDe(data, ag);
  const o = optionsOdjAg(fiche?.odjOptions);
  const points = useMemo(() => fiche?.points ?? [], [fiche]);
  const [vue, setVue] = useState<'points' | 'document'>(() => (ficheDe(data, ag)?.points.length ? 'document' : 'points'));
  const [ouvert, setOuvert] = useState<Ouvert | null>(null);
  const [msg, setMsg] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [archive, setArchive] = useState<PvArchive | null>(null);
  // AG de l'agenda : nouvelle (fiche d'un événement de type AG), ou la sienne à modifier (date, heure, lieu).
  const [nouvelleAg, setNouvelleAg] = useState<ClubEvent | null>(null);
  const [attendue, setAttendue] = useState<string | null>(null);
  const [modifAg, setModifAg] = useState(false);
  // Convocation modifiée à la main : en cours de modification (son HTML), ou enregistrée dans la fiche (`edite`).
  const [draft, setDraft] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const logo = useUnitLogo();

  // Nouvelle AG enregistrée : elle est choisie.
  useEffect(() => {
    if (!attendue) return;
    const a = ags.find((x) => x.event?.id === attendue);
    if (a) {
      setCle(a.cle);
      setVue('points');
      setAttendue(null);
    }
  }, [ags, attendue]);

  const choisir = (c: string) => {
    setCle(c);
    setMsg('');
    setDraft(null);
    setVue(ficheDe(data, ags.find((a) => a.cle === c))?.points.length ? 'document' : 'points');
  };

  /** Modifie la fiche de l'AG affichée (créée au premier changement). */
  const modifier = (fn: (f: Assemblee) => void, action: string) => {
    if (!ag || !user) return;
    update((d) => {
      if (!d.assemblees) d.assemblees = [];
      let f = ficheDe(d, ag);
      if (!f) {
        f = nouvelleFiche(ag, user.id);
        d.assemblees.push(f);
      }
      fn(f);
    }, action);
  };
  const setOptions = (patch: Partial<OptionsOdjAg>, action: string) => modifier((f) => (f.odjOptions = { ...f.odjOptions, ...patch }), action);

  const nomDoc = ag ? `${ag.nom} ${shortDate(ag.date)}` : 'Assemblée générale';
  useEffect(() => {
    const avant = document.title;
    document.title = `Convocation ${nomDoc}`;
    return () => {
      document.title = avant;
    };
  }, [nomDoc]);

  // ---------- Points ----------
  const enregistrerPoint = (p: PointAg, parentId: string | undefined, nouveau: boolean) =>
    modifier((f) => {
      if (!parentId) {
        f.points = nouveau ? [...f.points, p] : f.points.map((x) => (x.id === p.id ? p : x));
        return;
      }
      const parent = f.points.find((x) => x.id === parentId);
      if (parent) parent.sous = nouveau ? [...(parent.sous ?? []), p] : (parent.sous ?? []).map((x) => (x.id === p.id ? p : x));
    }, `AG « ${ag?.nom} » : point « ${p.titre} » ${nouveau ? 'ajouté' : 'modifié'}`);

  const supprimerPoint = (p: PointAg, parentId?: string) => {
    const n = p.sous?.length ?? 0;
    if (!confirm(`Supprimer le point « ${p.titre} »${n ? ` et ses ${n} sous-point${n > 1 ? 's' : ''}` : ''} de l’ordre du jour ?`)) return;
    // Ses fichiers (et ceux de ses sous-points) : effacés s'ils ne sont joints nulle part ailleurs.
    const supprimes = tousLesPoints([p]);
    const sauf = supprimes.map((x) => x.id);
    const libres = supprimes.flatMap((x) => (x.documents ?? []).filter((d) => d.kind === 'fichier' && !fichierUtilise(data, d.id, sauf)).map((d) => d.id));
    modifier((f) => {
      if (!parentId) f.points = f.points.filter((x) => x.id !== p.id);
      else {
        const parent = f.points.find((x) => x.id === parentId);
        if (parent) parent.sous = (parent.sous ?? []).filter((x) => x.id !== p.id);
      }
    }, `AG « ${ag?.nom} » : point « ${p.titre} » supprimé`);
    void deleteFiles(libres);
    setOuvert(null);
  };

  /** Déplace le point `de` à la place de `vers` (même niveau). */
  const deplacer = (parentId: string | undefined, de: number, vers: number) => {
    if (de === vers) return;
    modifier((f) => {
      const liste = parentId ? f.points.find((x) => x.id === parentId)?.sous : f.points;
      if (!liste || vers < 0 || vers >= liste.length) return;
      const [x] = liste.splice(de, 1);
      liste.splice(vers, 0, x);
    }, `AG « ${ag?.nom} » : ordre des points changé`);
  };

  // ---------- Pour commencer : l'AG précédente, ou le modèle ----------
  const precedente = ag ? agPrecedente(data, ag) : undefined;
  const reprendre = () => {
    if (!ag || !precedente) return;
    if (points.length && !confirm(`Remplacer les ${points.length} points de l’ordre du jour par ceux de « ${precedente.ag.nom} » ?`)) return;
    const repris = reprendrePoints(precedente.fiche.points, precedente.ag.date, ag.date);
    modifier((f) => {
      f.points = repris;
      if (!f.intro && precedente.fiche.intro) f.intro = precedente.fiche.intro;
      if (!f.fin && precedente.fiche.fin) f.fin = precedente.fiche.fin;
      if (!f.odjOptions && precedente.fiche.odjOptions) f.odjOptions = { ...precedente.fiche.odjOptions };
    }, `AG « ${ag.nom} » : ordre du jour repris de « ${precedente.ag.nom} »`);
    setMsg(`↩ ${repris.length} points repris de « ${precedente.ag.nom} » (sans les documents) ; les années ont avancé d’un an : relis-les.`);
  };
  const partirDuModele = () => {
    if (!ag) return;
    if (points.length && !confirm(`Remplacer les ${points.length} points de l’ordre du jour par le modèle ?`)) return;
    const modele = modeleAg(Number(ag.date.slice(0, 4)));
    modifier((f) => (f.points = modele), `AG « ${ag.nom} » : ordre du jour du modèle`);
    setMsg('📋 Modèle d’ordre du jour mis en place : adapte-le (un clic sur un point pour le modifier).');
  };

  // ---------- Textes d'introduction et de fin ----------
  const setTexte = (k: 'intro' | 'fin', v: string) =>
    (fiche?.[k] ?? '') !== v &&
    modifier((f) => {
      if (v) f[k] = v;
      else delete f[k];
    }, `AG « ${ag?.nom} » : texte ${k === 'intro' ? 'd’introduction' : 'de fin'} de la convocation`);

  // ---------- Convocation modifiée à la main ----------
  const edite = fiche?.odjEdite;
  const htmlEdite = edite ? cleanHtml(hydrateArchive(edite.html, data, logo)) : '';
  useAnnexesArchive(sheetRef, draft ?? htmlEdite, draft !== null || !!edite);
  usePiedImprime(sheetRef);
  useOuvrirDocs();
  const startEdit = () => {
    setVue('document');
    setTimeout(() => sheetRef.current && setDraft(sansAnnexes(htmlFeuille(sheetRef.current))));
  };
  const saveEdit = () => {
    if (!sheetRef.current || !user) return;
    const html = cleanHtml(archiveHtml(sheetRef.current.innerHTML));
    modifier((f) => (f.odjEdite = { html, le: new Date().toISOString(), par: user.id }), `Convocation « ${nomDoc} » modifiée à la main`);
    setDraft(null);
    setMsg('✏️ Modifications enregistrées : c’est cette version qui est imprimée, archivée et envoyée.');
  };
  const resetEdit = () => {
    if (!confirm('Revenir à la convocation générée ? Les modifications faites à la main seront perdues.')) return;
    modifier((f) => delete f.odjEdite, `Convocation « ${nomDoc} » : retour à la version générée`);
    setMsg('');
  };

  // ---------- Actions ----------
  const imprimer = () => {
    if (vue === 'document') return window.print();
    setVue('document');
    setTimeout(() => window.print(), 100);
  };
  const archiver = () => {
    if (!sheetRef.current || !user || !ag) return;
    const html = archiveHtml(htmlFeuille(sheetRef.current, true));
    modifier((f) => {
      f.odjArchives = [{ id: uid('pv'), at: new Date().toISOString(), by: user.id, titre: nomDoc, html, orientation: o.orientation }, ...(f.odjArchives ?? [])].slice(0, 10);
    }, `Convocation « ${nomDoc} » archivée dans l’AG`);
    setMsg('📁 Convocation archivée dans l’AG (« Archives », dans les réglages).');
  };
  const texteEdite = () => (sheetRef.current?.innerText ?? '').replace(/\n{3,}/g, '\n\n').trim();
  const docTexte = () => ((edite || draft !== null) && sheetRef.current ? texteEdite() : ag ? texteConvocation(ag, fiche, o, longDate) : '');
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(docTexte());
      setMsg('📋 Texte copié : colle-le dans un email, WhatsApp ou Word.');
    } catch {
      setMsg('Copie impossible dans ce navigateur.');
    }
  };

  const style = data.reglagesOdj?.style;
  const docStyle = styleVars(style);
  const archives = fiche?.odjArchives ?? [];
  const bloque = draft !== null;

  if (!ag)
    return (
      <div className="pv-page ag-page">
        <div className="page-head"><h1>Ordre du jour de l’AG</h1></div>
        <PageIntro />
        <div className="panel ag-vide">
          <p><b>Aucune assemblée générale dans l’agenda.</b></p>
          <p className="muted">Une AG est un événement de l’agenda de type « Assemblée générale » : son ordre du jour se prépare ici.</p>
          {can('events.manage') ? (
            <button className="btn primary" onClick={() => setNouvelleAg({ ...newEvent(), ag: true })}><Icone n="ajouterSeance" /> Nouvelle AG</button>
          ) : (
            <p className="muted">Demande à une personne qui gère les événements de la créer (Agenda › Événements, type « Assemblée générale »).</p>
          )}
        </div>
        {nouvelleAg && <EventModal event={nouvelleAg} onClose={() => { setAttendue(nouvelleAg.id); setNouvelleAg(null); }} />}
      </div>
    );

  const aVenir = ags.filter((a) => a.date >= today() || a.cle === ag.cle);
  const passees = ags.filter((a) => a.date < today() && a.cle !== ag.cle).reverse();
  const peutModifierAg = ag.meeting ? can('meetings.manage') : can('events.manage');
  const feuille = (
    <FeuilleAg ag={ag} fiche={fiche} o={o} style={style} feuilleRef={sheetRef} onOuvrir={(p, parentId) => setOuvert({ point: p, parentId, nouveau: false })} />
  );

  return (
    <div className="pv-page ag-page">
      <style>{`@page { size: A4 ${o.orientation === 'paysage' ? 'landscape' : 'portrait'}; margin: ${margesMm(style)}mm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; } }`}</style>
      <div className="page-head no-print">
        <h1>Ordre du jour de l’AG</h1>
        <div className="actions">
          <BoutonPdf className="btn primary toujours" feuille={sheetRef} titre={`Convocation ${nomDoc}`} paysage={o.orientation === 'paysage'} margesMm={margesMm(style)} police={style?.police} disabled={bloque} />
          <button className="btn" onClick={imprimer} disabled={bloque}><Icone n="imprimer" /> Imprimer</button>
          {!bloque && <button className="btn" onClick={startEdit}><Icone n="modifier" /> Modifier le texte</button>}
          <button className="btn" onClick={archiver} disabled={bloque}><Icone n="archiver" /> Archiver dans l’AG</button>
          <button className="btn" onClick={() => setEnvoi(true)} disabled={bloque}><Icone n="email" /> Envoyer par email</button>
          <button className="btn" onClick={copier}><Icone n="copier" /> Copier le texte</button>
        </div>
      </div>
      <PageIntro />
      {msg && <p className="pv-msg no-print">{msg}</p>}

      <div className="pv-layout">
        <aside className="pv-settings no-print">
          <details open>
            <summary>Assemblée</summary>
            <label>
              Assemblée générale
              <select value={ag.cle} onChange={(e) => choisir(e.target.value)} aria-label="Assemblée générale à préparer">
                <optgroup label="À venir">
                  {aVenir.map((a) => <option key={a.cle} value={a.cle}>{a.nom} – {fmtDate(a.date)}{a.date < today() ? ' (passée)' : ''}</option>)}
                </optgroup>
                {passees.length > 0 && (
                  <optgroup label="Passées">
                    {passees.map((a) => <option key={a.cle} value={a.cle}>{a.nom} – {fmtDate(a.date)}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <p className="muted small">
              {longDate(ag.date)}{ag.heure && `, ${ag.heure.replace(':', 'h')}`}{ag.lieu && ` · ${ag.lieu}`}
            </p>
            <div className="row wrap">
              {peutModifierAg && <button type="button" className="btn small" onClick={() => setModifAg(true)}><Icone n="modifier" /> Date, heure, lieu</button>}
              {can('events.manage') && <button type="button" className="btn small" onClick={() => setNouvelleAg({ ...newEvent(), ag: true })}><Icone n="ajouterSeance" /> Nouvelle AG</button>}
            </div>
            {points.length > 0 && (
              <div className="ag-repartir">
                {precedente && <button type="button" className="btn small link" onClick={reprendre} disabled={bloque}><Icone n="revenir" /> Repartir de « {precedente.ag.nom} »</button>}
                <button type="button" className="btn small link" onClick={partirDuModele} disabled={bloque}><Icone n="anciennes" /> Repartir du modèle</button>
              </div>
            )}
          </details>
          <details>
            <summary>Textes de la convocation</summary>
            <label>
              Avant les points
              <ZoneTexte key={`i-${ag.cle}`} defaultValue={fiche?.intro ?? ''} placeholder="Le comité a le plaisir de vous convier à l’assemblée générale…" onBlur={(e) => setTexte('intro', e.target.value.trim())} rows={3} />
            </label>
            <label>
              Après les points
              <ZoneTexte key={`f-${ag.cle}`} defaultValue={fiche?.fin ?? ''} placeholder="Les propositions des membres sont à envoyer au comité jusqu’au … Le comité" onBlur={(e) => setTexte('fin', e.target.value.trim())} rows={3} />
            </label>
          </details>
          <details>
            <summary>Contenu</summary>
            {([
              ['textes', 'Textes des points'],
              ['votes', '« (vote) » à côté des points votés'],
              ['documents', 'Noms des documents des points'],
              ['annexes', '📎 Joindre les fichiers des points en fin de convocation'],
            ] as ['textes' | 'votes' | 'documents' | 'annexes', string][]).map(([k, label]) => (
              <label key={k} className="inline">
                <input type="checkbox" checked={o[k]} onChange={(e) => setOptions({ [k]: e.target.checked }, `Convocation « ${nomDoc} » : ${label} (${e.target.checked ? 'oui' : 'non'})`)} /> {label}
              </label>
            ))}
            <small className="muted">Choix commun à tous ceux qui préparent l’AG.</small>
          </details>
          <details>
            <summary>Mise en page</summary>
            <label className="inline"><input type="checkbox" checked={o.entete} onChange={(e) => setOptions({ entete: e.target.checked }, `Convocation « ${nomDoc} » : en-tête ${e.target.checked ? 'affiché' : 'masqué'}`)} /> Afficher l’en-tête (logo, nom du club…)</label>
            <LienEntete />
            <label>
              Orientation
              <select value={o.orientation} onChange={(e) => setOptions({ orientation: e.target.value as OptionsOdjAg['orientation'] }, `Convocation « ${nomDoc} » : orientation`)}>
                <option value="portrait">Portrait</option>
                <option value="paysage">Paysage</option>
              </select>
            </label>
            <label>
              Taille du texte
              <select value={o.taille} onChange={(e) => setOptions({ taille: e.target.value as OptionsOdjAg['taille'] }, `Convocation « ${nomDoc} » : taille du texte`)}>
                <option value="petite">Petite</option>
                <option value="normale">Normale</option>
                <option value="grande">Grande</option>
              </select>
            </label>
            {can('tab.pv') ? (
              <>
                <p className="field-label pv-sous-titre">Mise en forme</p>
                <MiseEnForme />
              </>
            ) : (
              <small className="muted">La mise en forme (police, couleurs…) est celle des documents du comité.</small>
            )}
          </details>
          <details>
            <summary>Archives{archives.length > 0 && ` (${archives.length})`}</summary>
            {archives.length ? (
              <ul className="ag-archives">
                {archives.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="btn small link" onClick={() => setArchive(a)}><Icone n="odj" /> Convocation · {fmtDateTime(a.at)}</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Aucune convocation archivée : « Archiver dans l’AG » garde une copie figée du document.</p>
            )}
          </details>
        </aside>

        <div className="pv-preview ag-preview">
          <div className="seg no-print ag-vues" role="tablist" aria-label="Vue">
            <button type="button" role="tab" aria-selected={vue === 'points'} className={vue === 'points' ? 'on' : ''} onClick={() => setVue('points')} disabled={bloque}>
              <Icone n="checklist" /> Points ({points.length})
            </button>
            <button type="button" role="tab" aria-selected={vue === 'document'} className={vue === 'document' ? 'on' : ''} onClick={() => setVue('document')}>
              <Icone n="odj" /> Convocation
            </button>
          </div>

          {vue === 'points' ? (
            <>
              <ListePoints
                points={points}
                onOuvrir={(p, parentId) => setOuvert({ point: p, parentId, nouveau: false })}
                onNouveau={(parentId) => setOuvert({ point: { id: uid('pa'), titre: '' }, parentId, nouveau: true })}
                onDeplacer={deplacer}
                onSupprimer={supprimerPoint}
                debut={
                  <div className="panel ag-debut">
                    <p><b>Aucun point pour l’instant.</b> Pour commencer :</p>
                    <div className="row wrap">
                      {precedente && (
                        <button type="button" className="btn primary" onClick={reprendre}>
                          <Icone n="revenir" /> Reprendre « {precedente.ag.nom} » ({precedente.fiche.points.length} points)
                        </button>
                      )}
                      <button type="button" className={`btn ${precedente ? '' : 'primary'}`} onClick={partirDuModele}><Icone n="anciennes" /> Partir du modèle</button>
                      <button type="button" className="btn" onClick={() => setOuvert({ point: { id: uid('pa'), titre: '' }, nouveau: true })}><Icone n="nouveau" /> Premier point</button>
                    </div>
                    <p className="muted small">
                      {precedente
                        ? 'Les points de l’AG précédente sont repris avec leurs textes, sous-points et votes, sans les documents ; les années avancent d’un an (« Comptes 2026 » → « Comptes 2027 »).'
                        : 'Le modèle : l’ordre du jour habituel des AG du club (d’après les PV 2024 à 2026 : ouverture, scrutateurs, PV, rapports du président et des responsables, comptes, vérificateurs, comité, élections, budget, admissions et démissions, divers), avec ses votes ; à adapter.'}
                    </p>
                  </div>
                }
              />
              {/* La convocation reste prête (PDF, archive, email) pendant qu'on règle les points. */}
              <div className="odj-cache" hidden aria-hidden="true">{edite ? <div ref={sheetRef} className={`pv-sheet ${o.orientation} t-${o.taille}`} style={docStyle} dangerouslySetInnerHTML={{ __html: htmlEdite }} /> : feuille}</div>
            </>
          ) : (
            <>
              {draft !== null ? (
                <div className="odj-edit-bar no-print">
                  <span>✏️ Modifie directement la convocation : corriger, ajouter ou supprimer des lignes.</span>
                  <span className="grow" />
                  <button className="btn" onClick={() => setDraft(null)}>Annuler</button>
                  <button className="btn primary" onClick={saveEdit}>Enregistrer</button>
                </div>
              ) : (
                edite && (
                  <div className="odj-edit-bar no-print">
                    <span>✏️ Version modifiée à la main le {fmtDateTime(edite.le)}{data.people.find((p) => p.id === edite.par) ? ` par ${fullName(data.people.find((p) => p.id === edite.par))}` : ''}. Les changements des points n’y apparaissent plus.</span>
                    <span className="grow" />
                    <button className="btn" onClick={resetEdit}><Icone n="revenir" /> Revenir à la version générée</button>
                  </div>
                )
              )}
              <div className={draft === null && !edite ? 'odj-live' : ''}>
                {draft !== null ? (
                  <div ref={sheetRef} className={`pv-sheet ${o.orientation} t-${o.taille} editing`} style={docStyle} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: draft }} />
                ) : edite ? (
                  <div ref={sheetRef} className={`pv-sheet ${o.orientation} t-${o.taille}`} style={docStyle} dangerouslySetInnerHTML={{ __html: htmlEdite }} />
                ) : (
                  feuille
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {ouvert && (
        <FichePointAg
          ouvert={ouvert}
          titre={titreFiche(ouvert, points)}
          onClose={() => setOuvert(null)}
          onEnregistrer={(p) => {
            enregistrerPoint(p, ouvert.parentId, ouvert.nouveau);
            setOuvert(null);
          }}
          onSupprimer={ouvert.nouveau ? undefined : () => supprimerPoint(ouvert.point, ouvert.parentId)}
        />
      )}
      {envoi && <EnvoiAg ag={ag} feuille={sheetRef} nomDoc={nomDoc} texte={docTexte()} paysage={o.orientation === 'paysage'} style={style} onClose={() => setEnvoi(false)} />}
      {archive && (
        <PvViewer
          pv={archive}
          kind="odj"
          canDelete
          onDelete={() => {
            modifier((f) => (f.odjArchives = (f.odjArchives ?? []).filter((x) => x.id !== archive.id)), `Convocation archivée « ${archive.titre} » supprimée`);
            setArchive(null);
          }}
          onClose={() => setArchive(null)}
        />
      )}
      {nouvelleAg && <EventModal event={nouvelleAg} onClose={() => { setAttendue(nouvelleAg.id); setNouvelleAg(null); }} />}
      {modifAg && ag.event && <EventModal event={ag.event} jour={ag.event.repetition ? ag.date : undefined} onClose={() => setModifAg(false)} />}
      {modifAg && ag.meeting && <MeetingModal meeting={ag.meeting} onClose={() => setModifAg(false)} />}
    </div>
  );
}

/** La convocation de l'AG : en-tête, date, heure, lieu, textes, points numérotés (1., a.), annexes. */
function FeuilleAg({ ag, fiche, o, style, feuilleRef, onOuvrir }: {
  ag: AgAgenda;
  fiche?: Assemblee;
  o: Required<OptionsOdjAg>;
  style?: StyleDocs;
  feuilleRef: RefObject<HTMLDivElement>;
  /** Clic sur un point (convocation affichée) : sa fiche. */
  onOuvrir?: (p: PointAg, parentId?: string) => void;
}) {
  const { user } = useStore();
  const logo = useUnitLogo();
  const entete = useEntete();
  const points = fiche?.points ?? [];
  const annexes = o.annexes ? annexesDe(tousLesPoints(points).map(tacheDuPoint)) : [];
  const titre = (p: PointAg, parentId?: string) => (
    <span className="odj-task" onClick={onOuvrir && (() => onOuvrir(p, parentId))}>{p.titre}</span>
  );
  const votes = (p: PointAg) => (o.votes && p.votes?.length ? <span className="odj-meta"> {texteVotes(p)}</span> : null);
  const texte = (p: PointAg) => (o.textes && p.texte?.trim() ? <div className="odj-rem ag-texte-point"><AvecLiens texte={p.texte.trim()} /></div> : null);
  const docs = (p: PointAg) =>
    (o.documents || o.annexes) && p.documents?.length ? (
      <div className="ag-docs-point">
        {o.documents ? <DocsTache t={tacheDuPoint(p)} annexes={annexes} /> : <span className="odj-meta">📎 annexe {annexes.filter((a) => a.t.id === p.id).map((a) => a.n).join(', ')}</span>}
      </div>
    ) : null;
  return (
    <div ref={feuilleRef} className={`pv-sheet ${o.orientation} t-${o.taille}`} style={styleVars(style)}>
      <header className="pv-head">
        {o.entete && <DocEntete e={entete} logo={logo} />}
        <p className="pv-kicker">Convocation</p>
        <h1>{ag.nom}</h1>
        <p className="pv-meta">{longDate(ag.date)}</p>
      </header>
      <section className="odj-head">
        {ag.heure && <p><b>Heure :</b> {ag.heure.replace(':', 'h')}</p>}
        <p><b>Lieu :</b> {ag.meeting ? <LieuSeance m={ag.meeting} /> : ag.lieu ? <AvecLiens texte={ag.lieu} /> : 'à définir'}</p>
      </section>
      {fiche?.intro?.trim() && <p className="ag-texte"><AvecLiens texte={fiche.intro.trim()} /></p>}
      <section className="pv-part">
        <h2>Ordre du jour</h2>
        {points.length === 0 ? (
          <p className="pv-empty">Aucun point pour l’instant.</p>
        ) : (
          <ol className="odj ag-odj">
            {points.map((p) => (
              <li key={p.id}>
                <span className="odj-sec">{titre(p)}{votes(p)}</span>
                {texte(p)}
                {docs(p)}
                {(p.sous?.length ?? 0) > 0 && (
                  <ol className="odj-l1">
                    {p.sous!.map((s) => (
                      <li key={s.id}>
                        {titre(s, p.id)}{votes(s)}
                        {texte(s)}
                        {docs(s)}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      {fiche?.fin?.trim() && <p className="ag-texte"><AvecLiens texte={fiche.fin.trim()} /></p>}
      <ListeAnnexes annexes={annexes} />
      <footer className="pv-foot">Document généré le {fmtDate(today())} par {fullName(user ?? undefined)} · {nomAppli()}</footer>
      <PagesAnnexes annexes={annexes} miseEnPage={{ photos: 1, pdf: 1 }} />
    </div>
  );
}

/**
 * Les points de l'AG, à régler : un clic ouvre la fiche d'un point ; on les déplace en les faisant glisser (souris) ou
 * avec ↑ ↓ ; un sous-point reste dans son point.
 */
function ListePoints({ points, onOuvrir, onNouveau, onDeplacer, onSupprimer, debut }: {
  points: PointAg[];
  onOuvrir: (p: PointAg, parentId?: string) => void;
  onNouveau: (parentId?: string) => void;
  onDeplacer: (parentId: string | undefined, de: number, vers: number) => void;
  onSupprimer: (p: PointAg, parentId?: string) => void;
  debut: ReactNode;
}) {
  // Point que l'on fait glisser (son niveau et sa place) et la place visée.
  const [glisse, setGlisse] = useState<{ parentId?: string; i: number } | null>(null);
  const [cible, setCible] = useState<{ parentId?: string; i: number } | null>(null);
  if (!points.length) return <>{debut}</>;

  const ligne = (p: PointAg, i: number, n: number, numero: string, parentId?: string) => {
    // Glisser-déposer : seulement au même niveau (un sous-point reste dans son point).
    const meme = !!glisse && glisse.parentId === parentId;
    const vise = meme && !!cible && cible.parentId === parentId && cible.i === i && glisse!.i !== i;
    const surDrop = (e: DragEvent) => {
      if (!meme) return;
      e.preventDefault();
      setCible({ parentId, i });
    };
    const resume = [
      p.texte?.trim() && 'texte',
      (p.sous?.length ?? 0) > 0 && `${p.sous!.length} sous-point${p.sous!.length > 1 ? 's' : ''}`,
      (p.documents?.length ?? 0) > 0 && `📎 ${p.documents!.length}`,
    ].filter(Boolean);
    return (
      <div
        className={`ag-point ${parentId ? 'sous' : ''} ${vise ? (glisse!.i < i ? 'cible-apres' : 'cible-avant') : ''} ${meme && glisse!.i === i ? 'glisse' : ''}`}
        onDragOver={surDrop}
        onDrop={(e) => {
          if (!glisse || glisse.parentId !== parentId) return;
          e.preventDefault();
          onDeplacer(parentId, glisse.i, i);
          setGlisse(null);
          setCible(null);
        }}
      >
        <span
          className="ag-poignee"
          draggable
          title="Faire glisser pour changer l’ordre"
          aria-hidden
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', p.id);
            setGlisse({ parentId, i });
          }}
          onDragEnd={() => {
            setGlisse(null);
            setCible(null);
          }}
        >
          <Icone n="poignee" />
        </span>
        <span className="ag-numero">{numero}</span>
        <button type="button" className="ag-titre" onClick={() => onOuvrir(p, parentId)}>
          <span>{p.titre || <i className="muted">Sans intitulé</i>}</span>
          {(p.votes?.length ?? 0) > 0 && <span className="ag-vote" title={p.votes!.map((v) => v.objet).join(' ; ')}><Icone n="vote" /> {p.votes!.length > 1 ? `${p.votes!.length} votes` : 'vote'}</span>}
          {resume.length > 0 && <small className="muted">{resume.join(' · ')}</small>}
        </button>
        <span className="ag-actions">
          {!parentId && (
            <button type="button" className="icon-btn" onClick={() => onNouveau(p.id)} aria-label={`Ajouter un sous-point à « ${p.titre} »`} title="Ajouter un sous-point (a., b.…)"><Icone n="ajoutTache" /></button>
          )}
          <button type="button" className="icon-btn" disabled={i === 0} onClick={() => onDeplacer(parentId, i, i - 1)} aria-label={`Monter « ${p.titre} »`} title="Monter"><Icone n="monter" /></button>
          <button type="button" className="icon-btn" disabled={i === n - 1} onClick={() => onDeplacer(parentId, i, i + 1)} aria-label={`Descendre « ${p.titre} »`} title="Descendre"><Icone n="descendre" /></button>
          <button type="button" className="icon-btn" onClick={() => onSupprimer(p, parentId)} aria-label={`Supprimer « ${p.titre} »`} title="Supprimer"><Icone n="supprimer" /></button>
        </span>
      </div>
    );
  };

  return (
    <div className="ag-points no-print">
      <ol className="ag-liste">
        {points.map((p, i) => (
          <li key={p.id}>
            {ligne(p, i, points.length, `${i + 1}.`)}
            {(p.sous?.length ?? 0) > 0 && (
              <ol className="ag-liste sous">
                {p.sous!.map((s, j) => <li key={s.id}>{ligne(s, j, p.sous!.length, `${lettre(j)}.`, p.id)}</li>)}
              </ol>
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="btn primary" onClick={() => onNouveau()}><Icone n="nouveau" /> Ajouter un point</button>
      <p className="muted small">Un clic sur un point ouvre sa fiche (intitulé, texte, votes, documents) ; <Icone n="ajoutTache" /> lui ajoute un sous-point (a., b.…). Pour changer l’ordre : fais glisser la poignée ⠿, ou ↑ ↓.</p>
    </div>
  );
}

/** Fiche d'un point de l'AG (ou d'un sous-point) : intitulé, texte, votes prévus, documents. */
function FichePointAg({ ouvert, titre: titreModal, onClose, onEnregistrer, onSupprimer }: {
  ouvert: Ouvert;
  titre: string;
  onClose: () => void;
  onEnregistrer: (p: PointAg) => void;
  onSupprimer?: () => void;
}) {
  const { data } = useStore();
  const [p, setP] = useState<PointAg>(() => structuredClone(ouvert.point));
  const [err, setErr] = useState('');
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const set = (patch: Partial<PointAg>) => setP((x) => ({ ...x, ...patch }));
  const votes = p.votes ?? [];
  const setVote = (id: string, patch: Partial<{ objet: string; majorite: MajoriteAg }>) => set({ votes: votes.map((v) => (v.id === id ? { ...v, ...patch } : v)) });

  const fermer = () => {
    // Fichiers ajoutés puis abandonnés : effacés.
    void deleteFiles(track.current.added);
    onClose();
  };
  const enregistrer = () => {
    const titre = p.titre.trim();
    if (!titre) return setErr('L’intitulé est obligatoire.');
    if (votes.some((v) => !v.objet.trim())) return setErr('Chaque vote a besoin de sa question (ou retire-le).');
    // Fichiers retirés : effacés s'ils ne sont joints nulle part ailleurs.
    void deleteFiles(track.current.removed.filter((id) => !fichierUtilise(data, id, [p.id])));
    const texte = p.texte?.trim();
    onEnregistrer({
      ...p,
      titre,
      texte: texte || undefined,
      votes: votes.length ? votes.map((v) => ({ ...v, objet: v.objet.trim() })) : undefined,
      documents: p.documents?.length ? p.documents : undefined,
    });
  };

  return (
    <Modal title={titreModal} icone="assemblee" onClose={fermer} wide>
      <div className="form ag-fiche">
        <label className="full">
          Intitulé
          <input autoFocus={ouvert.nouveau} value={p.titre} maxLength={200} onChange={(e) => set({ titre: e.target.value })} placeholder="Approbation des comptes 2026" />
        </label>
        <label className="full">
          Texte (facultatif, imprimé sous l’intitulé)
          <ZoneTexte value={p.texte ?? ''} onChange={(e) => set({ texte: e.target.value })} rows={3} placeholder="Le comité propose une cotisation de 80 fr." />
        </label>

        <fieldset className="full ag-votes">
          <legend><Icone n="vote" /> Votes</legend>
          {votes.length === 0 && <p className="muted small">Pas de vote sur ce point. Un vote : pour, contre, abstention, noté en séance.</p>}
          {votes.map((v, i) => (
            <div key={v.id} className="ag-vote-ligne">
              <label>
                {votes.length > 1 ? `Vote ${i + 1}` : 'Question'}
                <input value={v.objet} maxLength={200} onChange={(e) => setVote(v.id, { objet: e.target.value })} aria-label={`Question du vote ${i + 1}`} />
              </label>
              <label>
                Majorité
                <select value={v.majorite} onChange={(e) => setVote(v.id, { majorite: e.target.value as MajoriteAg })} aria-label={`Majorité du vote ${i + 1}`}>
                  {MAJORITES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <button type="button" className="icon-btn" onClick={() => set({ votes: votes.filter((x) => x.id !== v.id) })} aria-label={`Retirer le vote ${i + 1}`} title="Retirer ce vote"><Icone n="supprimer" /></button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => set({ votes: [...votes, nouveauVote(votes.length ? '' : p.titre.trim())] })}>
            <Icone n="vote" /> {votes.length ? 'Autre vote' : 'Soumettre au vote'}
          </button>
          {votes.length > 0 && <small className="muted">Une élection : un vote par personne à élire (« Élection de … au comité »).</small>}
        </fieldset>

        <div className="full">
          <DocsField docs={p.documents ?? []} setDocs={(fn) => setP((x) => ({ ...x, documents: fn(x.documents ?? []) }))} disabled={false} track={track.current} />
        </div>
        {!ouvert.parentId && (p.sous?.length ?? 0) > 0 && (
          <p className="muted small full">Sous-points : {p.sous!.map((s, i) => `${lettre(i)}. ${s.titre}`).join(' ; ')} (chacun s’ouvre depuis la liste des points).</p>
        )}
        {err && <p className="error full">{err}</p>}
      </div>
      <div className="modal-foot">
        {onSupprimer && <button type="button" className="btn danger" onClick={onSupprimer}><Icone n="supprimer" /> Supprimer</button>}
        <span className="grow" />
        <button type="button" className="btn" onClick={fermer}>Annuler</button>
        <button type="button" className="btn primary" onClick={enregistrer}>Enregistrer</button>
      </div>
    </Modal>
  );
}

/**
 * « Envoyer par email » la convocation : au comité, ou aux membres du club (en copie cachée, pour que personne ne voie les
 * adresses des autres). Le PDF est préparé tout de suite : partagé avec le mail (téléphone), ou téléchargé, à joindre.
 */
function EnvoiAg({ ag, feuille, nomDoc, texte, paysage, style, onClose }: {
  ag: AgAgenda;
  feuille: RefObject<HTMLDivElement>;
  nomDoc: string;
  texte: string;
  paysage: boolean;
  style?: StyleDocs;
  onClose: () => void;
}) {
  const { data, user, setToast } = useStore();
  const club = useClubOptional();
  const voitAdresses = !club || club.personnes.coordonnees;
  const [qui, setQui] = useState<'membres' | 'comite'>(club && voitAdresses ? 'membres' : 'comite');
  const [membres, setMembres] = useState<{ nom: string; email: string }[] | null>(null);
  useEffect(() => {
    if (!club || !voitAdresses) return setMembres([]);
    let actif = true;
    club
      .membres()
      .then((l) => actif && setMembres(l.map((m) => ({ nom: `${m.prenom} ${m.nom}`.trim(), email: m.email.trim() }))))
      .catch(() => actif && setMembres([]));
    return () => {
      actif = false;
    };
  }, [club, voitAdresses]);
  const comite = convoquesDe(data).map((p) => ({ nom: fullName(p), email: p.email.trim() }));
  const liste = qui === 'comite' ? comite : membres ?? [];
  const adresses = [...new Set(liste.map((x) => x.email.toLowerCase()).filter(Boolean))];
  const sansAdresse = liste.filter((x) => !x.email).length;

  const titrePdf = `Convocation ${nomDoc}`;
  const [pdf, setPdf] = useState<{ fichier?: File; erreur?: string } | null>(null);
  const telecharger = useRef<(b: Blob, titre: string) => void>();
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const el = feuille.current;
        if (!el) throw new Error('document introuvable');
        const mod = await import('../data/pdfDoc');
        telecharger.current = mod.telechargerPdf;
        const blob = await mod.creerPdf(el, { titre: titrePdf, paysage, margesMm: margesMm(style), police: style?.police, auteur: user ? fullName(user) : undefined, createur: nomAppli() });
        if (actif) setPdf({ fichier: new File([blob], mod.nomFichierPdf(titrePdf), { type: 'application/pdf' }) });
      } catch (e) {
        console.error(e);
        if (actif) setPdf({ erreur: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fichier = pdf?.fichier;
  const partageable = !!fichier && !!navigator.canShare?.({ files: [fichier] });
  const sujet = `${ag.nom} – convocation`;

  const ouvrirMessagerie = () => {
    if (fichier) telecharger.current?.(fichier, titrePdf);
    let body = texte;
    if (body.length > 1800) body = body.slice(0, 1800) + (fichier ? '\n…\n(suite dans le PDF joint)' : '\n…');
    const a = adresses.join(',');
    // Membres : en copie cachée (« Cci »), le mail part sans destinataire visible.
    const lien = qui === 'membres' ? lienMailto('', sujet, body).replace('mailto:?', `mailto:?bcc=${encodeURIComponent(a)}&`) : lienMailto(a, sujet, body);
    if (fichier) setTimeout(() => (window.location.href = lien), 500);
    else window.location.href = lien;
    if (fichier) setToast(`PDF « ${fichier.name} » téléchargé : joins-le au mail (trombone ou glisser-déposer).`);
  };
  const partager = async () => {
    if (!fichier) return;
    try {
      await navigator.share({ files: [fichier], title: sujet, text: texte });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setToast('Partage impossible : utilise « Ouvrir dans ma messagerie ».');
    }
  };
  const copierAdresses = async () => {
    try {
      await navigator.clipboard.writeText(adresses.join(', '));
      setToast(`${adresses.length} adresse${adresses.length > 1 ? 's' : ''} copiée${adresses.length > 1 ? 's' : ''} : colle-les dans « ${qui === 'membres' ? 'Cci' : 'À'} ».`);
    } catch {
      setToast('Copie impossible dans ce navigateur.');
    }
  };

  return (
    <Modal title="Envoyer la convocation par email" icone="email" onClose={onClose}>
      <div className="envoi-odj">
        <div className="seg" role="radiogroup" aria-label="Destinataires">
          <button type="button" role="radio" aria-checked={qui === 'membres'} className={qui === 'membres' ? 'on' : ''} onClick={() => setQui('membres')} disabled={!club || !voitAdresses}>
            <Icone n="membres" /> Membres du club
          </button>
          <button type="button" role="radio" aria-checked={qui === 'comite'} className={qui === 'comite' ? 'on' : ''} onClick={() => setQui('comite')}>
            <Icone n="seances" /> Comité
          </button>
        </div>
        {qui === 'membres' && !voitAdresses && <p className="muted small">Les adresses des membres ne sont visibles qu’avec le droit « Coordonnées des personnes du club ».</p>}
        <p>
          <b>{qui === 'membres' ? 'Cci (copie cachée) :' : 'À :'}</b>{' '}
          {qui === 'membres' && membres === null ? 'chargement des adresses…' : adresses.length ? `${adresses.length} adresse${adresses.length > 1 ? 's' : ''}` : 'aucune adresse connue'}
          {adresses.length > 0 && <button type="button" className="btn small link" onClick={copierAdresses}><Icone n="copier" /> Copier les adresses</button>}
        </p>
        {sansAdresse > 0 && <p className="muted small">{sansAdresse} personne{sansAdresse > 1 ? 's' : ''} sans adresse email (ou qui la masque) : à convoquer autrement.</p>}
        <p><b>Objet :</b> {sujet}</p>
        <p className="small envoi-etat" aria-live="polite">
          {fichier ? (
            <span><Icone n="pdf" /> {fichier.name} ({Math.max(1, Math.round(fichier.size / 1024))} Ko)</span>
          ) : pdf?.erreur ? (
            moduleIntrouvable(pdf.erreur) ? (
              <span className="error">Nouvelle version de l’appli publiée depuis son ouverture : recharge la page pour joindre le PDF.</span>
            ) : (
              <span className="error">Le PDF n’a pas pu être créé ({pdf.erreur.slice(0, 120)}) : le mail partira sans lui.</span>
            )
          ) : (
            <span><Icone n="attente" /> Préparation du PDF…</span>
          )}
        </p>
        <details className="envoi-apercu">
          <summary>Aperçu du texte</summary>
          <pre>{texte}</pre>
        </details>
        <div className="modal-foot wrap">
          <button className="btn" onClick={onClose}>Fermer</button>
          {partageable && <button className="btn" onClick={partager}><Icone n="partager" /> Partager avec le PDF joint</button>}
          <button className="btn primary" disabled={!pdf || !adresses.length} onClick={ouvrirMessagerie}><Icone n="email" /> Ouvrir dans ma messagerie</button>
        </div>
        <p className="muted small">
          {qui === 'membres' && 'Beaucoup d’adresses : certaines messageries refusent un lien aussi long ; « Copier les adresses » et colle-les dans « Cci ». '}
          {fichier ? '« Ouvrir dans ma messagerie » : le PDF est téléchargé, à joindre au mail (un lien vers la messagerie ne peut pas le joindre lui-même).' : ''}
        </p>
      </div>
    </Modal>
  );
}
