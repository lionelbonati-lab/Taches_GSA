import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Assemblee, Person, PointAg, PvAg as DonneesPvAg, PvArchive, ResultatVote, StyleDocs, VoteAg } from '../data/types';
import { agDuClub, agParDefaut, ficheDe, heureTexte, lettre, majoriteTexte, nouvelleFiche, texteResultat, type AgAgenda } from '../data/assemblee';
import { fmtDate, fmtDateTime, fullName, localNow, today, uid } from '../data/utils';
import { archiveHtml } from '../data/entete';
import { nomAppli } from '../data/nomAppli';
import { texteDe } from '../data/noteRiche';
import { margesMm, styleVars } from '../data/styleDocs';
import { DocEntete, useEntete, useUnitLogo } from '../components/Entete';
import { PageIntro } from '../components/Nav';
import { BoutonPdf, usePiedImprime } from '../components/BoutonPdf';
import { AvecLiens } from '../components/Liens';
import { NoteField, TexteNote } from '../components/NoteField';
import { ZoneTexte } from '../components/ZoneTexte';
import { Icone } from '../components/icones';
import { PvViewer } from './Agenda';

// Onglet « Assemblée générale » › PV (PLAN_ASSEMBLEE_GENERALE.md, étape AG2), pour les rôles qui ont le droit
// « Assemblée générale ». Pour l'AG choisie (son ordre du jour : OrdreDuJourAg.tsx) :
// - « Prise de notes » : la séance (heures), la présidence, le secrétaire du PV, les scrutateurs, les votants, présents,
//   excusés et invités ; puis chaque point et sous-point de l'ordre du jour, avec ses notes et le résultat de ses votes
//   (« À l'unanimité », « Par acclamation », ou compté : pour, contre, abstentions, avec les noms si on veut) ;
// - « PV » : le document (en-tête et mise en forme des documents du club), PDF, impression, texte copié ; « Valider et
//   archiver » le fige (archive dans l'AG), « Corriger le PV » le rouvre (la validation suivante crée la version 2).
// À venir : la vue en 3 fenêtres et la projection (AG3), la liste de présence après coup (AG4), les signatures (AG5).

/** « samedi 14 mars 2026 ». */
const longDate = (date: string) => {
  const d = new Date(date + 'T12:00:00');
  return `${d.toLocaleDateString('fr-CH', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('fr-CH', { month: 'long' })} ${d.getFullYear()}`;
};
const shortDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;
const VIDE: DonneesPvAg = { notes: {} };

/** AG proposée en ouvrant le PV : celle du jour, sinon la plus récente des 90 derniers jours dont le PV n'est pas validé, sinon la prochaine. */
function agPourPv(ags: AgAgenda[], fiche: (a: AgAgenda) => Assemblee | undefined, jour = today()) {
  const duJour = ags.find((a) => a.date === jour);
  if (duJour) return duJour;
  const limite = new Date(Date.parse(jour + 'T12:00:00') - 90 * 864e5).toISOString().slice(0, 10);
  const recente = [...ags].reverse().find((a) => a.date < jour && a.date >= limite && !fiche(a)?.pv?.valideLe);
  return recente ?? agParDefaut(ags, jour);
}

