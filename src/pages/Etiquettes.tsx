import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../data/store';
import type { ClubEvent, Etiquette } from '../data/types';
import { fmtRange, isDone, today } from '../data/utils';
import {
  etiquetteDeLaSerie, etiquetteDeLEvenement, etiquettePassee, etiquettesDesLieux, evenementPasse, lieuxDe, nomLieu, retirerEtiquette, sansEtiquetteDeLeurPlace, sorteDe,
} from '../data/etiquettes';
import { evenementsDeLaSerie, seriePassee, seriesDuClub } from '../data/seriesEvenements';
import { PageIntro } from '../components/Nav';
import { Icone } from '../components/icones';
import { Comite, EtiquetteReglee, EvenementEtiquette, GroupeSection, SerieEtiquette } from '../components/ReglageEtiquette';

/**
 * Page Club › Étiquettes : tout le réglage des étiquettes au même endroit (etiquettes.ts). Les événements de l'agenda
 * (case « Étiquette » : sa sous-section dans « Événements »), les sections (coche « Groupe »), « Comité », et les
 * anciennes étiquettes à relier ; pour chacune : icône, couleur, membres. Les mêmes réglages restent dans le formulaire
 * d'un événement et dans la console admin (sections). Sans droit : en lecture (qui est membre de quoi).
 */
