import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { isOpen } from '../data/polls';
import { PollCard } from '../components/PollCard';
import { PollEditor } from '../components/PollEditor';
import { Empty } from '../components/ui';
import { PageIntro } from '../components/Nav';

type Filter = 'avoter' | 'encours' | 'termines';

export function Polls() {
  const { data, user, can } = useStore();
  const [params] = useSearchParams();
  const focus = params.get('id');
  const [creating, setCreating] = useState(false);
  // Sondages des autres entités ouverts à celle-ci : pour ses membres qui y votent.
  const visible = (data.polls ?? []).filter((p) => user && (p.cleMoi || (!p.source && (p.creePar === user.id || can('polls.manage')))));
  const toVote = visible.filter((p) => isOpen(p) && p.cleMoi && !p.votes[p.cleMoi]);
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

  const focused = visible.find((p) => p.id === focus);
  const list = focused
    ? [focused]
    : filter === 'avoter' ? toVote : filter === 'encours' ? visible.filter(isOpen) : visible.filter((p) => !isOpen(p));

  useEffect(() => {
    if (focus) document.getElementById(`poll-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Sondages</h1>
        {can('polls.create') && <button className="btn primary" onClick={() => setCreating(true)}>+ Nouveau sondage</button>}
      </div>
      <PageIntro />
      {focused ? (
        <p><a href="#/sondages">← Tous les sondages</a></p>
      ) : (
        <div className="seg wrap">
          <button className={filter === 'avoter' ? 'on' : ''} onClick={() => choisir('avoter')}>À voter ({toVote.length})</button>
          <button className={filter === 'encours' ? 'on' : ''} onClick={() => choisir('encours')}>En cours ({visible.filter(isOpen).length})</button>
          <button className={filter === 'termines' ? 'on' : ''} onClick={() => choisir('termines')}>Terminés ({visible.filter((p) => !isOpen(p)).length})</button>
        </div>
      )}
      <div className="poll-list">
        {list.map((p) => <PollCard key={p.id} poll={p} highlight={p.id === focus} />)}
        {list.length === 0 && <Empty>{filter === 'avoter' ? 'Aucun sondage n’attend ta réponse.' : 'Aucun sondage.'}</Empty>}
      </div>
      {creating && <PollEditor onClose={() => setCreating(false)} />}
    </div>
  );
}
