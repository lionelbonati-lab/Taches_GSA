import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Etiquette } from '../data/types';
import { fmtRange } from '../data/utils';
import { etiquettesDesLieux, lieuxDe, nomLieu, retirerEtiquette, sansEtiquetteDeLeurPlace, sorteDe } from '../data/etiquettes';
import { Modal } from './ui';
import { CouleurEtiquette, MembresEtiquette } from './ReglageEtiquette';
import { EventModal } from './EventModal';

/**
 * Toutes les étiquettes du club (etiquettes.ts), chacune réglée à un seul endroit : celle d'un événement dans son
 * formulaire (agenda), celle d'une section (groupe) et « Comité » dans la console admin. Ici : leur couleur, et les
 * anciennes étiquettes pas encore reliées (à reprendre depuis l'événement ou la section, ou à retirer).
 */
export function EtiquettesModal({ onClose }: { onClose: () => void }) {
  const { data, can, update } = useStore();
  const gerer = can('settings.lists');
  const liste = data.etiquettes ?? [];
  const [evenement, setEvenement] = useState<ClubEvent | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const points = (e: Etiquette) => data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
  const membres = (e: Etiquette) => e.membres?.length ?? 0;
  const changer = (id: string, f: (e: Etiquette) => Etiquette, action: string) =>
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).map((e) => (e.id === id ? f(e) : e));
    }, action);
  const retirer = (e: Etiquette) => {
    const n = points(e);
    if (!confirm(`Retirer l’étiquette « ${e.nom} » ?${n ? ` Elle est retirée de ${n} point(s) ; les points restent.` : ''}`)) return;
    update((d) => retirerEtiquette(d, e.id), `Étiquette « ${e.nom} » retirée`);
  };
  // Points d'avant ce réglage, sans toutes leurs étiquettes d'office : on les leur ajoute (rien n'est retiré).
  const aEtiqueter = sansEtiquetteDeLeurPlace(data);
  const etiqueterTout = () => {
    if (!confirm(`Ajouter à ${aEtiqueter.length} point${aEtiqueter.length > 1 ? 's' : ''} l’étiquette de leur groupe ou de leur événement ? Aucune étiquette n’est retirée.`)) return;
    update((d) => {
      const auto = etiquettesDesLieux(d);
      d.tasks.forEach((t) => {
        if (t.paiement) return;
        const l = auto(t.sectionId, t.sousSection, t.eventId).filter((id) => !t.etiquettes?.includes(id));
        if (l.length) t.etiquettes = [...(t.etiquettes ?? []), ...l];
      });
    }, `Étiquettes d’office ajoutées à ${aEtiqueter.length} point(s)`);
  };

  const ligne = (e: Etiquette, quoi: ReactNode, regler?: ReactNode) => (
    <div key={e.id} className="panel row wrap etiquette-ligne">
      <CouleurEtiquette valeur={e.couleur} disabled={!gerer} label={`Couleur de l’étiquette ${e.nom}`} onChange={(c) => changer(e.id, (x) => ({ ...x, couleur: c }), `Couleur de l’étiquette « ${e.nom} » modifiée`)} />
      <span className="grow">
        <b>{e.nom}</b> <small className="muted">{quoi} · {membres(e)} membre{membres(e) > 1 ? 's' : ''} · {points(e)} point{points(e) > 1 ? 's' : ''}</small>
      </span>
      {regler}
    </div>
  );
  const evenements = liste.filter((e) => sorteDe(e) === 'evenement');
  const groupes = liste.filter((e) => sorteDe(e) === 'groupe');
  const comite = liste.filter((e) => sorteDe(e) === 'comite');
  const anciennes = liste.filter((e) => sorteDe(e) === 'libre');
  const versSections = can('admin.access') ? <Link className="btn small" to="/admin/taches" onClick={onClose}>Régler (sections)</Link> : null;

  return (
    <Modal title="Étiquettes" icone="etiquette" onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Les <b>membres</b> d’une étiquette voient ses points, qu’ils soient du comité ou non. Chaque étiquette se règle à un seul endroit :
        un <b>événement</b> dans son formulaire (agenda › l’événement › case « Étiquette » : sa sous-section dans « Événements ») ; un <b>groupe</b> avec la
        coche « Groupe » de sa section (console admin › Sections) ; le <b>Comité</b> (les autres points) au même endroit.
        Un point reçoit d’office l’étiquette de sa section, de sa sous-section ou de l’événement auquel il est rattaché.
      </p>
      {gerer && aEtiqueter.length > 0 && (
        <div className="panel etiquette-comite">
          <span>{aEtiqueter.length} point{aEtiqueter.length > 1 ? 's' : ''} n’{aEtiqueter.length > 1 ? 'ont' : 'a'} pas encore l’étiquette de leur groupe ou de leur événement.</span>
          <button type="button" className="btn small" onClick={etiqueterTout}>Les ajouter</button>
        </div>
      )}
      {!liste.length && <p className="muted">Aucune étiquette pour l’instant.</p>}
      {evenements.length > 0 && <h3>📅 Événements</h3>}
      {evenements.map((e) => {
        const ev = data.events.find((x) => x.id === e.eventId);
        const lieu = lieuxDe(e, data.sections)[0];
        return ligne(e, <>{e.date ? fmtRange(e.date, e.dateFin) : 'sans date'}{lieu ? ` · ${nomLieu(lieu, data.sections)}` : ''}</>,
          ev && can('events.manage') ? <button type="button" className="btn small" onClick={() => setEvenement(ev)}>Régler (événement)</button> : null);
      })}
      {groupes.length > 0 && <h3>👥 Groupes</h3>}
      {groupes.map((e) => ligne(e, <>section {nomLieu({ sectionId: e.sectionId! }, data.sections)}</>, versSections))}
      {comite.map((e) => (
        <div key={e.id}>
          <h3>🏛️ Comité</h3>
          {ligne(e, 'les points qui n’ont ni groupe ni événement', versSections)}
        </div>
      ))}
      {anciennes.length > 0 && (
        <>
          <h3>À relier</h3>
          <p className="muted">
            Étiquettes d’avant ce réglage, ni d’un événement ni d’une section : elles marchent comme avant. Pour en faire celle d’un événement, coche
            « Étiquette » dans son formulaire et choisis « Reprendre » ; pour un groupe, coche « Groupe » sur sa section. Ses points et ses membres suivent.
          </p>
        </>
      )}
      {anciennes.map((e) => {
        const lieux = lieuxDe(e, data.sections);
        return (
          <section key={e.id} className="panel etiquette-reglage">
            <div className="row wrap">
              <CouleurEtiquette valeur={e.couleur} disabled={!gerer} label={`Couleur de l’étiquette ${e.nom}`} onChange={(c) => changer(e.id, (x) => ({ ...x, couleur: c }), `Couleur de l’étiquette « ${e.nom} » modifiée`)} />
              <span className="grow">
                <b>{e.nom}</b>{' '}
                <small className="muted">
                  {e.type === 'evenement' ? `📅 ${e.date ? fmtRange(e.date, e.dateFin) : 'sans date'}` : '👥 groupe'}
                  {lieux.length ? ` · ${lieux.map((l) => nomLieu(l, data.sections)).join(', ')}` : ''} · {points(e)} point{points(e) > 1 ? 's' : ''}
                </small>
              </span>
              <button type="button" className="btn small" aria-expanded={ouverte === e.id} onClick={() => setOuverte(ouverte === e.id ? null : e.id)}>
                {membres(e)} membre{membres(e) > 1 ? 's' : ''}
              </button>
              {gerer && <button type="button" className="btn small danger" onClick={() => retirer(e)}>Retirer</button>}
            </div>
            {ouverte === e.id && (
              <MembresEtiquette nom={e.nom} membres={e.membres ?? []} disabled={!gerer}
                onChange={(m) => changer(e.id, (x) => ({ ...x, membres: m }), `Étiquette « ${e.nom} » : membres modifiés`)} />
            )}
          </section>
        );
      })}
      {evenement && <EventModal event={evenement} onClose={() => setEvenement(null)} />}
    </Modal>
  );
}
