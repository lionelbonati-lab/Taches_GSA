// Nettoyage du HTML enregistré (ordre du jour modifié à la main, archives) avant de l'afficher :
// ces documents sont écrits par des membres et relus par d'autres, rien ne doit s'y exécuter.

const BANNED = 'script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, select, svg, math';
const SAFE_URL = /^(data:image\/(png|jpeg|webp);base64,|https?:|mailto:|#|\.\/)/i;

/** HTML nettoyé ; `champs` remplit les éléments marqués data-champ (ex. les excusés, à jour même dans un document figé). */
export function cleanHtml(html: string, champs: Record<string, string> = {}): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll<HTMLElement>('[data-champ]').forEach((el) => {
    const v = champs[el.dataset.champ ?? ''];
    if (v === undefined) return;
    el.textContent = v;
    el.classList.toggle('odj-fill', !v);
  });
  doc.body.querySelectorAll(BANNED).forEach((el) => el.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'contenteditable' || n === 'srcset' || n === 'formaction') el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src' || n === 'xlink:href') && !SAFE_URL.test(a.value.trim())) el.removeAttribute(a.name);
      else if (n === 'style' && /url\s*\(|expression\s*\(/i.test(a.value)) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}
