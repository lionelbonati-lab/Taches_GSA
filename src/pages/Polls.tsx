import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isOpen, nouveauSondage } from '../data/polls';
import { PollCard, useClotureAuto } from '../components/PollCard';
import { PollEditor } from '../components/PollEditor';
import { Empty, usePlusieursEntites } from '../components/ui';
import { PageIntro } from '../components/Nav';
import { AvisLien } from '../components/EnvoyerLien';
import { NouveauDans } from '../components/ChoixEntite';
import { Chez, useMesEntites, useSondagesMoi, type SondageMoi } from '../data/entites';
import { idPartagee } from '../data/partage';
import type { Poll } from '../data/types';

type Filter = 'avoter' | 'encours' | 'termines';

/**
 * Sondages de toutes mes entités (vue « moi »), chacun avec la pilule de son entité : on y vote, on le gère et on le
 * crée dans la sienne, sans changer d'entité. Un sondage ouvert à plusieurs de mes entités n'y figure qu'une fois.
 */
export function Polls() {
  const mes = useMesEntites();
  const plusieurs = usePlusieursEntites();
  const [params] = useSearchParams();
  const focus = params.get('id');
  const [creating, setCreating] = useState(false);
  const visible = useSondagesMoi();
  const polls = visible.map((x) => x.p);
  useClotureAuto(polls);
  const toVote = visible.filter(({ p }) => isOpen(p) && p.cleMoi && !p.votes[p.cleMoi]);
  const [filter, setFilter] = useState<Filter>(toVote.length ? 'avoter' : 'encours');
  // Sondages des autres entités : lus après l'ouverture de la page ; « À voter » s'ils attendent une réponse (sauf autre choix).
  const choisi = useRef(!!toVote.length);
  const choisir = (f: Filter) => {
    choisi.current = true;
    setFilter(f);
  };
  useEffect(() => {
    if (!choisi.current && toVote.length) {
      choisi.current = true;
      setFilter('avoter');
    }
  }, [toVote.length]);

  // Lien d'une notification ou d'un message : le numéro du sondage dans son entité, ou tel que reçu par une autre.
  const vise = (x: SondageMoi) => x.p.id === focus || (!!x.ent.u && idPartagee(x.ent.u.id, x.p.id) === focus);
  const focused = visible.find(vise);
  const list = focused
    ? [focused]
    : filter === 'avoter' ? toVote : filter === 'encours' ? visible.filter((x) => isOpen(x.p)) : visible.filter((x) => !isOpen(x.p));
  const gerables = mes.filter((e) => e.store.can('polls.create'));

  const trouve = !!focused;
  useEffect(() => {
    if (focus && trouve) document.querySelector('.poll.highlight')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, trouve]);

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Sondages</h1>
        {gerables.length > 0 && <button className="btn primary" onClick={() => setCreating(true)}>+ Nouveau sondage</button>}
      </div>
      <PageIntro />
      {focus && (
        <AvisLien
          trouve={!!focused}
          nom="un sondage"
          introuvable="Sondage introuvable : il a peut-être été supprimé, ou tu ne fais pas partie de ses votants."
        />
      )}
      {focused ? (
        <p><a href="#/sondages">← Tous les sondages</a></p>
      ) : (
        <div className="seg wrap">
          <button className={filter === 'avoter' ? 'on' : ''} onClick={() => choisir('avoter')}>À voter ({toVote.length})</button>
          <button className={filter === 'encours' ? 'on' : ''} onClick={() => choisir('encours')}>En cours ({visible.filter((x) => isOpen(x.p)).length})</button>
          <button className={filter === 'termines' ? 'on' : ''} onClick={() => choisir('termines')}>Terminés ({visible.filter((x) => !isOpen(x.p)).length})</button>
        </div>
      )}
      <div className="poll-list">
        {list.map(({ p, ent }) => (
          <Chez key={`${ent.u?.id ?? ''}:${p.id}`} id={ent.u?.id}>
            <PollCard poll={p} highlight={focused?.p === p} pilule={plusieurs ? ent.u?.nom : undefined} />
          </Chez>
        ))}
        {list.length === 0 && <Empty>{filter === 'avoter' ? 'Aucun sondage n’attend ta réponse.' : 'Aucun sondage.'}</Empty>}
      </div>
      {creating && (
        <NouveauDans entites={gerables} cree={(e, v?: Poll) => nouveauSondage(e.store.data, e.store.user?.id ?? '', v)}>
          {(p, choix) => <PollEditor nouveau={p} entite={choix} onClose={() => setCreating(false)} />}
        </NouveauDans>
      )}
    </div>
  );
}
