import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { UNIT_TYPES } from '../data/units';
import type { AppData, Paiement, SceauPose, SuiviTicket, Task, TaskDoc, Timbre } from '../data/types';
import {
  COULEURS_TIMBRE, ETATS, GENRES, caissiers, chf, demandeur, genre, genreDe, nomDe, responsablesPour, sectionFinances, signataires, statutPour, timbreDe,
  type GenreTicket, type Ticket,
} from '../data/paiements';
import { SCEAU_RATIO, apposerSceau, renderSceau, type SceauContenu } from '../data/sceau';
import { deleteFiles, docIcon, getFile, openFile, saveFile } from '../data/files';
import { fmtDate, fmtDateTime, fullName, today, uid } from '../data/utils';
import { DocsField, Thumb, type DocTracking } from './DocsField';
import { SignaturePad } from './SignaturePad';
import { Modal } from './ui';

// Remboursements et paiements de factures : des tâches de la section des finances, ouvertes dans cette fenêtre
// (circuit caisse → visa → virement) au lieu du formulaire de tâche.

const parseMontant = (s: string) => {
  const n = parseFloat(s.replace(/['’\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Remboursement ou paiement ouvert depuis les tâches (accueil, agenda, notification…). Rendu hors de #root
 *  pour que « Bon de paiement » n'imprime que lui. */
export function TicketModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data } = useStore();
  const [edit, setEdit] = useState(false);
  const t = data.tasks.find((x): x is Ticket => x.id === task.id && !!x.paiement);
  useEffect(() => {
    if (!t) onClose(); // supprimé
  }, [!t]);
  if (!t) return null;
  if (edit) return <TicketForm ticket={t} onClose={() => setEdit(false)} />;
  const g = genre(t.paiement);
  return createPortal(
    <Modal title={`${g.icon} ${g.nom}`} onClose={onClose} wide>
      <TicketCard t={t} onEdit={() => setEdit(true)} />
      <div className="modal-foot no-print">
        <a className="small-link" href="#/taches?type=tickets" onClick={onClose}>Tous les paiements et remboursements →</a>
        <span className="grow" />
        <button className="btn" onClick={onClose}>Fermer</button>
      </div>
    </Modal>,
    document.body,
  );
}

/** Circuit expliqué en tête de la liste des paiements et remboursements ; réglage du sceau pour la caisse. */
export function CircuitPaiements({ total }: { total?: number }) {
  const { data, can } = useStore();
  return (
    <div className="circuit-paiements no-print">
      <p className="muted small">
        🧾 <strong>Remboursement</strong> : une personne a avancé l’argent (photo de son ticket) · 💳 <strong>Paiement</strong> : facture payée directement à qui l’a envoyée.
        Circuit : la caisse reçoit la demande et la fait viser par un membre du comité (jamais le demandeur), qui signe et pose le sceau « {timbreDe(data).texte} » → la caisse fait le virement et met « OK ». Le virement lui-même ne passe pas par l’appli.
      </p>
      {can('paiements.payer') && <TimbreReglage />}
      {total !== undefined && <p className="muted small">Total : <strong>{chf(total)}</strong></p>}
    </div>
  );
}

/** Demandes envoyées à la caisse centrale depuis une autre entité : elles n'y sont pas, on en suit l'état. */
export function SuiviCentral({ version }: { version: number }) {
  const club = useClubOptional();
  const [list, setList] = useState<SuiviTicket[]>([]);
  useEffect(() => {
    if (!club || club.central?.moi) return;
    let actif = true;
    club
      .mesTicketsCentraux()
      .then((l) => actif && setList(l))
      .catch(() => actif && setList([]));
    return () => {
      actif = false;
    };
  }, [version, club?.current.id]);
  if (!list.length) return null;
  return (
    <section className="suivi-central">
      <h2>Envoyés à la caisse centrale</h2>
      <ul>
        {list.map((t) => (
          <li key={t.id}>
            <span className={`ticket-etat ${t.etat}`}>{ETATS[t.etat].icon} {ETATS[t.etat].label}</span>
            <strong>{GENRES[genreDe({ type: t.type ?? undefined })].icon} {t.titre}</strong>
            <span>{chf(t.montant)} · {fmtDate(t.le.slice(0, 10))}{t.etat === 'paye' && t.payeLe ? ` · payé le ${fmtDate(t.payeLe.slice(0, 10))}` : ''}</span>
            {t.motif && <small className="muted">Motif : « {t.motif} »</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Modèle du sceau, réglé par la caisse : en-tête, texte, couleur. */
function TimbreReglage() {
  const { data, update } = useStore();
  const [t, setT] = useState<Timbre>(() => timbreDe(data));
  const modifie = JSON.stringify(t) !== JSON.stringify(timbreDe(data));
  return (
    <details className="card timbre-reglage no-print">
      <summary>🖋 Sceau « {timbreDe(data).texte} » : modifier</summary>
      <div className="timbre-grid">
        <div className="form">
          <label className="full">
            En-tête (facultatif)
            <input value={t.entete} onChange={(e) => setT({ ...t, entete: e.target.value })} placeholder="Ex. G.S. Ajoie – Caisse" maxLength={40} />
          </label>
          <label className="full">
            Texte
            <input value={t.texte} onChange={(e) => setT({ ...t, texte: e.target.value })} placeholder="OK pour paiement" maxLength={30} />
          </label>
          <div className="full couleurs">
            {COULEURS_TIMBRE.map((c) => (
              <button key={c.id} type="button" className={`pastille ${t.couleur === c.id ? 'on' : ''}`} style={{ background: c.id }} onClick={() => setT({ ...t, couleur: c.id })} aria-label={c.label} title={c.label} />
            ))}
          </div>
          <div className="full">
            <button className="btn primary small" disabled={!modifie || !t.texte.trim()} onClick={() => update((d) => { d.timbre = { entete: t.entete.trim(), texte: t.texte.trim(), couleur: t.couleur }; }, `Sceau de paiement modifié : « ${t.texte.trim()} »`)}>Enregistrer</button>
          </div>
        </div>
        <SceauImg c={{ ...t, montant: 'CHF 0.00', date: fmtDate(today()), nom: 'Prénom Nom' }} />
      </div>
      <small className="muted">La date, le montant, la signature et le nom de la personne qui vise sont ajoutés au moment du visa.</small>
    </details>
  );
}

function SceauImg({ c }: { c: SceauContenu }) {
  const [src, setSrc] = useState<string>();
  const key = JSON.stringify(c);
  useEffect(() => {
    let alive = true;
    renderSceau(c).then((s) => alive && setSrc(s)).catch(() => {});
    return () => { alive = false; };
  }, [key]);
  return src ? <img className="sceau" src={src} alt={`Sceau : ${c.texte}`} draggable={false} /> : null;
}

/** Contenu du sceau d'un ticket visé. */
function sceauDe(data: AppData, t: Ticket): SceauContenu | null {
  const v = t.paiement.validation;
  if (!v) return null;
  const s = v.sceau ?? timbreDe(data);
  return { entete: s.entete, texte: s.texte, couleur: s.couleur, montant: chf(t.paiement.montant), date: fmtDate(v.le.slice(0, 10)), nom: nomDe(data, v.par), signature: v.signature };
}

function TicketCard({ t, onEdit }: { t: Ticket; onEdit: () => void }) {
  const { data, user, can, update } = useStore();
  const [viser, setViser] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [demande, setDemande] = useState(false);
  const p = t.paiement;
  const g = genre(p);
  const caisse = can('paiements.payer');
  const moi = user?.id;
  const mien = p.demandePar === moi;
  const pourMoi = p.etat === 'visa' && p.visa?.a === moi && !mien;
  const save = useSaveTicket();
  const now = () => new Date().toISOString();
  const sceau = sceauDe(data, t);

  const [msg, setMsg] = useState('');
  // Document fini (justificatif avec le sceau) : téléchargé par la caisse pour la comptabilité.
  const telecharger = async () => {
    const nom = `${g.vise} - ${t.titre} - ${chf(p.montant)}.jpg`;
    setMsg((await openFile(p.validation!.docVise!, nom, true)) ? '' : 'Fichier introuvable (vérifie la connexion).');
  };
  // Bon de paiement : seule la fenêtre du ticket est imprimée (le reste de l'appli est masqué le temps de l'impression).
  const imprimer = () => {
    const fin = () => {
      document.body.classList.remove('printing-ticket');
      window.removeEventListener('afterprint', fin);
    };
    document.body.classList.add('printing-ticket');
    window.addEventListener('afterprint', fin);
    setTimeout(() => window.print(), 100);
  };
  const supprimer = () => {
    if (!confirm(`Supprimer « ${t.titre} » (${g.nom.toLowerCase()}) ?`)) return;
    update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); }, `Suppression : ${g.nom.toLowerCase()} « ${t.titre} » (${chf(p.montant)})`);
    deleteFiles((t.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id));
  };
  // Visa retiré : le ticket revient à la caisse, sans la copie visée.
  const retirerVisa = () => {
    if (!confirm('Retirer le visa ? La demande revient à la caisse, qui pourra redemander un visa.')) return;
    const vise = p.validation?.docVise;
    save(t, { etat: 'recu', visa: undefined, validation: undefined }, `Visa retiré : « ${t.titre} »`, { documents: (t.documents ?? []).filter((d) => d.id !== vise) });
    if (vise) deleteFiles([vise]);
  };

  return (
    <article className={`card ticket etat-${p.etat}`} id={`ticket-${t.id}`}>
      <header className="ticket-head">
        <div>
          <h3>{t.titre}</h3>
          <small className="muted">Demandé par {demandeur(data, p)} · {fmtDateTime(p.demandeLe)}</small>
        </div>
        <div className="ticket-montant">
          <strong>{chf(p.montant)}</strong>
          <span className={`badge ticket-etat ${p.etat}`}>{ETATS[p.etat].icon} {ETATS[p.etat].label}</span>
        </div>
      </header>
      <dl className="ticket-infos">
        <dt>{g.a}</dt><dd>{p.beneficiaire}</dd>
        {p.iban && <><dt>IBAN</dt><dd className="mono">{p.iban}</dd></>}
        {genreDe(p) === 'facture' && t.delai && <><dt>Échéance</dt><dd>{fmtDate(t.delai)}</dd></>}
        {t.remarque && <><dt>Remarque</dt><dd>{t.remarque}</dd></>}
        {p.visa && (p.etat === 'visa' || p.validation) && (
          <><dt>Visa</dt><dd>demandé à <strong>{nomDe(data, p.visa.a)}</strong> par {nomDe(data, p.visa.par)} · {fmtDateTime(p.visa.le)}{p.visa.message && <> — « {p.visa.message} »</>}</dd></>
        )}
      </dl>
      <Justificatifs docs={t.documents ?? []} vise={p.validation?.docVise} label={g.vise} />
      {sceau && (
        <div className="ticket-visa">
          <SceauImg c={sceau} />
          <small>Visé par <strong>{nomDe(data, p.validation!.par)}</strong> · {fmtDateTime(p.validation!.le)}</small>
        </div>
      )}
      {p.refus && p.etat === 'refuse' && (
        <p className="ticket-refus">❌ Refusé par {nomDe(data, p.refus.par)} · {fmtDateTime(p.refus.le)}{p.refus.motif && <> — « {p.refus.motif} »</>}</p>
      )}
      {p.paye && p.etat === 'paye' && (
        <p className="ticket-ok">✅ Virement fait par {nomDe(data, p.paye.par)} · {fmtDateTime(p.paye.le)}{p.paye.remarque && <> — {p.paye.remarque}</>}</p>
      )}
      {pourMoi && <p className="ticket-alerte no-print">✍️ La caisse te demande de viser {g.ce}.</p>}

      {demande && <DemandeVisa t={t} onClose={() => setDemande(false)} />}
      {refus !== null && (
        <div className="ticket-inline no-print">
          <input autoFocus placeholder="Motif du refus" value={refus} onChange={(e) => setRefus(e.target.value)} />
          <button className="btn small danger" onClick={() => save(t, { etat: 'refuse', refus: { par: moi!, le: now(), motif: refus.trim() } }, `Refusé : « ${t.titre} »`)}>Refuser</button>
          <button className="btn small" onClick={() => setRefus(null)}>Annuler</button>
        </div>
      )}
      {ok !== null && (
        <div className="ticket-inline no-print">
          <input autoFocus placeholder="Remarque (facultatif), ex. date du virement" value={ok} onChange={(e) => setOk(e.target.value)} />
          <button className="btn small primary" onClick={() => save(t, { etat: 'paye', paye: { par: moi!, le: now(), remarque: ok.trim() || undefined } }, `Virement fait : « ${t.titre} » (${chf(p.montant)})`)}>Confirmer : virement fait</button>
          <button className="btn small" onClick={() => setOk(null)}>Annuler</button>
        </div>
      )}

      {msg && <p className="error no-print">{msg}</p>}
      <div className="ticket-actions no-print">
        {p.etat === 'recu' && caisse && !demande && <button className="btn primary" onClick={() => setDemande(true)}>✍️ Demander le visa</button>}
        {p.etat === 'visa' && caisse && !demande && <button className="btn" onClick={() => setDemande(true)}>Changer de signataire</button>}
        {pourMoi && <button className="btn primary" onClick={() => setViser(true)}>✍️ Viser et signer</button>}
        {((p.etat === 'recu' && caisse) || pourMoi) && refus === null && <button className="btn" onClick={() => setRefus('')}>Refuser</button>}
        {p.etat === 'valide' && caisse && ok === null && <button className="btn primary" onClick={() => setOk('')}>✅ Virement fait (OK)</button>}
        {(p.etat === 'recu' || p.etat === 'refuse') && (mien || caisse) && (
          <button className="btn" onClick={onEdit}>{p.etat === 'refuse' && mien ? 'Corriger et renvoyer' : 'Modifier'}</button>
        )}
        {(p.etat === 'recu' || p.etat === 'refuse') && (mien || caisse) && <button className="btn danger" onClick={supprimer}>Supprimer</button>}
        {(p.etat === 'valide' || p.etat === 'paye') && p.validation?.docVise && <button className="btn" onClick={telecharger}>⬇️ Télécharger : {g.vise.toLowerCase()}</button>}
        {(p.etat === 'valide' || p.etat === 'paye') && <button className="btn" onClick={imprimer}>🖨 Bon de paiement</button>}
        {p.etat === 'valide' && (caisse || p.validation?.par === moi) && <button className="btn link" onClick={retirerVisa}>Retirer le visa</button>}
        {p.etat === 'paye' && caisse && (
          <button className="btn link" onClick={() => confirm('Le virement n’a pas été fait ? La demande revient « à payer ».') && save(t, { etat: 'valide', paye: undefined }, `« ${t.titre} » remis « à payer »`)}>Annuler « payé »</button>
        )}
      </div>
      {viser && <VisaModal t={t} onClose={() => setViser(false)} />}
    </article>
  );
}

/** Enregistre un changement d'état : statut et responsables de la tâche suivent (caisse → visa → caisse). */
function useSaveTicket() {
  const { data, update } = useStore();
  return (t: Ticket, patch: Partial<Paiement>, msg: string, extra: Partial<Task> = {}) => {
    const paiement: Paiement = { ...t.paiement, ...patch };
    (Object.keys(patch) as (keyof Paiement)[]).forEach((k) => patch[k] === undefined && delete paiement[k]);
    const next: Ticket = { ...t, ...extra, paiement, statusId: statutPour(data, paiement.etat), updatedAt: new Date().toISOString() };
    next.responsables = responsablesPour(data, next);
    next.termineeLe = paiement.etat === 'paye' || paiement.etat === 'refuse' ? today() : undefined;
    update((d) => { d.tasks = d.tasks.map((x) => (x.id === t.id ? next : x)); }, msg);
  };
}

/** La caisse choisit qui doit viser : jamais le demandeur. */
function DemandeVisa({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const { data, user } = useStore();
  const save = useSaveTicket();
  const { autorises, autres } = signataires(data, t);
  const [a, setA] = useState(t.paiement.visa?.a ?? autorises.find((x) => x.id !== user?.id)?.id ?? autorises[0]?.id ?? '');
  const [message, setMessage] = useState(t.paiement.visa?.message ?? '');
  const option = (x: (typeof autres)[number]) => <option key={x.id} value={x.id}>{fullName(x)}{x.poste ? ` – ${x.poste}` : ''}</option>;
  const envoyer = () => {
    if (!a || !user) return;
    save(t, { etat: 'visa', visa: { a, par: user.id, le: new Date().toISOString(), message: message.trim() || undefined }, refus: undefined }, `Visa demandé à ${nomDe(data, a)} : « ${t.titre} »`);
    onClose();
  };
  return (
    <div className="ticket-inline demande-visa no-print">
      <label>
        Visa à demander à
        <select value={a} onChange={(e) => setA(e.target.value)}>
          <option value="" disabled>Choisir…</option>
          {autorises.length > 0 && <optgroup label="Peuvent viser">{autorises.map(option)}</optgroup>}
          {autres.length > 0 && <optgroup label="Autres membres du comité">{autres.map(option)}</optgroup>}
        </select>
      </label>
      <input placeholder="Message (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button className="btn small primary" disabled={!a} onClick={envoyer}>Envoyer la demande</button>
      <button className="btn small" onClick={onClose}>Annuler</button>
      <small className="muted">Seuls les membres du comité de l’entité peuvent viser, jamais le demandeur ({demandeur(data, t.paiement)}).</small>
    </div>
  );
}

function Justificatifs({ docs, vise, label }: { docs: TaskDoc[]; vise?: string; label?: string }) {
  if (!docs.length) return <p className="muted small">Aucun justificatif.</p>;
  const open = (d: TaskDoc) => (d.kind === 'lien' ? window.open(d.url, '_blank', 'noopener') : openFile(d.id, d.nom));
  const tri = vise ? [...docs].sort((a, b) => (a.id === vise ? -1 : b.id === vise ? 1 : 0)) : docs;
  return (
    <div className={`ticket-docs ${vise ? 'avec-vise' : ''}`}>
      {tri.map((d) => (
        <button key={d.id} type="button" className={`ticket-doc ${d.id === vise ? 'vise' : ''}`} onClick={() => open(d)} title={d.nom}>
          {d.kind === 'fichier' && d.mime?.startsWith('image/') ? <Thumb id={d.id} /> : <span className="doc-icon">{docIcon(d)}</span>}
          <small>{d.id === vise ? `✔ ${label ?? 'Visé'}` : d.nom}</small>
        </button>
      ))}
    </div>
  );
}

/** Image d'un justificatif en grand (pour y poser le sceau). */
function DocImage({ id, onLoad }: { id: string; onLoad: (img: HTMLImageElement) => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    getFile(id).then((b) => b && setUrl((u = URL.createObjectURL(b))));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img className="sceau-doc" src={url} alt="Justificatif" onLoad={(e) => onLoad(e.currentTarget)} draggable={false} /> : <p className="muted small">Chargement du justificatif…</p>;
}

/** Visa : la personne désignée par la caisse place le sceau sur le ticket, l'ajuste et signe. */
function VisaModal({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const { data, user } = useStore();
  const save = useSaveTicket();
  const p = t.paiement;
  const g = genre(p);
  const images = (t.documents ?? []).filter((d) => d.kind === 'fichier' && d.mime?.startsWith('image/'));
  const [docId, setDocId] = useState(images[0]?.id);
  const modele = timbreDe(data);
  const [texte, setTexte] = useState(modele.texte);
  const [png, setPng] = useState<string>();
  const [pose, setPose] = useState({ x: 0.5, y: 0.6, largeur: 0.45 });
  const [aspect, setAspect] = useState(1.4); // hauteur / largeur de l'image
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const zone = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const contenu: SceauContenu = { entete: modele.entete, texte: texte.trim() || modele.texte, couleur: modele.couleur, montant: chf(p.montant), date: fmtDate(today()), nom: fullName(user ?? undefined), signature: png };

  const clamp = (q: typeof pose, asp = aspect) => {
    const h = (q.largeur * SCEAU_RATIO) / asp;
    return { largeur: q.largeur, x: Math.min(Math.max(0, q.x), 1 - q.largeur), y: Math.min(Math.max(0, q.y), Math.max(0, 1 - h)) };
  };
  const loaded = (img: HTMLImageElement) => {
    const asp = img.naturalHeight / img.naturalWidth || 1.4;
    setAspect(asp);
    setPose((q) => clamp({ ...q, x: 1, y: 1 }, asp)); // par défaut en bas à droite
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pose.x, y: pose.y };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = zone.current?.getBoundingClientRect();
    if (!d || !r) return;
    setPose(clamp({ ...pose, x: d.x + (e.clientX - d.px) / r.width, y: d.y + (e.clientY - d.py) / r.height }));
  };
  const up = () => { drag.current = null; };

  const viser = async () => {
    if (!png || !user || busy) return;
    setBusy(true);
    setErr('');
    try {
      const le = new Date().toISOString();
      const sceau: SceauPose = { entete: contenu.entete, texte: contenu.texte, couleur: contenu.couleur, docId, ...pose };
      let documents = t.documents ?? [];
      let docVise: string | undefined;
      if (docId) {
        const blob = await getFile(docId);
        if (!blob) throw new Error('Justificatif introuvable : vérifie la connexion.');
        const out = await apposerSceau(blob, await renderSceau(contenu), pose);
        docVise = uid('d');
        await saveFile(docVise, out);
        documents = [{ id: docVise, nom: `${g.vise} – ${t.titre}.jpg`, kind: 'fichier', mime: 'image/jpeg', taille: out.size, par: user.id, le }, ...documents];
      }
      save(t, { etat: 'valide', validation: { par: user.id, le, signature: png, sceau, docVise } }, `Visé et signé : « ${t.titre} » (${chf(p.montant)})`, { documents });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`Viser ${g.ce}`} onClose={onClose} wide>
      <p>
        <strong>{t.titre}</strong> · {chf(p.montant)}<br />
        <small className="muted">{g.a} {p.beneficiaire}{p.iban ? ` · ${p.iban}` : ''} · demandé par {demandeur(data, p)}{p.visa?.message ? ` · « ${p.visa.message} »` : ''}</small>
      </p>
      <div className="visa-grid">
        <div>
          {images.length > 1 && (
            <select value={docId} onChange={(e) => setDocId(e.target.value)} aria-label="Justificatif">
              {images.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
          )}
          {docId ? (
            <>
              <div className="sceau-zone" ref={zone}>
                <DocImage key={docId} id={docId} onLoad={loaded} />
                <div
                  className="sceau-drag"
                  style={{ left: `${pose.x * 100}%`, top: `${pose.y * 100}%`, width: `${pose.largeur * 100}%` }}
                  onPointerDown={down}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={up}
                  title="Glisser pour placer le sceau"
                >
                  <SceauImg c={contenu} />
                </div>
              </div>
              <label className="small sceau-taille">
                Taille du sceau
                <input type="range" min={20} max={90} value={Math.round(pose.largeur * 100)} onChange={(e) => setPose(clamp({ ...pose, largeur: +e.target.value / 100 }))} />
              </label>
              <small className="muted">Glisse le sceau sur une zone libre {g.duDoc}.</small>
            </>
          ) : (
            <>
              <Justificatifs docs={t.documents ?? []} />
              <p className="muted small">Le justificatif n’est pas une photo : le sceau figurera sur le bon de paiement.</p>
              <SceauImg c={contenu} />
            </>
          )}
        </div>
        <div>
          <label className="small">
            Texte du sceau
            <input value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={30} />
          </label>
          <p className="small">En signant, <strong>{fullName(user ?? undefined)}</strong> donne son accord pour {g.accord} de <strong>{chf(p.montant)}</strong> à {p.beneficiaire}.</p>
          <SignaturePad onChange={setPng} />
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!png || busy} onClick={viser}>{busy ? 'Enregistrement…' : '✍️ Viser et signer'}</button>
      </div>
    </Modal>
  );
}

const CENTRALE = '__caisse-centrale__';
const AUTRE = '__autre__';

/** Nouvelle demande (remboursement ou paiement de facture) ou modification, tant que la caisse ne l'a pas fait viser. */
export function TicketForm({ ticket, type, onClose, onEnvoye }: { ticket?: Ticket; type?: GenreTicket; onClose: () => void; onEnvoye?: () => void }) {
  const { data, user, update, guest, cloud } = useStore();
  const club = useClubOptional();
  const genreT: GenreTicket = ticket ? genreDe(ticket.paiement) : (type ?? 'remboursement');
  const facture = genreT === 'facture';
  const g = GENRES[genreT];
  // Caisse destinataire : celle de l'entité ouverte, celle d'une autre entité dont on est membre (le ticket y est créé),
  // ou la caisse centrale pour qui n'est pas du comité central ; seulement là où un caissier est désigné.
  const nomsCaisse = caissiers(data).map((p) => fullName(p));
  const ici = !guest && nomsCaisse.length > 0;
  const autres = club && !ticket ? club.mine.filter((u) => u.id !== club.current.id && u.membres.some((m) => m.caisse)) : [];
  const central = club?.central;
  const centrale = !ticket && !!central && !central.moi && central.id !== club?.current.id && central.membres.some((m) => m.caisse);
  const [vers, setVers] = useState<'ici' | 'centrale'>(!ici && centrale ? 'centrale' : 'ici');
  const versCentrale = vers === 'centrale' && centrale;
  const bloque = !ticket && !(versCentrale || ici);
  const [titre, setTitre] = useState(ticket?.titre ?? '');
  const [montant, setMontant] = useState(ticket ? String(ticket.paiement.montant) : '');
  // Remboursement : soi-même par défaut ; facture : le créancier, à saisir.
  const [beneficiaire, setBeneficiaire] = useState(ticket?.paiement.beneficiaire ?? (facture ? '' : fullName(user ?? undefined)));
  const [echeance, setEcheance] = useState(ticket?.delai ?? '');
  const [iban, setIban] = useState(ticket?.paiement.iban ?? '');
  const [remarque, setRemarque] = useState(ticket?.remarque ?? '');
  const [docs, setDocsState] = useState<TaskDoc[]>(ticket?.documents ?? []);
  const setDocs = (fn: (d: TaskDoc[]) => TaskDoc[]) => setDocsState(fn);
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // « À rembourser à » : soi-même, une personne de l'entité, ou un autre nom saisi.
  const moiNom = fullName(user ?? undefined);
  const noms = [...new Set(data.people.filter((p) => p.actif).map((p) => fullName(p)))]
    .filter((n) => n && n !== moiNom)
    .sort((a, b) => a.localeCompare(b, 'fr'));
  const [autreNom, setAutreNom] = useState(() => !facture && !!beneficiaire && beneficiaire !== moiNom && !noms.includes(beneficiaire));
  // Organigramme chargé après l'ouverture du formulaire : la caisse centrale reste le choix d'office d'une entité sans caissier.
  useEffect(() => {
    if (!ici && centrale && vers === 'ici' && !docs.length) setVers('centrale');
  }, [ici, centrale]);

  const cancel = () => {
    deleteFiles(track.current.added);
    onClose();
  };
  const choisirCaisse = (id: string) => {
    if (!club) return;
    if (id === CENTRALE || id === club.current.id) {
      const v = id === CENTRALE ? 'centrale' : 'ici';
      if (v === vers) return;
      // Les photos déjà ajoutées sont dans le dossier de l'autre caisse : on les retire.
      deleteFiles(track.current.added);
      track.current.added = [];
      setDocsState([]);
      setVers(v);
      return;
    }
    deleteFiles(track.current.added);
    club.switchUnit(id, `#/taches?nouveau=${facture ? 'paiement' : 'remboursement'}`);
  };
  const submit = () => {
    if (bloque) return setErr('Choisis la caisse à laquelle envoyer la demande.');
    const m = parseMontant(montant);
    if (!titre.trim()) return setErr(facture ? 'Indique l’objet de la facture.' : 'Indique l’objet de la dépense.');
    if (!(m > 0)) return setErr('Indique le montant (ex. 42.50).');
    if (!beneficiaire.trim()) return setErr(facture ? 'Indique à qui payer la facture (qui l’a envoyée).' : 'Indique à qui rembourser.');
    if (!docs.length) return setErr(facture ? 'Ajoute la facture (photo ou PDF).' : 'Ajoute la photo du ticket (ou le fichier).');
    if (!user || busy) return;
    if (versCentrale && club) {
      setBusy(true);
      club
        .ticketCentral({ type: facture ? 'facture' : undefined, delai: facture && echeance ? echeance : undefined, titre: titre.trim(), montant: m, beneficiaire: beneficiaire.trim(), iban: iban.trim().toUpperCase() || undefined, remarque: remarque.trim(), documents: docs })
        .then(() => {
          deleteFiles(track.current.removed);
          onEnvoye?.();
          onClose();
        })
        .catch((e: Error) => setErr(e.message))
        .finally(() => setBusy(false));
      return;
    }
    const now = new Date().toISOString();
    const paiement: Paiement = {
      ...(facture ? { type: 'facture' as const } : {}),
      montant: m,
      beneficiaire: beneficiaire.trim(),
      etat: 'recu',
      demandePar: ticket?.paiement.demandePar ?? user.id,
      demandeLe: ticket?.paiement.demandeLe ?? now,
    };
    if (ticket?.paiement.externe) paiement.externe = ticket.paiement.externe;
    if (iban.trim()) paiement.iban = iban.trim().toUpperCase();
    const t = {
      ...(ticket ?? { id: uid('t'), sectionId: sectionFinances(data), sousSection: g.sous, delai: '', checklist: [], createdBy: user.id }),
      ...(facture ? { delai: echeance } : {}),
      titre: titre.trim(),
      remarque: remarque.trim(),
      documents: docs,
      paiement,
      responsables: [],
      statusId: statutPour(data, 'recu'),
      termineeLe: undefined,
      updatedAt: now,
    } as Ticket;
    t.responsables = responsablesPour(data, t);
    const label = `« ${t.titre} » (${paiement.montant.toFixed(2)} CHF)`;
    update((d) => {
      if (ticket) d.tasks = d.tasks.map((x) => (x.id === t.id ? t : x));
      else d.tasks.unshift(t);
    }, ticket ? (ticket.paiement.etat === 'refuse' ? `Corrigé et renvoyé à la caisse : ${label}` : `Modification : ${g.nom.toLowerCase()} ${label}`) : `${g.nom} ${label}`);
    deleteFiles(track.current.removed);
    onClose();
  };

  const options = club && !ticket ? [...(ici ? [club.current] : []), ...autres] : [];
  const choix = options.length + (centrale ? 1 : 0);
  const caisseCentrale = central ? central.membres.filter((m) => m.caisse).map((m) => `${m.prenom} ${m.nom}`.trim()) : [];
  const note = ticket
    ? ''
    : versCentrale
      ? `Caisse centrale (${central!.nom}) : ${caisseCentrale.join(', ')}. Tu en suivras l’état dans « Mes tâches » (Envoyés à la caisse centrale).`
      : ici
        ? `${club ? `Caisse ${club.current.nom}` : 'Caisse'} : ${nomsCaisse.join(', ')}.`
        : `${guest ? 'Tu consultes cette entité en visiteur.' : `${club?.current.nom ?? 'Cette entité'} n’a pas encore de caissier (rôle « Caissier » à attribuer par un admin, dans « Responsables »).`} ${
            choix ? 'Envoie ta demande à l’une des caisses proposées.' : 'Aucune caisse ne peut recevoir ta demande pour l’instant.'
          }`;

  return (
    <Modal title={ticket ? `Modifier ${g.ce}` : `${g.icon} ${g.nouveau}`} onClose={cancel}>
      <div className="form">
        {!ticket && (
          <p className="small full genre-note">
            {facture
              ? 'Facture à payer directement à qui l’a envoyée (fournisseur, prestataire…) : ajoute la facture (photo ou PDF).'
              : 'Pour rembourser une personne qui a avancé de l’argent : ajoute la photo du ticket de caisse.'}
          </p>
        )}
        {club && (choix > 1 || (choix === 1 && bloque)) && (
          <label className="full">
            Envoyer à la caisse de
            <select value={versCentrale ? CENTRALE : ici ? club.current.id : ''} onChange={(e) => choisirCaisse(e.target.value)}>
              {bloque && <option value="" disabled>Choisir la caisse…</option>}
              {options.map((u) => <option key={u.id} value={u.id}>{UNIT_TYPES[u.type].icon} {u.nom}</option>)}
              {centrale && <option value={CENTRALE}>🏛️ Caisse centrale ({central!.nom})</option>}
            </select>
            {choix > 1 && <small className="muted">À choisir avant d’ajouter la photo.</small>}
          </label>
        )}
        {note && <p className="muted small full">{note}</p>}
        <DocsField docs={docs} setDocs={setDocs} disabled={bloque} track={track.current} idPrefix={versCentrale ? (cloud ? `${central!.id}/tk-` : 'tk-') : undefined} />
        <label className="full">
          {facture ? 'Objet de la facture' : 'Objet de la dépense'}
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={facture ? 'Ex. Impression des affiches' : 'Ex. Courses pour le camp'} />
        </label>
        <label>
          Montant (CHF)
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0.00" />
        </label>
        {facture ? (
          <label>
            À payer à
            <input value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} placeholder="Qui a envoyé la facture" />
          </label>
        ) : (
          <label>
            À rembourser à
            <select
              value={autreNom ? AUTRE : beneficiaire}
              onChange={(e) => {
                const v = e.target.value;
                setAutreNom(v === AUTRE);
                setBeneficiaire(v === AUTRE ? '' : v);
              }}
            >
              {moiNom && <option value={moiNom}>Moi ({moiNom})</option>}
              {noms.map((n) => <option key={n} value={n}>{n}</option>)}
              {!moiNom && !noms.includes(beneficiaire) && !autreNom && <option value={beneficiaire}>{beneficiaire || 'Choisir…'}</option>}
              <option value={AUTRE}>Autre personne (saisir le nom)…</option>
            </select>
            {autreNom && <input autoFocus value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} placeholder="Prénom et nom" />}
          </label>
        )}
        <label className={facture ? '' : 'full'}>
          {facture ? 'IBAN (s’il n’est pas sur la facture)' : 'IBAN (facultatif)'}
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="CH.." autoCapitalize="characters" />
        </label>
        {facture && (
          <label>
            Échéance (facultatif)
            <input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </label>
        )}
        <label className="full">
          Remarque (facultatif)
          <textarea rows={2} value={remarque} onChange={(e) => setRemarque(e.target.value)} />
        </label>
        {err && <p className="error full">{err}</p>}
      </div>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={cancel}>Annuler</button>
        <button className="btn primary" disabled={bloque || busy} onClick={submit}>
          {busy ? 'Envoi…' : ticket?.paiement.etat === 'refuse' ? 'Renvoyer' : ticket ? 'Enregistrer' : 'Envoyer à la caisse'}
        </button>
      </div>
    </Modal>
  );
}
