import { test as base, expect, type Locator, type Page } from '@playwright/test';

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

/** Va sur une page de l'appli sans la recharger. */
export async function allerA(page: Page, chemin: string) {
  await page.evaluate((h) => { location.hash = h; }, `#${chemin}`);
}

/** Un seul espace (PLAN_APPLI_SIMPLE.md, D1) : ni choix d'entité, ni attribut data-entite ; l'en-tête est celui du club. */
export async function verifierUnSeulEspace(page: Page) {
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await expect(page.locator('[data-entite]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('taches-gsa-demo-unite'))).toBeNull();
}

/** Fiche d'un point : une partie (« Checklist », « Documents », « Pour info »…), dépliée si elle ne l'est pas déjà. */
export async function deplier(fiche: Locator, titre: string) {
  const partie = fiche.locator('details.tache-partie').filter({ has: fiche.page().locator('.tache-partie-titre', { hasText: new RegExp(`^${titre}$`) }) });
  if ((await partie.getAttribute('open')) === null) await partie.locator('summary').click();
  await expect(partie).toHaveAttribute('open', '');
  return partie;
}

/** Fiche d'un point : la pastille d'une étiquette que le point porte (seules celles-là sont affichées). */
export function puceEtiquette(fiche: Locator, nom: string | RegExp) {
  return fiche.locator('.etiquettes-point .chip', { hasText: nom });
}

/** Fiche d'un point : « ＋ » des étiquettes, la liste de celles qu'on peut ajouter ouverte. */
export async function choixEtiquettes(fiche: Locator) {
  await fiche.getByRole('combobox', { name: 'Ajouter une étiquette' }).click();
  const liste = fiche.page().getByRole('listbox', { name: 'Ajouter une étiquette' });
  await expect(liste).toBeVisible();
  return liste;
}

/** Fiche d'un point : une étiquette ajoutée par « ＋ ». */
export async function ajouterEtiquette(fiche: Locator, nom: string | RegExp) {
  await (await choixEtiquettes(fiche)).getByRole('option', { name: nom }).click();
  await expect(puceEtiquette(fiche, nom)).toHaveCount(1);
}

/** Nouveau point ouvert depuis le bouton « + », titre et section remplis (pas encore enregistrée). */
export async function nouvelleTache(page: Page, titre: string) {
  await page.locator('.fab').click();
  await page.locator('.fab-menu button', { hasText: 'Nouveau point' }).click();
  const fiche = page.locator('.modal').first();
  await expect(fiche).toBeVisible();
  await page.getByPlaceholder('Que faut-il faire ou savoir ?').fill(titre);
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

/** Console admin › Sections : la section devient un groupe (son étiquette), avec ces membres (démo neuve : rien à reprendre). */
export async function groupe(page: Page, section: string, membres: string[]) {
  await allerA(page, '/admin/taches');
  const coche = page.getByLabel(`Groupe : la section ${section} est une étiquette`);
  await coche.check();
  const bloc = page.locator('.groupe-section', { has: coche });
  for (const m of membres) await bloc.locator('fieldset').getByRole('button', { name: m, exact: true }).click();
  for (const m of membres) await expect(bloc.locator('fieldset').getByRole('button', { name: m, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

/** Page Événements : nouvel événement d'un jour (AAAA-MM-JJ), avec sa case « Étiquette » cochée et ces membres. */
export async function evenementEtiquete(page: Page, nom: string, jour: string, membres: string[]) {
  await allerA(page, '/evenements');
  await page.getByRole('button', { name: '+ Nouvel événement' }).click();
  const f = page.getByRole('dialog', { name: 'Nouvel événement' });
  await f.getByPlaceholder('Ajouter un titre').fill(nom);
  await f.getByLabel('Premier jour').fill(jour);
  const c = f.locator('.case-etiquette');
  await c.getByRole('checkbox').check();
  for (const m of membres) await c.getByRole('button', { name: m, exact: true }).click();
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
}
