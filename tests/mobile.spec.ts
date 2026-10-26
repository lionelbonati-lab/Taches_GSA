import { expect, nouvelleTache, ouvrirDemo, test } from './outils';

// Démo sur téléphone : pages sans défilement horizontal, fiche de tâche utilisable.

test.beforeEach(async ({ page }) => {
  await ouvrirDemo(page);
});

test('pages principales à la largeur de l’écran', async ({ page }) => {
  for (const h of ['/', '/taches', '/agenda', '/comite', '/sondages', '/reglages']) {
    await test.step(h, async () => {
      await page.goto('./?demo#' + h);
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      await expect(page.locator('.erreur-appli')).toHaveCount(0);
      const deborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(deborde, `${h} : défilement horizontal`).toBeLessThanOrEqual(1);
    });
  }
});

test('fiche de tâche créée sur téléphone', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Appeler le traiteur');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('main').getByText('Appeler le traiteur').filter({ visible: true }).first()).toBeVisible();
});
