import { useEffect, useRef, useState } from 'react';

/** Zone de notes enregistrée automatiquement (pendant la frappe et en quittant le champ). */
export function NoteField({ value, onCommit, placeholder, autoFocus }: { value: string; onCommit: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLTextAreaElement>(null);
  const last = useRef(value);

  // Valeur modifiée ailleurs (autre séance sélectionnée…) : on la reprend si on n'est pas en train d'écrire.
  useEffect(() => {
    if (document.activeElement !== ref.current) setV(value);
    last.current = value;
  }, [value]);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useEffect(grow, [v]);

  const commit = (nv: string) => {
    clearTimeout(timer.current);
    if (nv !== last.current) {
      last.current = nv;
      onCommit(nv);
    }
  };

  return (
    <textarea
      ref={ref}
      className="note-field"
      rows={1}
      value={v}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => {
        setV(e.target.value);
        clearTimeout(timer.current);
        const nv = e.target.value;
        timer.current = setTimeout(() => commit(nv), 700);
      }}
      onBlur={() => commit(v)}
    />
  );
}
