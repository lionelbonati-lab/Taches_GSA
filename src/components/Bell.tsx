import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { ago, useNotifications, type Notif } from '../notifications';
import { useClubOptional } from '../data/club';
import { PERMS_COMITE, useComites } from '../data/comites';

/** Pages Comité : séances (toutes mes entités), ordre du jour et PV (le comité choisi). */
const PAGES_COMITE = ['/comite', '/ordre-du-jour', '/pv'];
import { Icone } from './icones';

/** Cloche de notifications (en-tête) : rappels d'échéance, retards, séance et activité. */
export function Bell() {
  const { markNotifsRead } = useStore();
  const club = useClubOptional();
  const comites = useComites();
  const { items, unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const go = (n: Notif) => {
    markNotifsRead([n.key]);
    setOpen(false);
    // De l'un de mes autres comités, une page Comité (séance, ordre du jour, PV) : ce comité y est choisi, sans changer
    // d'entité. D'une autre entité, une autre page (sondage…) : sa page, dans son entité.
    const comite = n.entite && PERMS_COMITE.some((p) => comites?.liste(p).some((u) => u.id === n.entite)) && PAGES_COMITE.includes(n.link.split('?')[0]);
    if (comite) {
      comites!.choisir(n.entite!);
      navigate(n.link);
    } else if (n.entite && club) club.switchUnit(n.entite, `#${n.link}`);
    else navigate(n.link);
  };

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell" onClick={() => setOpen(!open)} aria-label={`Notifications${unread.length ? ` (${unread.length} non lues)` : ''}`}>
        <Icone n="cloche" />{unread.length > 0 && <span className="bell-badge">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread.length > 0 && <button className="btn link small" onClick={() => markNotifsRead(unread.map((x) => x.key))}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 ? (
            <p className="bell-empty">Rien à signaler 🎉</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.key}>
                  <button className={`bell-item ${n.unread ? 'unread' : ''}`} onClick={() => go(n)}>
                    <span className="bell-icon">{n.icon}</span>
                    <span className="bell-text">
                      <span>{n.text}</span>
                      {n.sub && <small>{n.sub}</small>}
                      {n.kind === 'activite' && <small className="bell-time">{ago(n.at)}</small>}
                    </span>
                    {n.unread && <span className="bell-dot" aria-label="non lue" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="bell-foot" onClick={() => { setOpen(false); navigate('/reglages'); }}><Icone n="reglages" /> Réglages des notifications</button>
        </div>
      )}
    </div>
  );
}
