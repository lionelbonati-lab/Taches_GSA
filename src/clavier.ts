// Clavier de l'écran (téléphone, tablette). Avec « interactive-widget=resizes-content » (index.html), Android rapetisse
// la page au-dessus du clavier : l'en-tête et la pilule restent à l'écran au lieu de glisser avec elle. Pendant qu'on
// écrit, la classe « clavier » sur <html> cache le bouton « + » et la barre du bas (place pour écrire) ; elle tombe dès
// que le clavier se ferme, même si le champ reste actif. Sur iPhone et iPad, seule la partie visible rapetisse : même
// repère.

const SAISIE =
  'input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range], [type=color], [type=file], [type=date], [type=time], [type=datetime-local], [type=month], [type=week]), textarea, [contenteditable]:not([contenteditable="false"])';

export function suivreClavier() {
  const vv = window.visualViewport;
  let largeur = 0;
  let pleine = 0;
  const maj = () => {
    const h = vv ? vv.height * vv.scale : window.innerHeight;
    // Écran tourné ou fenêtre redimensionnée : nouvelle hauteur de référence.
    if (window.innerWidth !== largeur) {
      largeur = window.innerWidth;
      pleine = h;
    }
    pleine = Math.max(pleine, h);
    const saisie = document.activeElement?.matches(SAISIE) ?? false;
    document.documentElement.classList.toggle('clavier', saisie && pleine - h > 120);
  };
  maj();
  window.addEventListener('resize', maj);
  vv?.addEventListener('resize', maj);
}