export function PvAg() {
  const { data, user, updateSilent } = useStore();
  const ags = useMemo(() => agDuClub(data), [data]);
  const [params] = useSearchParams();
  const demandee = params.get('ag');
  const [cle, setCle] = useState(() =>
    demandee && ags.some((a) => a.cle === demandee) ? demandee : agPourPv(ags, (a) => ficheDe(data, a))?.cle ?? '',
  );
  useEffect(() => {
    if (demandee && ags.some((a) => a.cle === demandee)) setCle(demandee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandee]);
  const ag = ags.find((a) => a.cle === cle) ?? agParDefaut(ags);
  const fiche = ficheDe(data, ag);
  const pv: DonneesPvAg = fiche?.pv ?? VIDE;
  const [vue, setVue] = useState<'notes' | 'pv'>('notes');
  const [msg, setMsg] = useState('');
  const [archive, setArchive] = useState<PvArchive | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  usePiedImprime(sheetRef);
  const valide = !!pv.valideLe;
  const nomDoc = ag ? `PV ${ag.nom} ${shortDate(ag.date)}` : 'PV de l’AG';
  useEffect(() => {
    const avant = document.title;
    document.title = nomDoc;
    return () => {
      document.title = avant;
    };
  }, [nomDoc]);

  // Fiches proposées pour la présidence et le secrétariat : d'abord les postes du club (Président, Secrétaire).
  const personnes = useMemo(() => data.people.filter((p) => p.actif).sort((a, b) => fullName(a).localeCompare(fullName(b))), [data.people]);
  const parPoste = (re: RegExp) => personnes.find((p) => re.test(p.poste ?? ''))?.id;

  /** Modifie le PV de l'AG affichée (sa fiche créée au premier changement) ; `action` : pour « Annuler ». */
  const modifier = (fn: (pv: DonneesPvAg, f: Assemblee) => void, action: string) => {
    if (!ag || !user) return;
    updateSilent(
      (d) => {
        if (!d.assemblees) d.assemblees = [];
        let f = ficheDe(d, ag);
        if (!f) {
          f = nouvelleFiche(ag, user.id);
          d.assemblees.push(f);
        }
        if (!f.pv) f.pv = { notes: {}, president: parPoste(/^pr[ée]sident/i), secretaire: parPoste(/^secr[ée]taire/i) };
        fn(f.pv, f);
      },
      { annulable: `PV « ${ag.nom} » : ${action}` },
    );
  };
  const setNote = (id: string, v: string) => modifier((x) => {
    if (v) x.notes[id] = v;
    else delete x.notes[id];
  }, 'notes');
  const setResultat = (v: VoteAg, r: ResultatVote | undefined) =>
    modifier((x) => {
      const res = { ...x.resultats };
      if (r) res[v.id] = r;
      else delete res[v.id];
      x.resultats = Object.keys(res).length ? res : undefined;
    }, `vote « ${v.objet} »`);

  const demarrer = () => modifier((x) => (x.heureDebut = localNow().slice(11, 16)), 'début de l’assemblée');
  const terminer = () => modifier((x) => (x.heureFin = localNow().slice(11, 16)), 'fin de l’assemblée');

  const valider = () => {
    if (!sheetRef.current || !user || !ag) return;
    const version = (pv.version ?? 0) + 1;
    const html = archiveHtml(sheetRef.current.outerHTML);
    modifier((x) => {
      x.valideLe = new Date().toISOString();
      x.validePar = user.id;
      x.version = version;
      x.archives = [{ id: uid('pv'), at: x.valideLe, by: user.id, titre: version > 1 ? `${nomDoc} (version ${version})` : nomDoc, html }, ...(x.archives ?? [])].slice(0, 10);
    }, version > 1 ? `PV validé (version ${version})` : 'PV validé');
    setMsg(`✅ PV validé et archivé dans l’AG${version > 1 ? ` (version ${version})` : ''}.`);
  };
  const corriger = () => {
    modifier((x) => {
      delete x.valideLe;
      delete x.validePar;
    }, 'PV rouvert pour correction');
    setMsg('✏️ PV rouvert : la prochaine validation créera une nouvelle version ; la version validée reste dans les archives.');
  };
  const copier = async () => {
    if (!ag) return;
    try {
      await navigator.clipboard.writeText(textePv(ag, fiche, data.people));
      setMsg('📋 Texte du PV copié.');
    } catch {
      setMsg('Copie impossible dans ce navigateur.');
    }
  };
  const imprimer = () => {
    if (vue === 'pv') return window.print();
    setVue('pv');
    setTimeout(() => window.print(), 100);
  };

  const style = data.reglagesOdj?.style;

  if (!ag)
    return (
      <div className="pv-page ag-page">
        <div className="page-head"><h1>PV de l’AG</h1></div>
        <PageIntro />
        <div className="panel ag-vide">
          <p><b>Aucune assemblée générale dans l’agenda.</b></p>
          <p className="muted">Crée-la dans <Link to="/ag">Ordre du jour</Link> (« Nouvelle AG »), puis prépare ses points.</p>
        </div>
      </div>
    );

  const points = fiche?.points ?? [];
  const aVenir = ags.filter((a) => a.date >= today() || a.cle === ag.cle);
  const passees = ags.filter((a) => a.date < today() && a.cle !== ag.cle).reverse();
  const feuille = <FeuillePvAg ag={ag} fiche={fiche} pv={pv} style={style} feuilleRef={sheetRef} />;
  const archives = pv.archives ?? [];

  return (
    <div className="pv-page ag-page ag-pv">
      <style>{`@page { size: A4 portrait; margin: ${margesMm(style)}mm; @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; } }`}</style>
      <div className="page-head no-print">
        <h1>PV de l’AG</h1>
        <div className="actions">
          <BoutonPdf className="btn primary toujours" feuille={sheetRef} titre={nomDoc} margesMm={margesMm(style)} police={style?.police} />
          <button className="btn" onClick={imprimer}><Icone n="imprimer" /> Imprimer</button>
          <button className="btn" onClick={copier}><Icone n="copier" /> Copier le texte</button>
          {valide ? (
            <button className="btn" onClick={corriger}><Icone n="modifier" /> Corriger le PV</button>
          ) : (
            <button className="btn" onClick={valider} disabled={!points.length}><Icone n="valider" /> Valider et archiver</button>
          )}
        </div>
      </div>
      <PageIntro />
      {msg && <p className="pv-msg no-print">{msg}</p>}

      <div className="ag-pv-choix no-print">
        <label>
          Assemblée générale
          <select value={ag.cle} onChange={(e) => { setCle(e.target.value); setMsg(''); }} aria-label="Assemblée générale du PV">
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
        <div className="seg" role="tablist" aria-label="Vue">
          <button type="button" role="tab" aria-selected={vue === 'notes'} className={vue === 'notes' ? 'on' : ''} onClick={() => setVue('notes')}><Icone n="notes" /> Prise de notes</button>
          <button type="button" role="tab" aria-selected={vue === 'pv'} className={vue === 'pv' ? 'on' : ''} onClick={() => setVue('pv')}><Icone n="pv" /> PV</button>
        </div>
        {valide && <span className="pbadge closed">PV validé le {fmtDateTime(pv.valideLe!)}{(pv.version ?? 1) > 1 ? ` (version ${pv.version})` : ''}</span>}
        {archives.length > 0 && (
          <span className="ag-pv-archives">
            {archives.map((a) => (
              <button key={a.id} type="button" className="chip" onClick={() => setArchive(a)} title={`Validé le ${fmtDateTime(a.at)}`}><Icone n="archives" /> {a.titre}</button>
            ))}
          </span>
        )}
      </div>

      {vue === 'notes' ? (
        <>
          {!points.length ? (
            <div className="panel ag-vide">
              <p><b>Pas encore d’ordre du jour pour cette AG.</b></p>
              <p className="muted">Prépare ses points dans <Link to={`/ag?ag=${encodeURIComponent(ag.cle)}`}>Ordre du jour</Link> : le PV les reprend, dans le même ordre.</p>
            </div>
          ) : (
            <PriseDeNotes
              ag={ag}
              points={points}
              pv={pv}
              personnes={personnes}
              lecture={valide}
              modifier={modifier}
              setNote={setNote}
              setResultat={setResultat}
              demarrer={demarrer}
              terminer={terminer}
            />
          )}
          {/* Le PV reste prêt (PDF, validation) pendant la prise de notes. */}
          <div className="odj-cache" hidden aria-hidden="true">{feuille}</div>
        </>
      ) : (
        <div className="pv-preview">{feuille}</div>
      )}
      {archive && <PvViewer pv={archive} kind="pv" canDelete={false} onDelete={() => undefined} onClose={() => setArchive(null)} />}
    </div>
  );
}

/** La prise de notes : la séance, puis chaque point (et sous-point) avec ses notes et ses votes. */
function PriseDeNotes({ ag, points, pv, personnes, lecture, modifier, setNote, setResultat, demarrer, terminer }: {
  ag: AgAgenda;
  points: PointAg[];
  pv: DonneesPvAg;
  personnes: Person[];
  lecture: boolean;
  modifier: (fn: (pv: DonneesPvAg) => void, action: string) => void;
  setNote: (id: string, v: string) => void;
  setResultat: (v: VoteAg, r: ResultatVote | undefined) => void;
  demarrer: () => void;
  terminer: () => void;
}) {
  const champ = (k: 'scrutateurs' | 'presents' | 'excuses' | 'invites', v: string) =>
    (pv[k] ?? '') !== v.trim() &&
    modifier((x) => {
      if (v.trim()) x[k] = v.trim();
      else delete x[k];
    }, k);
  const fichePar = (id?: string) => personnes.find((p) => p.id === id);
  const point = (p: PointAg, numero: string, sous: boolean) => (
    <div key={p.id} className={sous ? 'min-sub ag-pv-point sous' : 'ag-pv-point'}>
      {sous ? <div className="min-sub-title">{numero} {p.titre}</div> : null}
      {p.texte?.trim() && <p className="muted small ag-pv-texte"><AvecLiens texte={p.texte.trim()} /></p>}
      {(p.votes ?? []).map((v) => (
        <ResultatVoteChamp key={v.id} vote={v} resultat={pv.resultats?.[v.id]} votants={pv.votants} lecture={lecture} onChange={(r) => setResultat(v, r)} />
      ))}
      <NoteField value={pv.notes[p.id] ?? ''} onCommit={(v) => setNote(p.id, v)} placeholder={`Notes pour « ${p.titre} »…`} readOnly={lecture} />
    </div>
  );
  return (
    <div className="min-main ag-pv-notes">
      <section className="panel min-session">
        <div className="min-session-row">
          <strong>{ag.nom} · {longDate(ag.date)}</strong>
          {ag.lieu && <span className="muted">Lieu : {ag.lieu}</span>}
        </div>
        <div className="min-session-row">
          <label className="inline">Ouverture <input type="time" value={pv.heureDebut ?? ''} disabled={lecture} onChange={(e) => modifier((x) => (x.heureDebut = e.target.value || undefined), 'heure d’ouverture')} /></label>
          <label className="inline">Séance levée <input type="time" value={pv.heureFin ?? ''} disabled={lecture} onChange={(e) => modifier((x) => (x.heureFin = e.target.value || undefined), 'heure de fin')} /></label>
          {!lecture && (!pv.heureDebut ? (
            <button className="btn primary" onClick={demarrer}><Icone n="demarrer" /> Ouvrir l’assemblée</button>
          ) : !pv.heureFin ? (
            <button className="btn" onClick={terminer}><Icone n="terminer" /> Lever la séance</button>
          ) : null)}
        </div>
      </section>

      <section className="panel ag-pv-seance">
        <h2 className="min-h2">Présidence et présences</h2>
        <div className="form">
          <label>
            Président(e) de l’assemblée
            <select value={pv.president ?? ''} disabled={lecture} onChange={(e) => modifier((x) => (x.president = e.target.value || undefined), 'présidence')}>
              <option value="">—</option>
              {personnes.map((p) => <option key={p.id} value={p.id}>{fullName(p)}{p.poste ? ` (${p.poste})` : ''}</option>)}
            </select>
          </label>
          <label>
            Secrétaire du PV
            <select value={pv.secretaire ?? ''} disabled={lecture} onChange={(e) => modifier((x) => (x.secretaire = e.target.value || undefined), 'secrétaire du PV')}>
              <option value="">—</option>
              {personnes.map((p) => <option key={p.id} value={p.id}>{fullName(p)}{p.poste ? ` (${p.poste})` : ''}</option>)}
            </select>
          </label>
          <label>
            Scrutateurs
            <input key={`s-${ag.cle}`} defaultValue={pv.scrutateurs ?? ''} readOnly={lecture} placeholder="Noms des scrutateurs" onBlur={(e) => champ('scrutateurs', e.target.value)} />
          </label>
          <label>
            Membres présents ayant droit de vote
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={pv.votants ?? ''}
              readOnly={lecture}
              onChange={(e) => modifier((x) => (x.votants = e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value)))), 'votants')}
            />
            {pv.votants ? <small className="muted">Majorité absolue : {Math.floor(pv.votants / 2) + 1}</small> : null}
          </label>
          <label className="full">
            Présents
            <input key={`p-${ag.cle}`} defaultValue={pv.presents ?? ''} readOnly={lecture} placeholder="Ex. 38 membres (liste de présence en annexe)" onBlur={(e) => champ('presents', e.target.value)} />
          </label>
          <label className="full">
            Excusés
            <ZoneTexte key={`e-${ag.cle}`} defaultValue={pv.excuses ?? ''} readOnly={lecture} rows={2} placeholder="Noms des excusés, séparés par des virgules" onBlur={(e) => champ('excuses', e.target.value)} />
          </label>
          <label className="full">
            Invités
            <input key={`i-${ag.cle}`} defaultValue={pv.invites ?? ''} readOnly={lecture} placeholder="Commune, presse, membres d’honneur…" onBlur={(e) => champ('invites', e.target.value)} />
          </label>
        </div>
        {(fichePar(pv.president) || fichePar(pv.secretaire)) && (
          <p className="muted small">Ils signeront le PV (signatures dans l’appli : prochaine étape).</p>
        )}
      </section>

      <section className="min-agenda">
        {points.map((p, i) => (
          <div key={p.id} className="panel min-section" data-arret={p.id}>
            <h3>{i + 1}. {p.titre}</h3>
            {point(p, `${i + 1}.`, false)}
            {(p.sous ?? []).map((s, j) => point(s, `${lettre(j)}.`, true))}
          </div>
        ))}
      </section>
    </div>
  );
}

