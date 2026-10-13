import { useEffect, useState, type RefObject } from 'react';
import { getFile } from '../data/files';
import { apercuPdf, estPdf } from '../data/pdf';
import type { Task, TaskDoc } from '../data/types';

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

/** Reproduite à la fin : photo ou PDF, sauf d'une tâche partagée (ses fichiers sont rangés chez son entité). */
export const annexeReproduite = (a: Annexe) => !a.t.source && annexeVisible(a.d);

/** Annexes des tâches, dans leur ordre (un fichier lié à deux tâches ne compte qu'une fois). */
export function annexesDe(tasks: Task[]): Annexe[] {
  const out: Annexe[] = [];
  tasks.forEach((t) => (t.documents ?? []).forEach((d) => !out.some((a) => a.d.id === d.id) && out.push({ d, t, n: out.length + 1 })));
  return out;
}

/** Précision de la liste des annexes : la tâche, l'adresse d'un lien, où trouver un fichier non reproduit. */
export const annexeInfo = (a: Annexe) =>
  [a.t.titre, a.d.kind === 'lien' ? a.d.url : a.t.source ? `fichier de « ${a.t.source.unite} »` : !annexeVisible(a.d) ? 'fichier à part' : '']
    .filter(Boolean)
    .join(' · ');

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
            {a.d.kind === 'lien' ? <a href={a.d.url} target="_blank" rel="noreferrer">{a.d.nom}</a> : a.d.nom}
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