export function EtiquettesPage() {
  const { data, can, update } = useStore();
  const listes = can('settings.lists');
  const evenementsGeres = can('events.manage');
  const [passes, setPasses] = useState(false);
  const jour = today();

  // Événements : les séries et les événements simples (pas les occurrences modifiées seules) ; sans « Événements » dans
  // le menu, seulement ceux qui ont une étiquette.
  const avecEtiquette = (e: ClubEvent) => data.etiquettes?.some((x) => x.eventId === e.id);
  const evenements = data.events.filter((e) => !e.serie && (can('tab.events') || avecEtiquette(e)));
  const prochains = evenements.filter((e) => !evenementPasse(e, jour)).sort((a, b) => a.date.localeCompare(b.date));
  // Événements passés, à part (les plus récents d'abord ; ceux qui ont une étiquette en premier) : leur étiquette reste
  // sur leurs points, et n'est plus proposée pour de nouveaux points (etiquettes.ts).
  const anciens = evenements
    .filter((e) => evenementPasse(e, jour))
    .sort((a, b) => Number(!!avecEtiquette(b)) - Number(!!avecEtiquette(a)) || b.date.localeCompare(a.date));
  const anciensEtiquetes = anciens.filter(avecEtiquette);
  /** Points d'une étiquette passée qui ne sont pas terminés. */
  const aFinir = (e: ClubEvent) => {
    const et = etiquetteDeLEvenement(data, e.id);
    return et ? data.tasks.filter((t) => t.etiquettes?.includes(et.id) && !isDone(data, t)).length : 0;
  };

  // Séries d'événements (programme hivernal, championnat) : sans « Événements » dans le menu, celles qui ont une étiquette.
  const series = seriesDuClub(data).filter((s) => can('tab.events') || !!etiquetteDeLaSerie(data, s.id));
  /** Où en est une série passée qui a une étiquette (« passée · 2 points pas terminés »). */
  const etatSerie = (id: string) => {
    const et = etiquetteDeLaSerie(data, id);
    if (!et || !etiquettePassee(et, data.events, jour) || !seriePassee(evenementsDeLaSerie(data.events, id), jour)) return undefined;
    const n = data.tasks.filter((t) => t.etiquettes?.includes(et.id) && !isDone(data, t)).length;
    return n ? `passée · ${n} point${n > 1 ? 's' : ''} pas terminé${n > 1 ? 's' : ''}` : 'passée · ses points sont terminés';
  };

  const libres = (data.etiquettes ?? []).filter((e) => sorteDe(e) === 'libre');
  const changer = (e: Etiquette, membres: string[]) =>
    update((d) => {
      d.etiquettes = (d.etiquettes ?? []).map((x) => (x.id === e.id ? { ...x, membres } : x));
    }, `Étiquette « ${e.nom} » : membres modifiés`);
  const retirer = (e: Etiquette) => {
    const n = data.tasks.filter((t) => t.etiquettes?.includes(e.id)).length;
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

  return (
    <div className="page-etiquettes">
      <div className="page-head">
        <h1><Icone n="etiquette" /> Étiquettes</h1>
      </div>
      <PageIntro />
      {listes && aEtiqueter.length > 0 && (
        <div className="panel etiquette-comite">
          <span>{aEtiqueter.length} point{aEtiqueter.length > 1 ? 's' : ''} n’{aEtiqueter.length > 1 ? 'ont' : 'a'} pas encore l’étiquette de leur groupe ou de leur événement.</span>
          <button type="button" className="btn small" onClick={etiqueterTout}>Les ajouter</button>
        </div>
      )}

      <section className="panel etiquettes-bloc">
        <h2><Icone n="evenements" /> Événements</h2>
        <p className="muted">
          Coche un événement : il a son étiquette, à son nom et à ses dates, et sa sous-section dans « Événements » (créée d’office). Ses membres, du comité ou
          non, voient ses points : ceux de la sous-section et ceux rattachés à l’événement.{' '}
          {can('tab.events') && <Link to="/evenements">Agenda › Événements</Link>}
        </p>
        {prochains.map((e) => <EvenementEtiquette key={e.id} ev={e} peut={evenementsGeres} />)}
        {!prochains.length && <p className="muted">Aucun événement à venir.</p>}
        {anciens.length > 0 && (
          <div className="etiquettes-passees">
            <button type="button" className="btn small link" aria-expanded={passes} onClick={() => setPasses(!passes)}>
              {passes ? 'Masquer' : 'Voir'} les événements passés ({anciens.length}{anciensEtiquetes.length ? `, dont ${anciensEtiquetes.length} avec une étiquette` : ''})
            </button>
            {passes && (
              <>
                <p className="muted etiquettes-passees-aide">
                  <Icone n="archives" /> <b>L’étiquette d’un événement passé</b> reste sur ses points : on les retrouve (filtre « Étiquette », recherche) et
                  ses membres les voient encore, le temps de finir ce qui reste (bilan, factures). Elle n’est plus proposée pour de nouveaux points. Quand tout
                  est fini, retire ses membres (« N membres ») s’ils ne doivent plus voir ses points, ou décoche l’événement pour la retirer des points. Pour
                  l’édition suivante, « Reprendre » l’événement (Agenda › Événements) : la nouvelle édition a sa propre étiquette, avec les mêmes membres.
                </p>
                {anciens.map((e) => {
                  const n = aFinir(e);
                  return (
                    <EvenementEtiquette key={e.id} ev={e} peut={evenementsGeres}
                      etat={avecEtiquette(e) ? (n ? `passé · ${n} point${n > 1 ? 's' : ''} pas terminé${n > 1 ? 's' : ''}` : 'passé · ses points sont terminés') : undefined} />
                  );
                })}
              </>
            )}
          </div>
        )}
      </section>

      {series.length > 0 && (
        <section className="panel etiquettes-bloc">
          <h2><Icone n="serie" /> Séries d’événements</h2>
          <p className="muted">
            Coche une série (programme hivernal, championnat…) : elle a son étiquette, à son nom, et sa sous-section dans « Événements ». Ses membres voient
            les points de toute la série : ceux rattachés à ses événements et ceux de sa sous-section. Tu peux aussi reprendre une étiquette déjà là, avec ses
            membres et ses points.
          </p>
          {series.map((s) => <SerieEtiquette key={s.id} s={s} peut={evenementsGeres} etat={etatSerie(s.id)} />)}
        </section>
      )}

      <section className="panel etiquettes-bloc">
        <h2><Icone n="membres" /> Groupes</h2>
        <p className="muted">Coche une section (Gruppetto, École de cyclisme…) : elle devient un groupe ; ses membres voient ses points.</p>
        {data.sections.map((s) => <GroupeSection key={s.id} s={s} peut={listes} titre />)}
      </section>

      <section className="panel etiquettes-bloc">
        <h2><Icone n="seances" /> Comité</h2>
        <Comite peut={listes} />
      </section>

      {libres.length > 0 && (
        <section className="panel etiquettes-bloc">
          <h2>À relier</h2>
          <p className="muted">
            Étiquettes d’avant, ni d’un événement, ni d’une série, ni d’une section : elles marchent comme avant. Pour en faire celle d’un événement, d’une
            série ou d’un groupe, coche-le plus haut et choisis « Reprendre » : ses points et ses membres suivent.
          </p>
          {libres.map((e) => {
            const lieux = lieuxDe(e, data.sections);
            const quoi = [e.type === 'evenement' && e.date ? fmtRange(e.date, e.dateFin) : '', lieux.map((l) => nomLieu(l, data.sections)).join(', ')].filter(Boolean).join(' · ');
            return (
              <div key={e.id} className="groupe-section">
                <EtiquetteReglee e={e} peut={listes} detail={quoi || undefined} onMembres={(m) => changer(e, m)} />
                {listes && <button type="button" className="btn small danger" onClick={() => retirer(e)}>Retirer</button>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