/** Résultat d'un vote dans la prise de notes : unanimité, acclamation, ou compté. */
function ResultatVoteChamp({ vote, resultat: r, votants, lecture, onChange }: {
  vote: VoteAg;
  resultat?: ResultatVote;
  votants?: number;
  lecture: boolean;
  onChange: (r: ResultatVote | undefined) => void;
}) {
  const nombre = (k: 'pour' | 'contre' | 'abstention', v: string) =>
    onChange({ ...r, mode: 'nombres', [k]: v === '' ? undefined : Math.max(0, Math.round(Number(v))) });
  const total = (r?.pour ?? 0) + (r?.contre ?? 0) + (r?.abstention ?? 0);
  return (
    <div className={`ag-vote-res ${r ? 'fait' : ''}`}>
      <div className="ag-vote-res-ligne">
        <span className="ag-vote-objet"><Icone n="vote" /> <b>{vote.objet}</b> <small className="muted">({majoriteTexte(vote.majorite)})</small></span>
        {!lecture && (
          <span className="seg small">
            <button type="button" className={r?.mode === 'unanimite' ? 'on' : ''} aria-pressed={r?.mode === 'unanimite'} onClick={() => onChange(r?.mode === 'unanimite' ? undefined : { mode: 'unanimite' })}>À l’unanimité</button>
            <button type="button" className={r?.mode === 'acclamation' ? 'on' : ''} aria-pressed={r?.mode === 'acclamation'} onClick={() => onChange(r?.mode === 'acclamation' ? undefined : { mode: 'acclamation' })}>Par acclamation</button>
            <button type="button" className={r?.mode === 'nombres' ? 'on' : ''} aria-pressed={r?.mode === 'nombres'} onClick={() => onChange(r?.mode === 'nombres' ? undefined : { mode: 'nombres' })}>Compter</button>
          </span>
        )}
      </div>
      {r?.mode === 'nombres' && (
        <div className="ag-vote-nb">
          {(['pour', 'contre', 'abstention'] as const).map((k) => (
            <label key={k} className="inline">
              {k === 'pour' ? 'Pour' : k === 'contre' ? 'Contre' : 'Abstentions'}
              <input type="number" min={0} inputMode="numeric" value={r[k] ?? ''} readOnly={lecture} onChange={(e) => nombre(k, e.target.value)} aria-label={`${vote.objet} : ${k === 'abstention' ? 'abstentions' : k}`} />
            </label>
          ))}
          <input className="grow" value={r.noms ?? ''} readOnly={lecture} placeholder="Noms (facultatif) : contre : X ; abstentions : Y, Z" onChange={(e) => onChange({ ...r, noms: e.target.value || undefined })} aria-label={`${vote.objet} : noms des voix contre et des abstentions`} />
          {votants && total > votants ? <small className="error">Plus de voix ({total}) que de votants ({votants}).</small> : null}
        </div>
      )}
      {r && <p className="ag-vote-issue"><Icone n="ok" /> {texteResultat(vote, r, votants)}</p>}
    </div>
  );
}

