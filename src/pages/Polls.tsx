import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { isOpen } from '../data/polls';
import { PollCard } from '../components/PollCard';
import { PollEditor } from '../components/PollEditor';
import { Empty } from '../components/ui';

type Filter = 'avoter' | 'encours' | 'termines';

export function Polls() {
  const { data, user, can } = useStore();
  const [params] = useSearchParams();
  const focus = params.get('id');
  const [creating, setCreating] = useState(false);
  const visible = (data.polls ?? []).filter((p) => user && (p.votants.includes(user.id) || p.creePar === user.id || can('polls.manage')));
  const toVote = visible.filter((p) => isOpen(p) && user && p.votants.includes(user.id) && !p.votes[user.id]);
  const [filter, setFilter] = useState<Filter>(toVote.length ? 'avoter' : 'encours');

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
      {focused ? (
        <p><a href="#/sondages">← Tous les sondages</a></p>
      ) : (
        <div className="seg wrap">
          <button className={filter === 'avoter' ? 'on' : ''} onClick={() => setFilter('avoter')}>À voter ({toVote.length})</button>
          <button className={filter === 'encours' ? 'on' : ''} onClick={() => setFilter('encours')}>En cours ({visible.filter(isOpen).length})</button>
          <button className={filter === 'termines' ? 'on' : ''} onClick={() => setFilter('termines')}>Terminés ({visible.filter((p) => !isOpen(p)).length})</button>
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
