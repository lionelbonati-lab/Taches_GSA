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
  await expect(page.locator('.unit-btn')).toBeVisible();
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
