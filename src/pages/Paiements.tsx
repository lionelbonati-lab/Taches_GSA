import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { AppData, Paiement, SceauPose, Task, TaskDoc, Timbre } from '../data/types';
import {
  COULEURS_TIMBRE, ETATS, chf, nomDe, paiementTasks, responsablesPour, sectionFinances, signataires, statutPour, timbreDe, type Ticket,
} from '../data/paiements';
import { SCEAU_RATIO, apposerSceau, renderSceau, type SceauContenu } from '../data/sceau';
import { deleteFiles, docIcon, getFile, openFile, saveFile } from '../data/files';
import { fmtDate, fmtDateTime, fullName, today, uid } from '../data/utils';
import { DocsField, Thumb, type DocTracking } from '../components/DocsField';
import { SignaturePad } from '../components/SignaturePad';
import { Empty, Modal } from '../components/ui';

type Onglet = 'atraiter' | 'visa' | 'aviser' | 'apayer' | 'payes' | 'refuses' | 'miens';

const parseMontant = (s: string) => {
  const n = parseFloat(s.replace(/['’\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Tickets à rembourser : photo du ticket → caisse → visa (signature et sceau) → virement fait par la caisse → « OK ». */
export function Paiements() {
  const { data, user, can } = useStore();
  const [params, setParams] = useSearchParams();
  const focus = params.get('p');
  const [form, setForm] = useState<Ticket | 'nouveau' | null>(null);
  const caisse = can('paiements.payer');
  const moi = user?.id;
  const tous = paiementTasks(data).filter(
    (t) => caisse || t.paiement.demandePar === moi || t.paiement.visa?.a === moi || t.paiement.validation?.par === moi,
  );
  const par = (e: Paiement['etat']) => tous.filter((t) => t.paiement.etat === e);
  const aViser = par('visa').filter((t) => t.paiement.visa?.a === moi);
  const miens = tous.filter((t) => t.paiement.demandePar === moi);
  const [onglet, setOnglet] = useState<Onglet>(() =>
    aViser.length ? 'aviser' : caisse && !par('recu').length && par('valide').length ? 'apayer' : caisse ? 'atraiter' : 'miens',
  );

  // Raccourci de l'icône : « Ticket à rembourser » ouvre directement le formulaire.
  useEffect(() => {
    if (params.has('nouveau')) {
      setForm('nouveau');
      params.delete('nouveau');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const listes: Record<Onglet, Ticket[]> = {
    atraiter: par('recu'),
    visa: par('visa'),
    aviser: aViser,
    apayer: par('valide'),
    payes: par('paye'),
    refuses: par('refuse'),
    miens,
  };
  const focused = tous.find((t) => t.id === focus);
  const list = focused ? [focused] : listes[onglet];
  const total = list.reduce((s, t) => s + t.paiement.montant, 0);
  const tab = (id: Onglet, label: string) => (
    <button key={id} className={onglet === id ? 'on' : ''} onClick={() => setOnglet(id)}>{label} ({listes[id].length})</button>
  );
  const vide: Partial<Record<Onglet, string>> = {
    atraiter: 'Aucun ticket à traiter.',
    aviser: 'Aucun visa ne t’est demandé.',
    apayer: 'Aucun virement à faire.',
  };

  return (
    <div className="narrow-wide">
      <div className="page-head no-print">
        <h1>Paiements</h1>
        <button className="btn primary" onClick={() => setForm('nouveau')}>📷 Nouveau ticket</button>
      </div>
      {focused ? (
        <p className="no-print"><a href="#/paiements">← Tous les tickets</a></p>
      ) : (
        <>
          <p className="muted small no-print">
            1. Photo du ticket → 2. la caisse le reçoit et demande le visa à une autre personne que le demandeur → 3. visa : signature et sceau « {timbreDe(data).texte} » posés sur le ticket → 4. la caisse fait le virement et met « OK ». Le paiement lui-même ne passe pas par l’appli.
          </p>
          <div className="seg wrap no-print">
            {(aViser.length > 0 || !caisse) && tab('aviser', 'À viser')}
            {caisse && tab('atraiter', 'À traiter')}
            {caisse && tab('visa', 'Visa en cours')}
            {caisse && tab('apayer', 'À payer')}
            {caisse && tab('payes', 'Payés')}
            {caisse && tab('refuses', 'Refusés')}
            {tab('miens', 'Mes tickets')}
          </div>
          {caisse && <TimbreReglage />}
          {list.length > 1 && <p className="muted small">Total : <strong>{chf(total)}</strong></p>}
        </>
      )}
      <div className="tickets">
        {list.map((t) => <TicketCard key={t.id} t={t} onEdit={() => setForm(t)} />)}
        {list.length === 0 && <Empty>{vide[onglet] ?? 'Aucun ticket.'}</Empty>}
      </div>
      {form && <TicketForm ticket={form === 'nouveau' ? undefined : form} onClose={() => setForm(null)} />}
    </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [, setParams] = useSearchParams();
  const [viser, setViser] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [demande, setDemande] = useState(false);
  const p = t.paiement;
  const caisse = can('paiements.payer');
  const moi = user?.id;
  const mien = p.demandePar === moi;
  const pourMoi = p.etat === 'visa' && p.visa?.a === moi && !mien;
  const save = useSaveTicket();
  const now = () => new Date().toISOString();
  const sceau = sceauDe(data, t);

  const [msg, setMsg] = useState('');
  // Document fini (ticket avec le sceau) : téléchargé par la caisse pour la comptabilité.
  const telecharger = async () => {
    const nom = `Ticket visé - ${t.titre} - ${chf(p.montant)}.jpg`;
    setMsg((await openFile(p.validation!.docVise!, nom, true)) ? '' : 'Fichier introuvable (vérifie la connexion).');
  };
  const imprimer = () => {
    setParams({ p: t.id });
    setTimeout(() => window.print(), 400);
  };
  const supprimer = () => {
    if (!confirm(`Supprimer le ticket « ${t.titre} » ?`)) return;
    update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); }, `Suppression du ticket « ${t.titre} » (${chf(p.montant)})`);
    deleteFiles((t.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id));
  };
  // Visa retiré : le ticket revient à la caisse, sans la copie visée.
  const retirerVisa = () => {
    if (!confirm('Retirer le visa ? Le ticket revient à la caisse, qui pourra redemander un visa.')) return;
    const vise = p.validation?.docVise;
    save(t, { etat: 'recu', visa: undefined, validation: undefined }, `Visa retiré : ticket « ${t.titre} »`, { documents: (t.documents ?? []).filter((d) => d.id !== vise) });
    if (vise) deleteFiles([vise]);
  };

  return (
    <article className={`card ticket etat-${p.etat}`} id={`ticket-${t.id}`}>
      <header className="ticket-head">
        <div>
          <h3>{t.titre}</h3>
          <small className="muted">Demandé par {nomDe(data, p.demandePar)} · {fmtDateTime(p.demandeLe)}</small>
        </div>
        <div className="ticket-montant">
          <strong>{chf(p.montant)}</strong>
          <span className={`badge ticket-etat ${p.etat}`}>{ETATS[p.etat].icon} {ETATS[p.etat].label}</span>
        </div>
      </header>
      <dl className="ticket-infos">
        <dt>À rembourser à</dt><dd>{p.beneficiaire}</dd>
        {p.iban && <><dt>IBAN</dt><dd className="mono">{p.iban}</dd></>}
        {t.remarque && <><dt>Remarque</dt><dd>{t.remarque}</dd></>}
        {p.visa && (p.etat === 'visa' || p.validation) && (
          <><dt>Visa</dt><dd>demandé à <strong>{nomDe(data, p.visa.a)}</strong> par {nomDe(data, p.visa.par)} · {fmtDateTime(p.visa.le)}{p.visa.message && <> — « {p.visa.message} »</>}</dd></>
        )}
      </dl>
      <Justificatifs docs={t.documents ?? []} vise={p.validation?.docVise} />
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
      {pourMoi && <p className="ticket-alerte no-print">✍️ La caisse te demande de viser ce ticket.</p>}

      {demande && <DemandeVisa t={t} onClose={() => setDemande(false)} />}
      {refus !== null && (
        <div className="ticket-inline no-print">
          <input autoFocus placeholder="Motif du refus" value={refus} onChange={(e) => setRefus(e.target.value)} />
          <button className="btn small danger" onClick={() => save(t, { etat: 'refuse', refus: { par: moi!, le: now(), motif: refus.trim() } }, `Ticket « ${t.titre} » refusé`)}>Refuser</button>
          <button className="btn small" onClick={() => setRefus(null)}>Annuler</button>
        </div>
      )}
      {ok !== null && (
        <div className="ticket-inline no-print">
          <input autoFocus placeholder="Remarque (facultatif), ex. date du virement" value={ok} onChange={(e) => setOk(e.target.value)} />
          <button className="btn small primary" onClick={() => save(t, { etat: 'paye', paye: { par: moi!, le: now(), remarque: ok.trim() || undefined } }, `Ticket « ${t.titre} » payé (${chf(p.montant)})`)}>Confirmer : virement fait</button>
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
        {(p.etat === 'valide' || p.etat === 'paye') && p.validation?.docVise && <button className="btn" onClick={telecharger}>⬇️ Télécharger le ticket visé</button>}
        {(p.etat === 'valide' || p.etat === 'paye') && <button className="btn" onClick={imprimer}>🖨 Bon de paiement</button>}
        {p.etat === 'valide' && (caisse || p.validation?.par === moi) && <button className="btn link" onClick={retirerVisa}>Retirer le visa</button>}
        {p.etat === 'paye' && caisse && (
          <button className="btn link" onClick={() => confirm('Le virement n’a pas été fait ? Le ticket revient « à payer ».') && save(t, { etat: 'valide', paye: undefined }, `Ticket « ${t.titre} » remis « à payer »`)}>Annuler « payé »</button>
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
    save(t, { etat: 'visa', visa: { a, par: user.id, le: new Date().toISOString(), message: message.trim() || undefined }, refus: undefined }, `Visa demandé à ${nomDe(data, a)} : ticket « ${t.titre} »`);
    onClose();
  };
  return (
    <div className="ticket-inline demande-visa no-print">
      <label>
        Visa à demander à
        <select value={a} onChange={(e) => setA(e.target.value)}>
          <option value="" disabled>Choisir…</option>
          {autorises.length > 0 && <optgroup label="Peuvent viser">{autorises.map(option)}</optgroup>}
          {autres.length > 0 && <optgroup label="Autres personnes">{autres.map(option)}</optgroup>}
        </select>
      </label>
      <input placeholder="Message (facultatif)" value={message} onChange={(e) => setMessage(e.target.value)} />
      <button className="btn small primary" disabled={!a} onClick={envoyer}>Envoyer la demande</button>
      <button className="btn small" onClick={onClose}>Annuler</button>
      <small className="muted">Le demandeur ({nomDe(data, t.paiement.demandePar)}) ne peut pas viser son propre ticket.</small>
    </div>
  );
}

function Justificatifs({ docs, vise }: { docs: TaskDoc[]; vise?: string }) {
  if (!docs.length) return <p className="muted small">Aucun justificatif.</p>;
  const open = (d: TaskDoc) => (d.kind === 'lien' ? window.open(d.url, '_blank', 'noopener') : openFile(d.id, d.nom));
  const tri = vise ? [...docs].sort((a, b) => (a.id === vise ? -1 : b.id === vise ? 1 : 0)) : docs;
  return (
    <div className={`ticket-docs ${vise ? 'avec-vise' : ''}`}>
      {tri.map((d) => (
        <button key={d.id} type="button" className={`ticket-doc ${d.id === vise ? 'vise' : ''}`} onClick={() => open(d)} title={d.nom}>
          {d.kind === 'fichier' && d.mime?.startsWith('image/') ? <Thumb id={d.id} /> : <span className="doc-icon">{docIcon(d)}</span>}
          <small>{d.id === vise ? '✔ Ticket visé' : d.nom}</small>
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
        documents = [{ id: docVise, nom: `Ticket visé – ${t.titre}.jpg`, kind: 'fichier', mime: 'image/jpeg', taille: out.size, par: user.id, le }, ...documents];
      }
      save(t, { etat: 'valide', validation: { par: user.id, le, signature: png, sceau, docVise } }, `Ticket « ${t.titre} » visé et signé (${chf(p.montant)})`, { documents });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Viser le ticket" onClose={onClose} wide>
      <p>
        <strong>{t.titre}</strong> · {chf(p.montant)}<br />
        <small className="muted">À rembourser à {p.beneficiaire}{p.iban ? ` · ${p.iban}` : ''} · demandé par {nomDe(data, p.demandePar)}{p.visa?.message ? ` · « ${p.visa.message} »` : ''}</small>
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
              <small className="muted">Glisse le sceau sur une zone libre du ticket.</small>
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
          <p className="small">En signant, <strong>{fullName(user ?? undefined)}</strong> donne son accord pour le remboursement de <strong>{chf(p.montant)}</strong>.</p>
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

function TicketForm({ ticket, onClose }: { ticket?: Ticket; onClose: () => void }) {
  const { data, user, update } = useStore();
  const [titre, setTitre] = useState(ticket?.titre ?? '');
  const [montant, setMontant] = useState(ticket ? String(ticket.paiement.montant) : '');
  const [beneficiaire, setBeneficiaire] = useState(ticket?.paiement.beneficiaire ?? fullName(user ?? undefined));
  const [iban, setIban] = useState(ticket?.paiement.iban ?? '');
  const [remarque, setRemarque] = useState(ticket?.remarque ?? '');
  const [docs, setDocsState] = useState<TaskDoc[]>(ticket?.documents ?? []);
  const setDocs = (fn: (d: TaskDoc[]) => TaskDoc[]) => setDocsState(fn);
  const track = useRef<DocTracking>({ added: [], removed: [] });
  const [err, setErr] = useState('');
  const people = data.people.filter((p) => p.actif);

  const cancel = () => {
    deleteFiles(track.current.added);
    onClose();
  };
  const submit = () => {
    const m = parseMontant(montant);
    if (!titre.trim()) return setErr('Indique l’objet de la dépense.');
    if (!(m > 0)) return setErr('Indique le montant (ex. 42.50).');
    if (!beneficiaire.trim()) return setErr('Indique à qui rembourser.');
    if (!docs.length) return setErr('Ajoute la photo du ticket (ou le fichier).');
    if (!user) return;
    const now = new Date().toISOString();
    const paiement: Paiement = {
      montant: m,
      beneficiaire: beneficiaire.trim(),
      etat: 'recu',
      demandePar: ticket?.paiement.demandePar ?? user.id,
      demandeLe: ticket?.paiement.demandeLe ?? now,
    };
    if (iban.trim()) paiement.iban = iban.trim().toUpperCase();
    const t = {
      ...(ticket ?? { id: uid('t'), sectionId: sectionFinances(data), sousSection: 'Remboursements', delai: '', checklist: [], createdBy: user.id }),
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
    }, ticket ? (ticket.paiement.etat === 'refuse' ? `Ticket corrigé et renvoyé ${label}` : `Modification du ticket ${label}`) : `Ticket à rembourser ${label}`);
    deleteFiles(track.current.removed);
    onClose();
  };

  return (
    <Modal title={ticket ? 'Modifier le ticket' : 'Ticket à rembourser'} onClose={cancel}>
      <div className="form">
        <DocsField docs={docs} setDocs={setDocs} disabled={false} track={track.current} />
        <label className="full">
          Objet de la dépense
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Courses pour le camp" />
        </label>
        <label>
          Montant (CHF)
          <input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0.00" />
        </label>
        <label>
          À rembourser à
          <input list="ticket-personnes" value={beneficiaire} onChange={(e) => setBeneficiaire(e.target.value)} />
          <datalist id="ticket-personnes">{people.map((p) => <option key={p.id} value={fullName(p)} />)}</datalist>
        </label>
        <label className="full">
          IBAN (facultatif)
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="CH.." autoCapitalize="characters" />
        </label>
        <label className="full">
          Remarque (facultatif)
          <textarea rows={2} value={remarque} onChange={(e) => setRemarque(e.target.value)} />
        </label>
        {err && <p className="error full">{err}</p>}
      </div>
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={cancel}>Annuler</button>
        <button className="btn primary" onClick={submit}>{ticket?.paiement.etat === 'refuse' ? 'Renvoyer' : ticket ? 'Enregistrer' : 'Envoyer à la caisse'}</button>
      </div>
    </Modal>
  );
}
