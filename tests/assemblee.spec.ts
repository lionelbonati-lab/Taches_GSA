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
  // Feuille complète (par défaut, ce qu'on suit pendant l'AG) : texte, sous-points, chaque vote avec sa majorité.
  const statuts = feuille.locator('ol.odj > li').nth(11);
  await expect(statuts.locator('.odj-sec')).toHaveText('Modification des statuts');
  await expect(statuts.locator('.ag-texte-point')).toHaveText('Le comité propose de modifier l’article 12.');
  await expect(statuts.locator('.ag-votes-point li')).toHaveText('Vote : Modification des statuts – deux tiers');
  await expect(statuts.locator('ol.odj-l1 > li')).toHaveText('Article 12 : cotisations');
  await expect(feuille.locator('ol.odj > li').nth(2).locator('.ag-votes-point li')).toHaveText('Vote : Approbation du PV 2026 – majorité des voix exprimées');
  await expect(feuille).not.toContainText('À faire');

  // Plus simple (réglage à soi) : points et sous-points, « (vote) » à côté ; puis les points seulement.
  await page.locator('summary', { hasText: 'Contenu' }).click();
  const niveau = page.getByLabel('Niveau de détail de l’ordre du jour de l’AG');
  await expect(niveau).toHaveValue('complet');
  await niveau.selectOption('sousPoints');
  await expect(statuts.locator('.odj-sec')).toHaveText('Modification des statuts (vote, deux tiers)');
  await expect(statuts.locator('.ag-texte-point')).toHaveCount(0);
  await expect(statuts.locator('ol.odj-l1 > li')).toHaveText('Article 12 : cotisations');
  await expect(feuille.locator('ol.odj > li').nth(0).locator('.odj-sec')).toHaveText('Ouverture de l’assemblée (vote : Approbation de l’ordre du jour)');
  await niveau.selectOption('points');
  await expect(feuille.locator('ol.odj-l1')).toHaveCount(0);
  await expect(feuille.locator('ol.odj > li')).toHaveCount(13);
  await niveau.selectOption('complet');
  await page.locator('summary', { hasText: 'Contenu' }).click();

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
  await expect(envoi.locator('pre')).toContainText('◦ Vote : Approbation de l’ordre du jour – majorité des voix exprimées');
  // Version envoyée plus simple que la feuille affichée : les points seulement, le PDF refait.
  await envoi.getByLabel('Version envoyée (texte et PDF)').selectOption('points');
  await expect(envoi.locator('pre')).toContainText('1. Ouverture de l’assemblée (vote : Approbation de l’ordre du jour)');
  await expect(envoi.locator('pre')).not.toContainText('a. École de cyclisme');
  await expect(envoi.locator('.envoi-etat')).toContainText('.pdf');
  await expect(page.locator('.pv-preview > div > .pv-sheet ol.odj-l1').first()).toBeVisible();
});

