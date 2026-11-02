import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { isOpen, sondagesVisibles } from '../data/polls';
import { PollCard, useClotureAuto } from '../components/PollCard';
import { PollEditor } from '../components/PollEditor';
import { Empty } from '../components/ui';
import { PageIntro } from '../components/Nav';
import { AvisLien } from '../components/EnvoyerLien';

type Filter = 'avoter' | 'encours' | 'termines';

/** Sondages : ceux où je vote, et ceux que j'ai créés ou que je gère ; on y vote, on les gère, on en crée. */
export function Polls() {
  const { data, user, can } = useStore();
  const [params] = useSearchParams();
  const focus = params.get('id');
  const [creating, setCreating] = useState(false);
  const visible = sondagesVisibles(data.polls ?? [], user?.id, can('polls.manage'));
  useClotureAuto(visible);
  const toVote = visible.filter((p) => isOpen(p) && !!user && p.votants.includes(user.id) && !p.votes[user.id]);
  const [filter, setFilter] = useState<Filter>(toVote.length ? 'avoter' : 'encours');

  // Lien d'une notification ou d'un message : le numéro du sondage (ancien lien : « x:<entité>:<sondage> »).
  const focused = visible.find((p) => p.id === focus || (!!focus && focus.endsWith(`:${p.id}`)));
  const list = focused ? [focused] : filter === 'avoter' ? toVote : filter === 'encours' ? visible.filter(isOpen) : visible.filter((p) => !isOpen(p));

  const trouve = !!focused;
  useEffect(() => {
    if (focus && trouve) document.querySelector('.poll.highlight')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, trouve]);

  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Sondages</h1>
        {can('polls.create') && <button className="btn primary" onClick={() => setCreating(true)}>+ Nouveau sondage</button>}
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
          <button className={filter === 'avoter' ? 'on' : ''} onClick={() => setFilter('avoter')}>À voter ({toVote.length})</button>
          <button className={filter === 'encours' ? 'on' : ''} onClick={() => setFilter('encours')}>En cours ({visible.filter(isOpen).length})</button>
          <button className={filter === 'termines' ? 'on' : ''} onClick={() => setFilter('termines')}>Terminés ({visible.filter((p) => !isOpen(p)).length})</button>
        </div>
      )}
      <div className="poll-list">
        {list.map((p) => <PollCard key={p.id} poll={p} highlight={focused === p} />)}
        {list.length === 0 && <Empty>{filter === 'avoter' ? 'Aucun sondage n’attend ta réponse.' : 'Aucun sondage.'}</Empty>}
      </div>
      {creating && <PollEditor onClose={() => setCreating(false)} />}
    </div>
  );
}
