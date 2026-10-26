import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { htmlEditeur, lireEditeur, morceauxAffiches } from '../data/noteRiche';
import { AvecLiens } from './Liens';

/**
 * Zone de notes du PV, mise en forme comprise (2e ligne de la pilule ; Ctrl+B, Ctrl+I, Ctrl+U), enregistrée
 * automatiquement (pendant la frappe et en quittant le champ). Collé : le texte seul.
 */
export function NoteField({ value, onCommit, placeholder, autoFocus, readOnly }: { value: string; onCommit: (v: string) => void; placeholder?: string; autoFocus?: boolean; readOnly?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const last = useRef(value);
  const envoyer = useRef(onCommit);
  envoyer.current = onCommit;

  const vide = (el: HTMLElement, v: string) => el.classList.toggle('vide', !v);
  // Valeur modifiée ailleurs (autre séance sélectionnée…) : reprise si on n'est pas en train d'écrire. Déjà affichée
  // (sa propre note enregistrée) : rien n'est touché, la sélection reste (pilule touchée au doigt).
  useLayoutEffect(() => {
    const el = ref.current!;
    if (document.activeElement !== el && lireEditeur(el) !== value) el.innerHTML = htmlEditeur(value);
    vide(el, value);
    last.current = value;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (el = ref.current) => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (!el) return;
    const nv = lireEditeur(el);
    vide(el, nv);
    if (nv !== last.current) {
      last.current = nv;
      envoyer.current(nv);
    }
  };
  // Zone retirée pendant la frappe (note fermée, autre page) : ce qui attendait d'être enregistré l'est.
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (timer.current !== undefined) commit(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className="note-field note-riche"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      aria-readonly={readOnly || undefined}
      data-placeholder={readOnly ? '' : placeholder}
      onInput={() => {
        const el = ref.current!;
        vide(el, !el.textContent?.trim() ? '' : 'x');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(), 700);
      }}
      onBlur={() => commit()}
      onKeyDown={(e) => {
        // Entrée : un retour à la ligne (<br>), pas un nouveau bloc.
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && document.execCommand('insertLineBreak')) e.preventDefault();
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
    />
  );
}

/** Note du PV dans le document : sa mise en forme, ses adresses web en liens (écran, PDF, archives). */
export function TexteNote({ note }: { note: string }) {
  return (
    <>
      {morceauxAffiches(note).map((m, k) => {
        let n: ReactNode = <AvecLiens texte={m.t} />;
        if (m.s) n = <s>{n}</s>;
        if (m.u) n = <u>{n}</u>;
        if (m.i) n = <i>{n}</i>;
        if (m.b) n = <b>{n}</b>;
        if (m.c) n = <span style={{ color: m.c }}>{n}</span>;
        return <Fragment key={k}>{n}</Fragment>;
      })}
    </>
  );
}