/** Le PV de l'AG : en-tête, séance et présences, ordre du jour, points traités (notes et votes), signatures. */
function FeuillePvAg({ ag, fiche, pv, style, feuilleRef }: {
  ag: AgAgenda;
  fiche?: Assemblee;
  pv: DonneesPvAg;
  style?: StyleDocs;
  feuilleRef: RefObject<HTMLDivElement>;
}) {
  const { data, user } = useStore();
  const logo = useUnitLogo();
  const entete = useEntete();
  const points = fiche?.points ?? [];
  const nom = (id?: string) => {
    const p = data.people.find((x) => x.id === id);
    return p ? fullName(p) : '';
  };
  const ligne = (label: string, v?: ReactNode) => (v ? <p><b>{label} :</b> {v}</p> : null);
  const details = (p: PointAg) => (
    <>
      {pv.textes && p.texte?.trim() && <div className="odj-rem ag-texte-point"><AvecLiens texte={p.texte.trim()} /></div>}
      {pv.notes[p.id] && <p className="min-pv-note"><TexteNote note={pv.notes[p.id]} /></p>}
      {(p.votes ?? []).map((v) => {
        const r = pv.resultats?.[v.id];
        return (
          <p key={v.id} className="min-pv-vote ag-pv-vote">
            <b>Vote : {v.objet}</b> – {r ? texteResultat(v, r, pv.votants) : <span className="odj-meta">pas de résultat noté</span>}
          </p>
        );
      })}
    </>
  );
  return (
    <div ref={feuilleRef} className="pv-sheet portrait t-normale" style={styleVars(style)}>
      <header className="pv-head">
        <DocEntete e={entete} logo={logo} />
        <p className="pv-kicker">Procès-verbal</p>
        <h1>{ag.nom}</h1>
        <p className="pv-meta">{longDate(ag.date)}</p>
      </header>
      <section className="odj-head">
        {ligne('Lieu', ag.lieu || undefined)}
        {ligne('Ouverture', heureTexte(pv.heureDebut) || undefined)}
        {ligne('Séance levée', heureTexte(pv.heureFin) || undefined)}
        {ligne('Présidence', nom(pv.president) || undefined)}
        {ligne('Procès-verbal', nom(pv.secretaire) || undefined)}
        {ligne('Scrutateurs', pv.scrutateurs)}
        {ligne('Présents', pv.presents)}
        {ligne('Membres présents ayant droit de vote', pv.votants ? `${pv.votants} (majorité absolue : ${Math.floor(pv.votants / 2) + 1})` : undefined)}
        {ligne('Excusés', pv.excuses)}
        {ligne('Invités', pv.invites)}
      </section>
      <section className="pv-part">
        <h2>Ordre du jour</h2>
        {points.length ? (
          <ol className="odj ag-odj-court">
            {points.map((p) => (
              <li key={p.id}>
                <span className="odj-sec">{p.titre}</span>
                {(p.sous?.length ?? 0) > 0 && <ol className="odj-l1">{p.sous!.map((s) => <li key={s.id}>{s.titre}</li>)}</ol>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="pv-empty">Aucun point.</p>
        )}
      </section>
      <section className="pv-part">
        <h2>Points traités</h2>
        <ol className="odj ag-odj">
          {points.map((p) => (
            <li key={p.id}>
              <span className="odj-sec">{p.titre}</span>
              {details(p)}
              {(p.sous?.length ?? 0) > 0 && (
                <ol className="odj-l1">
                  {p.sous!.map((s) => (
                    <li key={s.id}>
                      {s.titre}
                      {details(s)}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
        {pv.heureFin && <p className="ag-texte">Séance levée à {heureTexte(pv.heureFin)}.</p>}
      </section>
      <section className="ag-signatures">
        <p className="ag-signatures-lieu">{[ag.lieu, `le ${fmtDate(pv.valideLe?.slice(0, 10) ?? ag.date)}`].filter(Boolean).join(', ')}</p>
        <div className="ag-signatures-cases">
          {[['Présidence', pv.president], ['Secrétaire', pv.secretaire]].map(([label, id]) => (
            <div key={label} className="ag-signature">
              <span>{label} :</span>
              <span className="ag-signature-ligne" />
              <span>{nom(id) || ' '}</span>
            </div>
          ))}
        </div>
      </section>
      <footer className="pv-foot">Document généré le {fmtDate(today())} par {fullName(user ?? undefined)} · {nomAppli()}</footer>
    </div>
  );
}

/** Version texte du PV (copier). */
function textePv(ag: AgAgenda, fiche: Assemblee | undefined, people: Person[]): string {
  const pv = fiche?.pv ?? VIDE;
  const nom = (id?: string) => {
    const p = people.find((x) => x.id === id);
    return p ? fullName(p) : '';
  };
  const l: string[] = [`Procès-verbal – ${ag.nom}`, longDate(ag.date)];
  const ajout = (label: string, v?: string) => v && l.push(`${label} : ${v}`);
  ajout('Lieu', ag.lieu);
  ajout('Ouverture', heureTexte(pv.heureDebut));
  ajout('Séance levée', heureTexte(pv.heureFin));
  ajout('Présidence', nom(pv.president));
  ajout('Procès-verbal', nom(pv.secretaire));
  ajout('Scrutateurs', pv.scrutateurs);
  ajout('Présents', pv.presents);
  ajout('Membres présents ayant droit de vote', pv.votants ? String(pv.votants) : undefined);
  ajout('Excusés', pv.excuses);
  ajout('Invités', pv.invites);
  l.push('', 'POINTS TRAITÉS');
  const details = (p: PointAg, retrait: string) => {
    if (pv.notes[p.id]) l.push(...texteDe(pv.notes[p.id]).split('\n').map((x) => `${retrait}${x}`));
    (p.votes ?? []).forEach((v) => {
      const r = pv.resultats?.[v.id];
      l.push(`${retrait}Vote : ${v.objet} – ${r ? texteResultat(v, r, pv.votants) : 'pas de résultat noté'}`);
    });
  };
  (fiche?.points ?? []).forEach((p, i) => {
    l.push('', `${i + 1}. ${p.titre}`);
    details(p, '   ');
    (p.sous ?? []).forEach((s, j) => {
      l.push(`   ${lettre(j)}. ${s.titre}`);
      details(s, '      ');
    });
  });
  if (pv.heureFin) l.push('', `Séance levée à ${heureTexte(pv.heureFin)}.`);
  return l.join('\n');
}

