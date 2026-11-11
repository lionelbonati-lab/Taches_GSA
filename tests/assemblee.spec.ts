import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { allerA, expect, ouvrirDemo, test } from './outils';

// Onglet « Assemblée générale » (PLAN_ASSEMBLEE_GENERALE.md, étape AG1) : visible des seuls rôles qui en ont le droit
// (console admin), et son ordre du jour (points sans statut ni délai, sous-points, votes, convocation).

test.beforeEach(async ({ page }) => {
  await ouvrirDemo(page);
});

const changer = async (page: import('@playwright/test').Page, nom: string) => {
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: nom }).first().click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
};

test('onglet AG : seulement pour les rôles qui en ont le droit dans la console admin', async ({ page }) => {
  // Julien Moreau, admin : l'onglet est là.
  await expect(page.locator('.topbar nav.tabs').getByRole('link', { name: 'AG', exact: true })).toBeVisible();

  // Sophie Girard, secrétaire : ni l'onglet, ni la page (retour à l'accueil).
  await changer(page, 'Sophie Girard');
  await expect(page.locator('.topbar nav.tabs').getByRole('link', { name: 'AG', exact: true })).toHaveCount(0);
  await page.goto('./?demo#/ag');
  await expect(page).toHaveURL(/#\/$/);

  // L'admin coche le droit pour le rôle « Secrétaire » : Sophie a l'onglet.
  await changer(page, 'Julien Moreau');
  await allerA(page, '/admin/droits');
  const droit = page.getByLabel('Assemblée générale (onglet : ordre du jour et PV de l’AG) – Secrétaire');
  await expect(droit).not.toBeChecked();
  await droit.check();
  await changer(page, 'Sophie Girard');
  await page.locator('.topbar nav.tabs').getByRole('link', { name: 'AG', exact: true }).click();
  await expect(page.locator('main .page-head h1')).toHaveText('Ordre du jour de l’AG');
});

test('ordre du jour de l’AG : modèle, points sans statut ni délai, sous-points, votes et convocation', async ({ page }) => {
  await allerA(page, '/ag');
  await expect(page.locator('main .page-head h1')).toHaveText('Ordre du jour de l’AG');
  // L'AG de l'agenda (démo : Assemblée générale 2027, le 13.03.2027) est proposée.
  await expect(page.getByLabel('Assemblée générale à préparer')).toHaveValue('e12');
  await page.getByRole('button', { name: /Partir du modèle/ }).click();
  await expect(page.locator('.ag-points > .ag-liste > li')).toHaveCount(12);
  await expect(page.getByRole('tab', { name: 'Points (12)' })).toBeVisible();

  // Un nouveau point, avec son texte et un vote à la majorité des deux tiers.
  await page.getByRole('button', { name: 'Ajouter un point' }).click();
  const fiche = page.getByRole('dialog', { name: 'Nouveau point' });
  await fiche.getByLabel('Intitulé', { exact: true }).fill('Modification des statuts');
  await fiche.getByLabel(/^Texte/).fill('Le comité propose de modifier l’article 12.');
  await fiche.getByRole('button', { name: 'Soumettre au vote' }).click();
  await expect(fiche.getByLabel('Question du vote 1')).toHaveValue('Modification des statuts');
  await fiche.getByLabel('Majorité du vote 1').selectOption('deuxTiers');
  await fiche.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.ag-points > .ag-liste > li')).toHaveCount(13);

  // Un sous-point au nouveau point, puis le point remonte d'un cran (avant « Divers »).
  await page.getByRole('button', { name: 'Ajouter un sous-point à « Modification des statuts »' }).click();
  const sous = page.getByRole('dialog', { name: 'Nouveau sous-point de « Modification des statuts »' });
  await sous.getByLabel('Intitulé', { exact: true }).fill('Article 12 : cotisations');
  await sous.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('button', { name: 'Monter « Modification des statuts »' }).click();
  await expect(page.locator('.ag-points > .ag-liste > li').nth(11).locator('.ag-titre').first()).toContainText('Modification des statuts');
  await expect(page.locator('.ag-points > .ag-liste > li').nth(12).locator('.ag-titre').first()).toContainText('Divers');

  // Convocation : titre de l'AG, points numérotés, sous-points, textes et votes ; aucun statut ni délai.
  await page.getByRole('tab', { name: 'Convocation' }).click();
  const feuille = page.locator('.pv-sheet');
  await expect(feuille.locator('h1')).toHaveText('Assemblée générale 2027');
  await expect(feuille.locator('.pv-meta')).toHaveText('samedi 13 mars 2027');
  await expect(feuille.locator('ol.odj > li')).toHaveCount(13);
  const statuts = feuille.locator('ol.odj > li').nth(11);
  await expect(statuts.locator('.odj-sec')).toHaveText('Modification des statuts (vote, deux tiers)');
  await expect(statuts.locator('.ag-texte-point')).toHaveText('Le comité propose de modifier l’article 12.');
  await expect(statuts.locator('ol.odj-l1 > li')).toHaveText('Article 12 : cotisations');
  await expect(feuille.locator('ol.odj > li').nth(2).locator('.odj-sec')).toHaveText('Approbation du PV 2026 (vote)');
  await expect(feuille.locator('ol.odj > li').nth(0).locator('.odj-sec')).toHaveText('Ouverture de l’assemblée (vote : Approbation de l’ordre du jour)');
  await expect(feuille).not.toContainText('À faire');

  // Un clic sur un point de la convocation ouvre sa fiche.
  await feuille.locator('.odj-task', { hasText: 'Divers' }).click();
  await expect(page.getByRole('dialog', { name: 'Point 13' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Point 13' }).getByRole('button', { name: 'Annuler' }).click();

  // Texte d'introduction ; archive dans l'AG ; tout reste après rechargement.
  await page.locator('summary', { hasText: 'Textes de la convocation' }).click();
  await page.getByLabel('Avant les points').fill('Le comité a le plaisir de vous convier à l’assemblée générale.');
  await page.getByLabel('Après les points').focus();
  await expect(feuille.locator('.ag-texte').first()).toHaveText('Le comité a le plaisir de vous convier à l’assemblée générale.');
  await page.getByRole('button', { name: 'Archiver dans l’AG' }).click();
  await expect(page.locator('summary', { hasText: 'Archives (1)' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Points (13)' })).toBeVisible();
  await expect(page.locator('.pv-sheet ol.odj > li')).toHaveCount(13);

  // Les points de l'AG ne sont pas des points de la liste.
  const donnees = await page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!));
  expect(donnees.tasks.some((t: { titre: string }) => t.titre === 'Modification des statuts')).toBe(false);
  expect(donnees.assemblees).toHaveLength(1);
  expect(donnees.assemblees[0].eventId).toBe('e12');
});

test('AG suivante : ses points repris de l’AG précédente, années avancées d’un an', async ({ page }) => {
  await allerA(page, '/ag');
  await page.getByRole('button', { name: /Partir du modèle/ }).click();
  await expect(page.locator('.ag-points > .ag-liste > li')).toHaveCount(12);

  // Nouvelle AG (événement de type « Assemblée générale »), le 11.03.2028 : choisie d'office.
  await page.getByRole('button', { name: 'Nouvelle AG' }).click();
  const f = page.getByRole('dialog', { name: 'Nouvel événement' });
  await f.getByLabel('Premier jour').fill('2028-03-11');
  await expect(f.getByPlaceholder('Assemblée générale 2027')).toHaveValue('Assemblée générale 2028');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.getByLabel('Assemblée générale à préparer').locator('option:checked')).toHaveText(/Assemblée générale 2028/);

  await page.getByRole('button', { name: 'Reprendre « Assemblée générale 2027 » (12 points)' }).click();
  await expect(page.locator('.ag-points > .ag-liste > li')).toHaveCount(12);
  await expect(page.locator('.ag-points > .ag-liste > li').nth(2).locator('.ag-titre').first()).toContainText('Approbation du PV 2027');
  await expect(page.locator('.ag-points > .ag-liste > li').nth(5).locator('.ag-titre').first()).toContainText('Comptes exercices 2027');
  await expect(page.locator('.ag-points > .ag-liste > li').nth(9).locator('.ag-titre').first()).toContainText('Budget 2028');
  // L'ordre du jour de l'AG 2027 n'a pas changé.
  await page.getByLabel('Assemblée générale à préparer').selectOption('e12');
  await page.getByRole('tab', { name: /Points/ }).click();
  await expect(page.locator('.ag-points > .ag-liste > li').nth(5).locator('.ag-titre').first()).toContainText('Comptes exercices 2026');
});

test('carte de l’AG dans les événements : lien vers son ordre du jour', async ({ page }) => {
  await allerA(page, '/evenements');
  await page.getByRole('link', { name: 'Ordre du jour de l’AG →' }).first().click();
  await expect(page).toHaveURL(/#\/ag\?ag=e12$/);
  await expect(page.getByLabel('Assemblée générale à préparer')).toHaveValue('e12');
});

test('convocation de l’AG : documents en annexe, PDF, modifiée à la main, email aux membres', async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++) pdf.addPage([595, 842]);
  await allerA(page, '/ag');
  await page.getByRole('button', { name: /Partir du modèle/ }).click();

  // Les comptes (PDF) joints au point « Comptes exercices 2026 ».
  await page.locator('.ag-titre', { hasText: 'Comptes exercices 2026' }).click();
  const fiche = page.getByRole('dialog', { name: 'Point 6' });
  await fiche.locator('input[type=file]').first().setInputFiles([{ name: 'comptes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) }]);
  await expect(fiche.locator('.doc-list li')).toHaveCount(1);
  await fiche.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.ag-titre', { hasText: 'Comptes exercices 2026' })).toContainText('📎 1');

  // Convocation : le document nommé sous son point ; en annexe, ses pages reproduites à la fin.
  await page.getByRole('tab', { name: 'Convocation' }).click();
  const feuille = page.locator('.pv-sheet');
  await expect(feuille.locator('ol.odj > li').nth(5).locator('.ag-docs-point')).toContainText('comptes.pdf');
  await page.locator('summary', { hasText: 'Contenu' }).click();
  await page.getByText('Joindre les fichiers des points en fin de convocation').click();
  await expect(feuille.locator('ol.odj > li').nth(5).locator('.ag-docs-point')).toContainText('comptes.pdf (annexe 1)');
  await expect(page.locator('.pv-annexes-page')).toHaveCount(2);

  // PDF créé par l'appli : la convocation, puis les deux pages des comptes.
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const cree = await PDFDocument.load(readFileSync((await (await telechargement).path())!));
  expect(cree.getPageCount()).toBeGreaterThanOrEqual(3);

  // Modifiée à la main : c'est cette version qui reste affichée.
  await page.getByRole('button', { name: 'Modifier le texte' }).click();
  const edition = page.locator('.pv-sheet.editing');
  await edition.locator('h1').evaluate((h) => (h.textContent = 'Assemblée générale ordinaire 2027'));
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Assemblée générale ordinaire 2027');
  await expect(page.locator('.odj-edit-bar')).toContainText('Version modifiée à la main');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Revenir à la version générée' }).click();
  await expect(page.locator('.pv-sheet h1')).toHaveText('Assemblée générale 2027');

  // Email : aux membres du club, en copie cachée, avec le PDF joint.
  await page.getByRole('button', { name: 'Envoyer par email' }).click();
  const envoi = page.getByRole('dialog', { name: 'Envoyer la convocation par email' });
  await expect(envoi.getByRole('radio', { name: 'Membres du club' })).toHaveAttribute('aria-checked', 'true');
  await expect(envoi).toContainText(/Cci \(copie cachée\) : \d+ adresses/);
  await expect(envoi.locator('.envoi-etat')).toContainText('.pdf');
  await envoi.getByRole('radio', { name: 'Comité' }).click();
  await expect(envoi).toContainText(/À : \d+ adresses?/);
  await envoi.getByText('Aperçu du texte').click();
  await expect(envoi.locator('pre')).toContainText('1. Ouverture de l’assemblée');
});
