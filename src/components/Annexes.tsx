import { Fragment, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { getFile, openFile } from '../data/files';
import { useStore } from '../data/store';
import { apercuPdf, estPdf } from '../data/pdf';
import type { Task, TaskDoc } from '../data/types';
import { DocThumb } from './DocsField';
import { Lien } from './Liens';

// Fichiers liés aux tâches d'un document (PV, ordre du jour), joints à la fin (option « Joindre les fichiers liés ») :
// la liste des annexes, puis les photos et chaque page des PDF en image, 1, 2 ou 4 par page imprimée. Les archives ne
// copient pas ces images (seulement data-annexe et data-page) : elles sont relues à l'affichage (useAnnexesArchive).

/** Pages d'un PDF reproduites au plus (les suivantes : voir le fichier). */
const MAX_PAGES = 30;

export type ParPage = 1 | 2 | 4;
export const PAR_PAGE: ParPage[] = [1, 2, 4];

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
 * Annexes des tâches, dans leur ordre (un fichier lié à deux tâches ne compte qu'une fois), sans celles retirées pour ce
 * document (`exclues` : identifiants des fichiers et liens).
 */
export function annexesDe(tasks: Task[], exclues: string[] = []): Annexe[] {
  const out: Annexe[] = [];
  tasks.forEach((t) =>
    (t.documents ?? []).forEach((d) => !exclues.includes(d.id) && !out.some((a) => a.d.id === d.id) && out.push({ d, t, n: out.length + 1 })),
  );
  return out;
}

/**
 * Choix des fichiers liés joints au document (ordre du jour ou PV d'une séance) : une case par photo, PDF ou lien des
 * tâches du document, cochée s'il est joint. `exclues` : ceux retirés ; `note` : précision sous la liste.
 */
export function ChoixAnnexes({ tasks, exclues, onChange, disabled, note }: {
  tasks: Task[];
  exclues: string[];
  onChange: (exclues: string[]) => void;
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
  (t.documents ?? []).map((d) => nomAvecAnnexe(d, annexes)).join(', ');
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
      {(t.documents ?? []).map((d, i) => {
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

/** Fichiers joints à la fin du document : `parPage` photos ou pages de PDF par page imprimée. */
export function PagesAnnexes({ annexes, parPage }: { annexes: Annexe[]; parPage: ParPage }) {
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
  const feuilles: Case[][] = [];
  for (let i = 0; i < cases.length; i += parPage) feuilles.push(cases.slice(i, i + parPage));

  return (
    <>
      {feuilles.map((f) => (
        <section key={f[0].key} className={`pv-annexes-page par-${parPage}`}>
          {f.map((c) => {
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
