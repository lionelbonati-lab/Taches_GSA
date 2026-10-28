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

/**
 * Session du club (PLAN_CLUB_SANS_ENTITE.md, étape 1) : l'appli ne s'appuie sur aucune entité. Ni entité de base
 * retenue, ni attribut data-entite ; l'en-tête est celui du club.
 */
export async function verifierSansEntite(page: Page) {
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await expect(page.locator('[data-entite]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('taches-gsa-demo-unite'))).toBeNull();
}

/**
 * Nouvelle tâche ouverte depuis le bouton « + », titre et section remplis (pas encore enregistrée) ; `entite` : créée
 * dans celle-ci (choisie dans la fenêtre), sinon dans celle proposée.
 */
export async function nouvelleTache(page: Page, titre: string, entite?: string) {
  await page.locator('.fab').click();
  await page.locator('.fab-menu button', { hasText: 'Nouvelle tâche' }).click();
  const fiche = page.locator('.modal').first();
  await expect(fiche).toBeVisible();
  await page.getByPlaceholder('Que faut-il faire ?').fill(titre);
  if (entite) {
    const choix = fiche.getByRole('combobox', { name: 'Entité' });
    if (!(await choix.textContent())?.includes(entite)) {
      await choix.click();
      await page.getByRole('option', { name: new RegExp(entite) }).click();
    }
    await expect(choix).toHaveText(new RegExp(entite));
  }
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
