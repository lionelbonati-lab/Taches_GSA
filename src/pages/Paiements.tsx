import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import type { Paiement, Task, TaskDoc } from '../data/types';
import { ETATS, chf, nomDe, paiementTasks, responsablesPour, sectionFinances, statutPour } from '../data/paiements';
import { deleteFiles, docIcon, openFile } from '../data/files';
import { fmtDateTime, fullName, today, uid } from '../data/utils';
import { DocsField, Thumb, type DocTracking } from '../components/DocsField';
import { SignaturePad } from '../components/SignaturePad';
import { Empty, Modal } from '../components/ui';

type Ticket = Task & { paiement: Paiement };
type Onglet = 'avalider' | 'apayer' | 'payes' | 'refuses' | 'miens';

const parseMontant = (s: string) => {
  const n = parseFloat(s.replace(/['’\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Tickets à rembourser : photo du ticket → validation signée → virement fait par la caisse (hors appli) → « OK ». */
export function Paiements() {
  const { data, user, can } = useStore();
  const [params, setParams] = useSearchParams();
  const focus = params.get('p');
  const [form, setForm] = useState<Ticket | 'nouveau' | null>(null);
  const valideur = can('paiements.valider');
  const caisse = can('paiements.payer');
  const tous = paiementTasks(data).filter((t) => valideur || caisse || t.paiement.demandePar === user?.id);
  const par = (e: Paiement['etat']) => tous.filter((t) => t.paiement.etat === e);
  const miens = tous.filter((t) => t.paiement.demandePar === user?.id);
  const [onglet, setOnglet] = useState<Onglet>(() =>
    valideur && par('a_valider').length ? 'avalider' : caisse && par('valide').length ? 'apayer' : valideur || caisse ? 'avalider' : 'miens',
  );

  // Raccourci de l'icône : « Ticket à rembourser » ouvre directement le formulaire.
  useEffect(() => {
    if (params.has('nouveau')) {
      setForm('nouveau');
      params.delete('nouveau');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const focused = tous.find((t) => t.id === focus);
  const list = focused
    ? [focused]
    : onglet === 'avalider' ? par('a_valider') : onglet === 'apayer' ? par('valide') : onglet === 'payes' ? par('paye') : onglet === 'refuses' ? par('refuse') : miens;
  const total = list.reduce((s, t) => s + t.paiement.montant, 0);
  const tab = (id: Onglet, label: string, n: number) => (
    <button className={onglet === id ? 'on' : ''} onClick={() => setOnglet(id)}>{label} ({n})</button>
  );

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
            Photographie ton ticket : {valideur ? 'tu le valides en signant' : 'un responsable le valide en signant'}, puis la caisse fait le virement et le marque « OK ». Le paiement lui-même ne passe pas par l’appli.
          </p>
          <div className="seg wrap no-print">
            {(valideur || caisse) && tab('avalider', 'À valider', par('a_valider').length)}
            {(valideur || caisse) && tab('apayer', 'À payer', par('valide').length)}
            {(valideur || caisse) && tab('payes', 'Payés', par('paye').length)}
            {(valideur || caisse) && tab('refuses', 'Refusés', par('refuse').length)}
            {tab('miens', 'Mes tickets', miens.length)}
          </div>
          {list.length > 1 && <p className="muted small">Total : <strong>{chf(total)}</strong></p>}
        </>
      )}
      <div className="tickets">
        {list.map((t) => <TicketCard key={t.id} t={t} onEdit={() => setForm(t)} />)}
        {list.length === 0 && (
          <Empty>{onglet === 'avalider' ? 'Aucun ticket n’attend de validation.' : onglet === 'apayer' ? 'Aucun virement à faire.' : 'Aucun ticket.'}</Empty>
        )}
      </div>
      {form && <TicketForm ticket={form === 'nouveau' ? undefined : form} onClose={() => setForm(null)} />}
    </div>
  );
}

function TicketCard({ t, onEdit }: { t: Ticket; onEdit: () => void }) {
  const { data, user, can, update } = useStore();
  const [, setParams] = useSearchParams();
  const [signer, setSigner] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const p = t.paiement;
  const valideur = can('paiements.valider');
  const caisse = can('paiements.payer');
  const mien = p.demandePar === user?.id;
  const save = useSaveTicket();
  const now = () => new Date().toISOString();

  const imprimer = () => {
    setParams({ p: t.id });
    setTimeout(() => window.print(), 300);
  };
  const supprimer = () => {
    if (!confirm(`Supprimer le ticket « ${t.titre} » ?`)) return;
    update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); }, `Suppression du ticket « ${t.titre} » (${chf(p.montant)})`);
    deleteFiles((t.documents ?? []).filter((d) => d.kind === 'fichier').map((d) => d.id));
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
      </dl>
      <Justificatifs docs={t.documents ?? []} />
      {p.validation && (
        <div className="ticket-visa">
          <img src={p.validation.signature} alt={`Signature de ${nomDe(data, p.validation.par)}`} />
          <small>Validé par <strong>{nomDe(data, p.validation.par)}</strong> · {fmtDateTime(p.validation.le)}</small>
        </div>
      )}
      {p.refus && p.etat === 'refuse' && (
        <p className="ticket-refus">❌ Refusé par {nomDe(data, p.refus.par)} · {fmtDateTime(p.refus.le)}{p.refus.motif && <> — « {p.refus.motif} »</>}</p>
      )}
      {p.paye && p.etat === 'paye' && (
        <p className="ticket-ok">✅ Virement fait par {nomDe(data, p.paye.par)} · {fmtDateTime(p.paye.le)}{p.paye.remarque && <> — {p.paye.remarque}</>}</p>
      )}

      {refus !== null && (
        <div className="ticket-inline no-print">
          <input autoFocus placeholder="Motif du refus (facultatif)" value={refus} onChange={(e) => setRefus(e.target.value)} />
          <button className="btn small danger" onClick={() => save(t, { etat: 'refuse', refus: { par: user!.id, le: now(), motif: refus.trim() || '' } }, `Ticket « ${t.titre} » refusé`)}>Refuser</button>
          <button className="btn small" onClick={() => setRefus(null)}>Annuler</button>
        </div>
      )}
      {ok !== null && (
        <div className="ticket-inline no-print">
          <input autoFocus placeholder="Remarque (facultatif), ex. date du virement" value={ok} onChange={(e) => setOk(e.target.value)} />
          <button className="btn small primary" onClick={() => save(t, { etat: 'paye', paye: { par: user!.id, le: now(), remarque: ok.trim() || undefined } }, `Ticket « ${t.titre} » payé (${chf(p.montant)})`)}>Confirmer : virement fait</button>
          <button className="btn small" onClick={() => setOk(null)}>Annuler</button>
        </div>
      )}

      <div className="ticket-actions no-print">
        {p.etat === 'a_valider' && valideur && <button className="btn primary" onClick={() => setSigner(true)}>✍️ Valider et signer</button>}
        {p.etat === 'a_valider' && valideur && refus === null && <button className="btn" onClick={() => setRefus('')}>Refuser</button>}
        {p.etat === 'valide' && caisse && ok === null && <button className="btn primary" onClick={() => setOk('')}>✅ Virement fait (OK)</button>}
        {(p.etat === 'a_valider' || p.etat === 'refuse') && (mien || valideur) && (
          <button className="btn" onClick={onEdit}>{p.etat === 'refuse' && mien ? 'Corriger et renvoyer' : 'Modifier'}</button>
        )}
        {(p.etat === 'a_valider' || p.etat === 'refuse') && (mien || valideur) && <button className="btn danger" onClick={supprimer}>Supprimer</button>}
        {(p.etat === 'valide' || p.etat === 'paye') && <button className="btn" onClick={imprimer}>🖨 Bon de paiement</button>}
        {p.etat === 'valide' && valideur && (
          <button className="btn link" onClick={() => confirm('Retirer ta validation ? Le ticket revient « à valider ».') && save(t, { etat: 'a_valider', validation: undefined }, `Validation retirée : ticket « ${t.titre} »`)}>Retirer la validation</button>
        )}
        {p.etat === 'paye' && caisse && (
          <button className="btn link" onClick={() => confirm('Le virement n’a pas été fait ? Le ticket revient « à payer ».') && save(t, { etat: 'valide', paye: undefined }, `Ticket « ${t.titre} » remis « à payer »`)}>Annuler « payé »</button>
        )}
      </div>
      {signer && <SignModal t={t} onClose={() => setSigner(false)} />}
    </article>
  );
}

/** Enregistre un changement d'état : statut de la tâche et responsables suivent (validateurs → caisse → plus personne). */
function useSaveTicket() {
  const { data, update } = useStore();
  return (t: Ticket, patch: Partial<Paiement>, msg: string) => {
    const paiement: Paiement = { ...t.paiement, ...patch };
    (Object.keys(patch) as (keyof Paiement)[]).forEach((k) => patch[k] === undefined && delete paiement[k]);
    const next: Ticket = { ...t, paiement, statusId: statutPour(data, paiement.etat), updatedAt: new Date().toISOString() };
    next.responsables = responsablesPour(data, next);
    next.termineeLe = paiement.etat === 'paye' || paiement.etat === 'refuse' ? today() : undefined;
    update((d) => { d.tasks = d.tasks.map((x) => (x.id === t.id ? next : x)); }, msg);
  };
}

function Justificatifs({ docs }: { docs: TaskDoc[] }) {
  if (!docs.length) return <p className="muted small">Aucun justificatif.</p>;
  const open = (d: TaskDoc) => (d.kind === 'lien' ? window.open(d.url, '_blank', 'noopener') : openFile(d.id, d.nom));
  return (
    <div className="ticket-docs">
      {docs.map((d) => (
        <button key={d.id} type="button" className="ticket-doc" onClick={() => open(d)} title={d.nom}>
          {d.kind === 'fichier' && d.mime?.startsWith('image/') ? <Thumb id={d.id} /> : <span className="doc-icon">{docIcon(d)}</span>}
          <small>{d.nom}</small>
        </button>
      ))}
    </div>
  );
}

function SignModal({ t, onClose }: { t: Ticket; onClose: () => void }) {
  const { data, user } = useStore();
  const save = useSaveTicket();
  const [png, setPng] = useState<string>();
  const p = t.paiement;
  const valider = () => {
    if (!png || !user) return;
    save(t, { etat: 'valide', validation: { par: user.id, le: new Date().toISOString(), signature: png }, refus: undefined }, `Ticket « ${t.titre} » validé et signé (${chf(p.montant)})`);
    onClose();
  };
  return (
    <Modal title="Valider le ticket" onClose={onClose}>
      <p>
        <strong>{t.titre}</strong> · {chf(p.montant)}<br />
        <small className="muted">À rembourser à {p.beneficiaire}{p.iban ? ` · ${p.iban}` : ''} · demandé par {nomDe(data, p.demandePar)}</small>
      </p>
      <Justificatifs docs={t.documents ?? []} />
      <p className="small">En signant, <strong>{fullName(user ?? undefined)}</strong> autorise la caisse à rembourser <strong>{chf(p.montant)}</strong>.</p>
      <SignaturePad onChange={setPng} />
      <div className="modal-foot">
        <span className="grow" />
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn primary" disabled={!png} onClick={valider}>✍️ Valider et signer</button>
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
      iban: iban.trim().toUpperCase() || undefined,
      etat: 'a_valider',
      demandePar: ticket?.paiement.demandePar ?? user.id,
      demandeLe: ticket?.paiement.demandeLe ?? now,
    };
    if (!paiement.iban) delete paiement.iban;
    const t: Ticket = {
      ...(ticket ?? { id: uid('t'), sectionId: sectionFinances(data), sousSection: 'Remboursements', delai: '', checklist: [], createdBy: user.id }),
      titre: titre.trim(),
      remarque: remarque.trim(),
      documents: docs,
      paiement,
      responsables: [],
      statusId: statutPour(data, 'a_valider'),
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
        <button className="btn primary" onClick={submit}>{ticket?.paiement.etat === 'refuse' ? 'Renvoyer' : ticket ? 'Enregistrer' : 'Envoyer pour validation'}</button>
      </div>
    </Modal>
  );
}
