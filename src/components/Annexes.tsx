import { Fragment, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { getFile, openFile } from '../data/files';
import { useStore } from '../data/store';
import { apercuPdf, estPdf } from '../data/pdf';
import type { Task, TaskDoc } from '../data/types';
import { DocThumb } from './DocsField';
import { Lien } from './Liens';

// Fichiers liés aux tâches d'un document (PV, ordre du jour), joints à la fin (option « Joindre les fichiers liés ») :
// la liste des annexes, puis les photos et chaque page des PDF en image, 1, 2 ou 4 par page imprimée (photos et PDF
// réglés à part, et au besoin fichier par fichier). Les archives ne copient pas ces images (seulement data-annexe et
// data-page) : elles sont relues à l'affichage (useAnnexesArchive).

/** Pages d'un PDF reproduites au plus (les suivantes : voir le fichier). */
const MAX_PAGES = 30;

export type ParPage = 1 | 2 | 4;
export const PAR_PAGE: ParPage[] = [1, 2, 4];
export const parPageTexte = (n: ParPage) => (n === 1 ? 'pleine page' : `${n} par page`);

/**
 * Mise en page des fichiers joints : photos par page imprimée, pages de PDF par page (lisibles en pleine page ; une
 * photo de ticket tient à 4 par page) et, pour certains fichiers, un autre choix (identifiant → nombre par page).
 */
export interface MiseEnPageAnnexes {
  photos: ParPage;
  pdf: ParPage;
  fichiers?: Record<string, ParPage>;
}
/** Nombre par page d'un fichier : son propre choix, sinon celui des photos ou des PDF. */
export const parPageDe = (mp: MiseEnPageAnnexes, d: TaskDoc): ParPage => mp.fichiers?.[d.id] ?? (estPdf(d) ? mp.pdf : mp.photos);

/** Choix fait pour un fichier (undefined : comme les autres photos ou PDF) ; undefined s'il n'en reste aucun. */
export function avecFormat(fichiers: Record<string, ParPage> | undefined, id: string, n: ParPage | undefined) {
  const f = { ...fichiers };
  if (n) f[id] = n;
  else delete f[id];
  return Object.keys(f).length ? f : undefined;
}

export interface Annexe {
  d: TaskDoc;
  t: Task;
  /** Numéro de l'annexe (1, 2…). */
  n: number;
}

/** Fichier reproductible dans le document : photo ou PDF (les autres sont seulement nommés). */
export const annexeVisible = (d: TaskDoc) => d.kind === 'fichier' && (!!d.mime?.startsWith('image/') || estPdf(d));

/** Reproduite à la fin : photo ou PDF (aussi d'une tâche partagée : ses fichiers se lisent d'ici, 041). */
export const annexeReproduite = (a: Annexe) => annexeVisible(a.d);

/**
 * Fichiers d'une tâche dans un document (ordre du jour, PV) : un justificatif visé (facture, ticket) n'y figure qu'une
 * fois, en copie signée ; l'original reste dans la tâche.
 */
export function docsDuDocument(t: Task): TaskDoc[] {
  const docs = t.documents ?? [];
  const v = t.paiement?.validation;
  const original = v?.docVise && docs.some((d) => d.id === v.docVise) ? v.sceau?.docId : undefined;
  return original ? docs.filter((d) => d.id !== original) : docs;
}

/**
 * Annexes des tâches, dans leur ordre (un fichier lié à deux tâches ne compte qu'une fois), sans celles retirées pour ce
 * document (`exclues` : identifiants des fichiers et liens).
 */
export function annexesDe(tasks: Task[], exclues: string[] = []): Annexe[] {
  const out: Annexe[] = [];
  tasks.forEach((t) =>
    docsDuDocument(t).forEach((d) => !exclues.includes(d.id) && !out.some((a) => a.d.id === d.id) && out.push({ d, t, n: out.length + 1 })),
  );
  return out;
}

/**
 * Choix des fichiers liés joints au document (ordre du jour ou PV d'une séance) : une case par photo, PDF ou lien des
 * tâches du document, cochée s'il est joint, et pour une photo ou un PDF, sa mise en page (comme les autres, ou pleine
 * page, 2 ou 4 par page). `exclues` : ceux retirés ; `note` : précision sous la liste.
 */
export function ChoixAnnexes({ tasks, exclues, onChange, miseEnPage, onFormat, disabled, note }: {
  tasks: Task[];
  exclues: string[];
  onChange: (exclues: string[]) => void;
  miseEnPage?: MiseEnPageAnnexes;
  onFormat?: (id: string, n: ParPage | undefined) => void;
  disabled?: boolean;
  note?: string;
}) {
  const tous = annexesDe(tasks);
  if (!tous.length) return null;
  const joints = tous.filter((a) => !exclues.includes(a.d.id)).length;
  const ids = tous.map((a) => a.d.id);
  return (
    <details className="choix-annexes">
      <summary>
        Fichiers joints : {joints} sur {tous.length}
      </summary>
      <ul>
        {tous.map((a) => (
          <li key={a.d.id}>
            <label title={annexeInfo(a)}>
              <input
                type="checkbox"
                checked={!exclues.includes(a.d.id)}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked ? exclues.filter((x) => x !== a.d.id) : [...exclues, a.d.id])}
              />
              {annexeReproduite(a) ? <DocThumb d={a.d} /> : <span className="doc-icon">{a.d.kind === 'lien' ? '🔗' : '📄'}</span>}
              <span className="choix-annexe-nom">
                {a.d.nom}
                <small className="muted">{a.t.titre}</small>
              </span>
            </label>
            {miseEnPage && onFormat && annexeReproduite(a) && (
              <select
                className="choix-annexe-format"
                aria-label={`Mise en page de « ${a.d.nom} »`}
                value={miseEnPage.fichiers?.[a.d.id] ?? ''}
                disabled={disabled || exclues.includes(a.d.id)}
                onChange={(e) => onFormat(a.d.id, e.target.value ? (Number(e.target.value) as ParPage) : undefined)}
              >
                <option value="">Comme les {estPdf(a.d) ? 'PDF' : 'photos'} ({parPageTexte(estPdf(a.d) ? miseEnPage.pdf : miseEnPage.photos)})</option>
                {PAR_PAGE.map((n) => <option key={n} value={n}>{n === 1 ? 'Pleine page' : `${n} par page`}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="row">
          <button type="button" className="btn small" disabled={joints === tous.length} onClick={() => onChange(exclues.filter((x) => !ids.includes(x)))}>Tous</button>
          <button type="button" className="btn small" disabled={joints === 0} onClick={() => onChange([...new Set([...exclues, ...ids])])}>Aucun</button>
        </div>
      )}
      {note && <small className="muted">{note}</small>}
    </details>
  );
}

/** Précision de la liste des annexes : la tâche, l'adresse d'un lien, où trouver un fichier non reproduit. */
export const annexeInfo = (a: Annexe) =>
  [a.t.titre, a.d.kind === 'lien' ? a.d.url : a.t.source ? `fichier de « ${a.t.source.unite} »` : !annexeVisible(a.d) ? 'fichier à part' : '']
    .filter(Boolean)
    .join(' · ');

/** Noms des documents d'une tâche, avec leur numéro d'annexe (« Devis.pdf (annexe 2), Plan »). */
export const docsTexte = (t: Task, annexes: Annexe[]) =>
  docsDuDocument(t).map((d) => nomAvecAnnexe(d, annexes)).join(', ');
const nomAvecAnnexe = (d: TaskDoc, annexes: Annexe[]) => {
  const n = annexes.find((a) => a.d.id === d.id)?.n;
  return n ? `${d.nom} (annexe ${n})` : d.nom;
};

/**
 * Nom d'un fichier joint dans un document (ordre du jour, PV) : un clic l'ouvre (useOuvrirDocs). Marqué data-doc, sans
 * bouton (retiré des archives) : il s'ouvre aussi depuis un document archivé ou modifié à la main.
 */
function NomFichier({ d, children }: { d: TaskDoc; children: ReactNode }) {
  return <span className="doc-ouvrir" data-doc={d.id} data-nom={d.nom} role="button" tabIndex={0} title="Ouvrir le fichier">{children}</span>;
}

/** « 📎 Devis.pdf (annexe 2), Site du fournisseur » : liens et fichiers s'ouvrent d'un clic. */
export function DocsTache({ t, annexes }: { t: Task; annexes: Annexe[] }) {
  return (
    <>
      📎{' '}
      {docsDuDocument(t).map((d, i) => {
        const nom = nomAvecAnnexe(d, annexes);
        return (
          <Fragment key={d.id}>
            {i > 0 && ', '}
            {d.kind === 'lien' && d.url ? <Lien href={d.url}>{nom}</Lien> : d.kind === 'fichier' ? <NomFichier d={d}>{nom}</NomFichier> : nom}
          </Fragment>
        );
      })}
    </>
  );
}

/** Fichiers nommés dans les documents affichés (data-doc) : ouverts d'un clic ou avec Entrée, sauf pendant la modification à la main. */
export function useOuvrirDocs() {
  const { setToast } = useStore();
  useEffect(() => {
    const ouvrir = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-doc]');
      if (!el || el.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      // Une seule ouverture, même si plusieurs vues écoutent (archive ouverte depuis le PV).
      e.stopImmediatePropagation();
      void openFile(el.dataset.doc ?? '', el.dataset.nom ?? 'fichier').then((ok) => {
        if (!ok) setToast(`⚠️ « ${el.dataset.nom ?? 'Fichier'} » introuvable (retiré depuis, ou pas de connexion).`);
      });
    };
    document.addEventListener('click', ouvrir, true);
    document.addEventListener('keydown', ouvrir, true);
    return () => {
      document.removeEventListener('click', ouvrir, true);
      document.removeEventListener('keydown', ouvrir, true);
    };
  }, [setToast]);
}

/** Numéros des annexes d'une tâche. */
export const numerosDe = (annexes: Annexe[], t: Task) => annexes.filter((a) => a.t.id === t.id).map((a) => a.n);

/** Liste des annexes (partie « Annexes » du document). */
export function ListeAnnexes({ annexes }: { annexes: Annexe[] }) {
  if (!annexes.length) return null;
  return (
    <section className="pv-part">
      <h2>Annexes</h2>
      <ol className="pv-annexes">
        {annexes.map((a) => (
          <li key={a.d.id}>
            {a.d.kind === 'lien' ? <a href={a.d.url} target="_blank" rel="noreferrer">{a.d.nom}</a> : <NomFichier d={a.d}>{a.d.nom}</NomFichier>}
            <span className="odj-meta"> ({annexeInfo(a)})</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Photo ou page de PDF d'une annexe. */
function ImageAnnexe({ d, page, alt }: { d: TaskDoc; page?: number; alt: string }) {
  const [url, setUrl] = useState<string | null>();
  useEffect(() => {
    let actif = true;
    let u: string | undefined;
    (page ? apercuPdf(d.id, page).then((p) => p?.url ?? null) : getFile(d.id).then((b) => (b ? (u = URL.createObjectURL(b)) : null)))
      .then((x) => actif && setUrl(x))
      .catch(() => actif && setUrl(null));
    return () => {
      actif = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [d.id, page]);
  if (url === null) return <p className="pv-empty">Fichier introuvable ou illisible.</p>;
  return <img className="pv-annexe-img" data-annexe={d.id} data-page={page} src={url} alt={alt} />;
}

/**
 * Fichiers joints à la fin du document : photos et pages de PDF, autant par page imprimée que le dit `miseEnPage`
 * (une page ne mélange pas deux mises en page : un fichier en pleine page commence une nouvelle page).
 */
export function PagesAnnexes({ annexes, miseEnPage }: { annexes: Annexe[]; miseEnPage: MiseEnPageAnnexes }) {
  const fichiers = annexes.filter(annexeReproduite);
  // Nombre de pages de chaque PDF (null : illisible ou introuvable).
  const [pages, setPages] = useState<Record<string, number | null>>({});
  const cle = fichiers.map((a) => a.d.id).join();
  useEffect(() => {
    let actif = true;
    fichiers
      .filter((a) => estPdf(a.d))
      .forEach((a) => apercuPdf(a.d.id).then((p) => actif && setPages((x) => ({ ...x, [a.d.id]: p?.pages || null }))));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  if (!fichiers.length) return null;

  // Une case par photo et par page de PDF, dans l'ordre des annexes.
  type Case = { key: string; a: Annexe; page?: number; total?: number; note?: string };
  const cases: Case[] = [];
  for (const a of fichiers) {
    if (!estPdf(a.d)) cases.push({ key: a.d.id, a });
    else if (pages[a.d.id] === undefined) cases.push({ key: a.d.id, a, note: 'Chargement du PDF…' });
    else if (pages[a.d.id] === null) cases.push({ key: a.d.id, a, note: 'PDF illisible ou introuvable : voir le fichier.' });
    else {
      const total = pages[a.d.id]!;
      for (let p = 1; p <= Math.min(total, MAX_PAGES); p++) cases.push({ key: `${a.d.id}:${p}`, a, page: p, total });
      if (total > MAX_PAGES) cases.push({ key: `${a.d.id}:suite`, a, note: `Pages ${MAX_PAGES + 1} à ${total} : voir le fichier.` });
    }
  }
  const feuilles: { n: ParPage; cases: Case[] }[] = [];
  for (const c of cases) {
    const n = parPageDe(miseEnPage, c.a.d);
    const f = feuilles[feuilles.length - 1];
    if (f && f.n === n && f.cases.length < n) f.cases.push(c);
    else feuilles.push({ n, cases: [c] });
  }

  return (
    <>
      {feuilles.map((f) => (
        <section key={f.cases[0].key} className={`pv-annexes-page par-${f.n}`}>
          {f.cases.map((c) => {
            const titre = `Annexe ${c.a.n} – ${c.a.d.nom}${c.total && c.total > 1 ? ` (page ${c.page}/${c.total})` : ''}`;
            return (
              <figure key={c.key} className="pv-annexe">
                <figcaption>{titre}</figcaption>
                {c.note ? <p className="pv-empty">{c.note}</p> : <ImageAnnexe d={c.a.d} page={c.page} alt={titre} />}
              </figure>
            );
          })}
        </section>
      ))}
    </>
  );
}

/** Document figé affiché (archive, ordre du jour modifié à la main) : remet les photos et pages de PDF joints. `cle` : le HTML affiché. */
export function useAnnexesArchive(ref: RefObject<HTMLElement | null>, cle: string, actif = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !actif) return;
    let vivant = true;
    const urls: string[] = [];
    el.querySelectorAll<HTMLImageElement>('img[data-annexe]').forEach((img) => {
      if (img.getAttribute('src')) return;
      const id = img.dataset.annexe ?? '';
      const page = Number(img.dataset.page);
      const url = page
        ? apercuPdf(id, page).then((p) => p?.url)
        : getFile(id).then((b) => {
            if (!b) return undefined;
            const u = URL.createObjectURL(b);
            urls.push(u);
            return u;
          });
      url
        .then((u) => {
          if (!vivant) return;
          if (u) img.src = u;
          else {
            const p = document.createElement('p');
            p.className = 'pv-empty';
            p.textContent = `« ${img.alt} » : fichier introuvable (retiré depuis ?).`;
            img.replaceWith(p);
          }
        })
        .catch(() => {});
    });
    return () => {
      vivant = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ref, cle, actif]);
}
