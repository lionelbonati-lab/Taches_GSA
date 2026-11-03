import { useState, type ReactNode } from 'react';
import { docIcon, ouvrirBlob } from '../data/files';
import type { Task, TaskDoc } from '../data/types';
import { annexeVisible, docsDuDocument } from './Annexes';
import { Lien } from './Liens';
import { ContenuFichier, useFichierJoint, voirFichier } from './Visionneuse';
import { Icone } from './icones';

// PV diffusé en séance (beamer) : en mode « Projection », à côté des notes, les pièces jointes du point en cours (celui
// où l'on écrit, sinon celui en haut de l'écran), en grand, pour que tous voient de quoi on parle. La photo ou les pages
// du PDF (défilées dans le panneau) ; plusieurs pièces jointes : on choisit laquelle montrer. Un point sans pièce jointe
// n'en montre aucune (pas celle d'un autre point).

/** Point en cours de la prise de notes : son nom (point, sondage, note de section) et, pour un point, la tâche. */
export interface PointEnCours {
  nom: string;
  tache?: Task;
}

export function PiecesJointesPoint({ point }: { point?: PointEnCours }) {
  // Pièce jointe choisie, point par point (on la retrouve en revenant au point).
  const [choix, setChoix] = useState<Record<string, string>>({});
  const t = point?.tache;
  const docs = t ? docsDuDocument(t) : [];
  const doc = (t && docs.find((d) => d.id === choix[t.id])) ?? docs.find(annexeVisible) ?? docs[0];
  const choisir = t && docs.length > 1 && (
    <div className="min-projection-choix" role="group" aria-label="Pièce jointe à montrer">
      {docs.map((d) => (
        <button key={d.id} type="button" className={`btn small ${d.id === doc?.id ? 'on' : ''}`} aria-pressed={d.id === doc?.id} onClick={() => setChoix({ ...choix, [t.id]: d.id })}>
          {docIcon(d)} {d.nom}
        </button>
      ))}
    </div>
  );
  return (
    <section className="panel min-projection" aria-label="Pièces jointes du point en cours">
      <div className="min-projection-tete">
        <small className="muted"><Icone n="fichier" /> {t ? 'Pièces jointes du point' : 'Point en cours'}</small>
        <h2 className="min-h2">{point?.nom ?? 'Séance et présences'}</h2>
      </div>
      {!doc ? (
        <p className="muted min-projection-vide">
          {!point ? 'Fais défiler jusqu’à un point (ou écris dans sa note) : ses pièces jointes s’affichent ici.' : t ? 'Pas de pièce jointe pour ce point.' : 'Pas de pièce jointe ici.'}
        </p>
      ) : doc.kind === 'lien' ? (
        <>
          {choisir}
          <LienProjete d={doc} />
        </>
      ) : (
        <FichierProjete key={doc.id} d={doc} choisir={choisir} />
      )}
    </section>
  );
}

/**
 * Le fichier en grand ; au-dessus (le bouton « + » de l'appli couvre le bas), le choix des pièces jointes (sinon son nom)
 * et les boutons.
 */
function FichierProjete({ d, choisir }: { d: TaskDoc; choisir?: ReactNode }) {
  const fichier = useFichierJoint(d.id, d.nom);
  const { f } = fichier;
  return (
    <>
      <div className="row min-projection-actions">
        {choisir || <span className="muted min-projection-nom">{docIcon(d)} {d.nom}</span>}
        <span className="min-projection-boutons">
          <button type="button" className="btn small" disabled={!f} onClick={() => voirFichier(d.id, d.nom)} title="Agrandir (visionneuse)" aria-label="Agrandir"><Icone n="pleinEcran" /></button>
          <button type="button" className="btn small" disabled={!f} onClick={() => f && ouvrirBlob(f.blob, d.nom, true)} title="Télécharger" aria-label="Télécharger"><Icone n="telecharger" /></button>
        </span>
      </div>
      <div className="min-projection-doc">
        <ContenuFichier id={d.id} nom={d.nom} fichier={fichier} />
      </div>
    </>
  );
}

/** Lien : une page web ne s'affiche pas dans l'appli ; on l'ouvre à part (nouvel onglet, à montrer à l'écran). */
function LienProjete({ d }: { d: TaskDoc }) {
  return (
    <div className="min-projection-lien">
      <p>
        🔗 <Lien href={d.url ?? ''}>{d.nom}</Lien>
      </p>
      {d.url && d.url !== d.nom && <p className="muted">{d.url}</p>}
      <p className="muted">Une page web s’ouvre dans un nouvel onglet (un clic sur le lien).</p>
    </div>
  );
}
