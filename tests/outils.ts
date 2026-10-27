import { test as base, expect, type Page } from '@playwright/test';

// Chaque test échoue si la page lève une erreur JavaScript non rattrapée.
export const test = base.extend<{ erreurs: string[] }>({
  erreurs: [
    async ({ page }, use) => {
      const erreurs: string[] = [];
      page.on('pageerror', (e) => erreurs.push(e.message));
      await use(erreurs);
      expect(erreurs, 'Erreurs JavaScript dans la page').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Démo remise à zéro, connectée avec la première personne proposée (comité central). */
export async function ouvrirDemo(page: Page) {
  await page.goto('./?demo');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./?demo#/');
  await page.reload();
  await page.locator('.login-user').first().click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
}

/** Va sur une page de l'appli sans la recharger (l'entité ouverte reste). */
export async function allerA(page: Page, chemin: string) {
  await page.evaluate((h) => { location.hash = h; }, `#${chemin}`);
}

/** Entités de la démo. */
const ENTITES: Record<string, string> = { 'Comité central': 'u-central', 'Soirée récréative': 'u-soiree' };

/**
 * L'entité ouverte est toujours `nom` (rien n'a changé d'entité). Vue « moi » : elle ne se choisit plus dans l'appli
 * (son logo et sa couleur seulement) ; l'appli la donne dans l'attribut data-entite.
 */
export async function verifierEntite(page: Page, nom: string) {
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await expect(page.locator('.app')).toHaveAttribute('data-entite', ENTITES[nom]);
}

/** L'appli rouverte dans l'une de mes entités (celle de la connexion, comme après un lien reçu vers elle). */
export async function ouvrirEntite(page: Page, nom: string) {
  await expect(page.locator('.topbar .brand')).toBeVisible();
  if ((await page.locator('.app').getAttribute('data-entite')) === ENTITES[nom]) return;
  await page.evaluate((id) => localStorage.setItem('taches-gsa-demo-unite', id), ENTITES[nom]);
  await page.reload();
  await verifierEntite(page, nom);
}

/** Nouvelle tâche ouverte depuis le bouton « + », titre et section remplis (pas encore enregistrée). */
export async function nouvelleTache(page: Page, titre: string) {
  await page.locator('.fab').click();
  await page.locator('.fab-menu button', { hasText: 'Nouvelle tâche' }).click();
  const fiche = page.locator('.modal').first();
  await expect(fiche).toBeVisible();
  await page.getByPlaceholder('Que faut-il faire ?').fill(titre);
  await fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first().selectOption({ index: 1 });
  return fiche;
}

/** Nombre de fois où un texte apparaît tel quel dans la page (hors message de confirmation). */
export function compter(page: Page, texte: string) {
  return page.evaluate(
    (t) => [...document.querySelectorAll('main *')].filter((e) => !e.closest('.toast') && e.children.length === 0 && e.textContent?.trim() === t).length,
    texte,
  );
}