test('PV de l’AG : séance, présences, notes, votes (unanimité, comptés), document, validation et correction', async ({ page }) => {
  await allerA(page, '/ag');
  await page.getByRole('button', { name: /Partir du modèle/ }).click();
  await page.getByRole('link', { name: /PV de cette AG/ }).click();
  await expect(page.locator('main .page-head h1')).toHaveText('PV de l’AG');
  await expect(page.getByLabel('Assemblée générale du PV')).toHaveValue('e12');

  // Séance : ouverture, présidence et secrétariat proposés d'après les postes du club.
  await page.getByRole('button', { name: 'Ouvrir l’assemblée' }).click();
  await expect(page.getByRole('button', { name: 'Lever la séance' })).toBeVisible();
  await expect(page.getByLabel('Président(e) de l’assemblée').locator('option:checked')).toHaveText(/Julien Moreau/);
  await expect(page.getByLabel('Secrétaire du PV').locator('option:checked')).toHaveText(/Sophie Girard/);
  // Les noms des scrutateurs : sous le point « Nomination des scrutateurs » (plus dans la séance).
  await expect(page.locator('.ag-pv-seance').getByLabel('Scrutateurs', { exact: true })).toHaveCount(0);
  const nomination = page.locator('.min-section', { hasText: '2. Nomination des scrutateurs' });
  await nomination.getByLabel('Scrutateurs', { exact: true }).fill('A. Exemple et B. Exemple');
  await page.getByLabel('Membres présents ayant droit de vote').fill('38');
  await expect(page.locator('.ag-pv-seance small', { hasText: 'Majorité absolue : 20' })).toBeVisible();
  await page.getByLabel('Excusés', { exact: true }).fill('C. Exemple, D. Exemple');
  await page.getByLabel('Présents', { exact: true }).fill('38 membres (liste de présence en annexe)');
  await page.getByLabel('Invités').focus();

  // Votes : l'ordre du jour à l'unanimité ; le PV 2026 compté.
  const v1 = page.locator('.ag-vote-res', { hasText: 'Approbation de l’ordre du jour' });
  await v1.getByRole('button', { name: 'À l’unanimité' }).click();
  await expect(v1.locator('.ag-vote-issue')).toHaveText('accepté à l’unanimité');
  const v2 = page.locator('.ag-vote-res', { hasText: 'Approbation du PV 2026' });
  await v2.getByRole('button', { name: 'Compter' }).click();
  await v2.getByLabel('Approbation du PV 2026 : pour').fill('30');
  await v2.getByLabel('Approbation du PV 2026 : contre').fill('3');
  await v2.getByLabel('Approbation du PV 2026 : abstentions').fill('5');
  await v2.getByLabel('Approbation du PV 2026 : noms des voix contre et des abstentions').fill('contre : X');
  await expect(v2.locator('.ag-vote-issue')).toHaveText('accepté par 30 voix contre 3, 5 abstentions – contre : X');
  const budget = page.locator('.ag-vote-res', { hasText: 'Budget 2027' });
  await budget.getByRole('button', { name: 'Par acclamation' }).click();

  // Notes sous un point.
  const note = page.getByRole('textbox', { name: 'Notes pour « Ouverture de l’assemblée »…' });
  await note.click();
  await page.keyboard.type('La présidence salue l’assemblée.');
  await page.getByRole('button', { name: 'Lever la séance' }).click();

  // Le PV : séance, présences, notes et résultats ; signatures en bas.
  await page.getByRole('tab', { name: 'PV' }).click();
  const feuille = page.locator('.pv-preview .pv-sheet');
  await expect(feuille.locator('.pv-kicker')).toHaveText('Procès-verbal');
  await expect(feuille.locator('.odj-head')).toContainText('Présidence : Julien Moreau');
  // Les scrutateurs : sous le point « Nomination des scrutateurs », pas dans l'en-tête.
  await expect(feuille.locator('.odj-head')).not.toContainText('Scrutateurs');
  await expect(feuille.locator('.odj-head')).toContainText('Membres présents ayant droit de vote : 38 (majorité absolue : 20)');
  await expect(feuille.locator('.odj-head')).toContainText('Excusés : C. Exemple, D. Exemple');
  const traites = feuille.locator('.pv-part', { hasText: 'Points traités' });
  await expect(traites.locator('ol.ag-odj > li').nth(0)).toContainText('La présidence salue l’assemblée.');
  await expect(traites.locator('ol.ag-odj > li').nth(1)).toContainText('Scrutateurs : A. Exemple et B. Exemple');
  await expect(traites.locator('ol.ag-odj > li').nth(0)).toContainText('Vote : Approbation de l’ordre du jour – accepté à l’unanimité');
  await expect(traites.locator('ol.ag-odj > li').nth(2)).toContainText('Vote : Approbation du PV 2026 – accepté par 30 voix contre 3, 5 abstentions');
  await expect(traites.locator('ol.ag-odj > li').nth(9)).toContainText('Vote : Budget 2027 – accepté par acclamation');
  await expect(feuille.locator('.ag-signature')).toHaveCount(2);
  await expect(feuille.locator('.ag-signature').nth(1)).toContainText('Sophie Girard');

  // Validé : archivé, en lecture seule ; « Corriger le PV » le rouvre (la version suivante sera la 2).
  await page.getByRole('button', { name: 'Valider et archiver' }).click();
  await expect(page.locator('.pv-msg')).toContainText('PV validé et archivé');
  await expect(page.locator('.ag-pv-archives .chip')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Prise de notes' }).click();
  await expect(page.getByLabel('Scrutateurs', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'À l’unanimité' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Corriger le PV' })).toBeVisible();
  await page.getByRole('button', { name: 'Corriger le PV' }).click();
  await expect(page.getByRole('button', { name: 'Valider et archiver' })).toBeVisible();
  await page.getByRole('button', { name: 'Valider et archiver' }).click();
  await expect(page.locator('.ag-pv-archives .chip')).toHaveCount(2);
  await expect(page.locator('.ag-pv-archives .chip').first()).toContainText('version 2');
});

test('PV de l’AG en 3 fenêtres : séance, point par point (votes, notes), projection, ↑ ↓, retour à la prise de notes', async ({ page }) => {
  await allerA(page, '/ag');
  await page.getByRole('button', { name: /Partir du modèle/ }).click();
  await page.getByRole('link', { name: /PV de cette AG/ }).click();
  await page.getByRole('button', { name: 'Vue en fenêtres' }).click();
  const ecran = page.getByRole('dialog', { name: /PV de l’AG en fenêtres/ });
  await expect(ecran).toBeVisible();

  // D'abord la séance : présidence et secrétariat déjà proposés ; le bandeau dit où on en est.
  await expect(ecran.locator('.pv-fiche-ou')).toHaveText('Séance et présences · 1 / 23');
  await expect(ecran.getByRole('tab', { name: 'Séance et présences' })).toBeVisible();
  await expect(ecran.getByLabel('Président(e) de l’assemblée').locator('option:checked')).toHaveText(/Julien Moreau/);
  await ecran.getByLabel('Membres présents ayant droit de vote').fill('38');
  await ecran.getByRole('button', { name: 'Ouvrir l’assemblée' }).click();

  // Point suivant : son onglet « Point », ses votes (1 à faire), ses notes en bas.
  await ecran.getByRole('button', { name: /^Suivant : 1\. Ouverture/ }).click();
  await expect(ecran.locator('.pv-fiche-ou')).toHaveText('1. Ouverture de l’assemblée · 2 / 23');
  await expect(ecran.locator('.ag-fiche-point h2')).toHaveText('1. Ouverture de l’assemblée');
  await ecran.getByRole('tab', { name: /Votes/ }).click();
  await ecran.getByRole('button', { name: 'À l’unanimité' }).click();
  await expect(ecran.getByRole('tab', { name: /Votes/ })).toContainText('1/1');
  await ecran.getByRole('textbox', { name: 'Notes pour « Ouverture de l’assemblée »…' }).fill('Bienvenue à tous.');

  // Au clavier (hors d'un champ) : ↓ passe au point suivant ; double flèche : point principal suivant.
  await ecran.locator('.pv-fiche-entete').click();
  await page.keyboard.press('ArrowDown');
  await expect(ecran.locator('.pv-fiche-ou')).toHaveText('2. Nomination des scrutateurs · 3 / 23');
  await ecran.getByRole('button', { name: /^Point suivant : 3\./ }).click();
  await ecran.getByRole('button', { name: /^Point suivant : 4\./ }).click();
  await ecran.getByRole('button', { name: /^Suivant : 5\. Rapport des différents responsables$/ }).click();
  await ecran.getByRole('button', { name: /^Suivant : 5\. Rapport des différents responsables › a\. École de cyclisme/ }).click();
  await expect(ecran.locator('.ag-fiche-point')).toContainText('Sous-point de « Rapport des différents responsables »');

  // Projection : la fenêtre de droite (pièces jointes), retenue sur l'appareil.
  await expect(ecran.locator('.pv-fenetre.f-droite')).toHaveCount(0);
  await ecran.getByRole('button', { name: /^Projection/ }).click();
  await expect(ecran.locator('.pv-fenetre.f-droite')).toContainText('Pièces jointes');

  // Échap : retour à la prise de notes, où le vote et la note sont là.
  await page.keyboard.press('Escape');
  await expect(ecran).toHaveCount(0);
  await expect(page.locator('.ag-vote-res', { hasText: 'Approbation de l’ordre du jour' }).locator('.ag-vote-issue')).toHaveText('accepté à l’unanimité');
  await expect(page.getByRole('textbox', { name: 'Notes pour « Ouverture de l’assemblée »…' })).toHaveText('Bienvenue à tous.');
  await expect(page.getByRole('button', { name: 'Vue en fenêtres' })).toHaveAttribute('aria-pressed', 'false');
  // Rouverte : la projection est restée choisie.
  await page.getByRole('button', { name: 'Vue en fenêtres' }).click();
  await expect(page.getByRole('dialog', { name: /PV de l’AG en fenêtres/ }).locator('.pv-fenetre.f-droite')).toBeVisible();
});
