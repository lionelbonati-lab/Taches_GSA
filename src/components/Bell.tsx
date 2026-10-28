import { useEffect, useRef, useState } from 'react';
import { useStore } from '../data/store';
import { ago, useNotifications, type Notif } from '../notifications';
import { Icone } from './icones';
import { useOuvrirLien } from './LienRecu';

/** Cloche de notifications (en-tête) : rappels d'échéance, retards, séance et activité. */
export function Bell() {
  const { markNotifsRead } = useStore();
  const { items, unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const ouvrir = useOuvrirLien();
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
    // De l'une de mes autres entités : ouverte d'ici, sans changer d'entité (useOuvrirLien).
    ouvrir(n.link, n.entite);
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
          <button className="bell-foot" onClick={() => { setOpen(false); ouvrir('/reglages'); }}><Icone n="reglages" /> Réglages des notifications</button>
        </div>
      )}
    </div>
  );
}
