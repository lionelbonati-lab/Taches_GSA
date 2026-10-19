import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/**
 * Zone de texte qui s'agrandit avec son contenu (remarque, description…) : tout le texte reste visible,
 * même en lecture seule, où une zone désactivée ne se fait pas toujours défiler. `rows` : hauteur minimale.
 */
export function ZoneTexte({ rows = 2, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ajuster = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  };
  useLayoutEffect(ajuster, [props.value]);
  // Largeur changée (fenêtre, téléphone tourné) : les lignes se replient autrement.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let largeur = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === largeur) return;
      largeur = el.clientWidth;
      ajuster();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} rows={rows} {...props} />;
}
