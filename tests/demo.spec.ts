import { compter, expect, nouvelleTache, ouvrirDemo, test } from './outils';

// Parcours essentiels de la démo, sur ordinateur.

test.beforeEach(async ({ page }) => {
  await ouvrirDemo(page);
});

test('toutes les pages s’ouvrent sans erreur', async ({ page }) => {
  const pages = ['/', '/taches', '/agenda', '/comite', '/evenements', '/ordre-du-jour', '/pv', '/sondages', '/organigramme', '/membres-club', '/reglages', '/admin', '/admin/droits', '/propositions', '/mots-de-passe', '/aide'];
  for (const h of pages) {
    await test.step(h, async () => {
      await page.goto('./?demo#' + h);
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      await expect(page.locator('.chargement-page')).toHaveCount(0);
      await expect(page.locator('.erreur-appli')).toHaveCount(0);
    });
  }
});

test('page lourde ouverte directement par son adresse', async ({ page, context }) => {
  const autre = await context.newPage();
  const erreurs: string[] = [];
  autre.on('pageerror', (e) => erreurs.push(e.message));
  await autre.goto('./?demo#/organigramme');
  await expect(autre.locator('main h1, main h2').first()).toBeVisible();
  await expect(autre.locator('.erreur-appli')).toHaveCount(0);
  expect(autre.url()).toContain('organigramme');
  expect(erreurs).toEqual([]);
  await page.close();
});

test('tâche créée avec checklist et répétition, retrouvée à la réouverture', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Préparer le matériel');
  await fiche.locator('.chip', { hasText: 'Checklist' }).click();
  const liste = fiche.locator('fieldset.full', { hasText: 'Checklist' }).first();
  await liste.getByPlaceholder('Ajouter une étape…').fill('Compter les cordes');
  await liste.getByRole('button', { name: 'Ajouter' }).click();
  await expect(liste.locator('.check-row')).toHaveCount(1);
  await fiche.locator('.chip', { hasText: 'Répétition' }).click();
  await fiche.locator('label.full', { hasText: 'Répétition' }).locator('select').selectOption({ index: 1 });
  await expect(fiche.locator('.recur-note').first()).toBeVisible();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('main').getByText('Préparer le matériel').filter({ visible: true }).first().click();
  const rouverte = page.locator('.modal').first();
  await expect(rouverte.locator('.check-row')).toHaveCount(1);
  await expect(rouverte.locator('.check-row')).toContainText('Compter les cordes');
  await expect(rouverte.locator('.recur-note').first()).toBeVisible();
});

test('discussion : commenter, corriger puis retirer un commentaire', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche discutée');
  await expect(fiche.getByLabel('Nouveau commentaire')).toHaveCount(0);
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('main').getByText('Tâche discutée').filter({ visible: true }).first().click();
  const rouverte = page.locator('.modal').first();
  const discussion = rouverte.getByRole('region', { name: 'Discussion' });
  await discussion.getByLabel('Nouveau commentaire').fill('Qui apporte la rallonge ?');
  await discussion.getByRole('button', { name: 'Envoyer' }).click();
  await expect(discussion.locator('.discussion-liste li')).toHaveCount(1);
  await expect(discussion.locator('.discussion-liste li')).toContainText('Qui apporte la rallonge ?');
  await expect(discussion.getByLabel('Nouveau commentaire')).toHaveValue('');

  await discussion.getByRole('button', { name: 'Corriger' }).click();
  await discussion.getByLabel('Corriger le commentaire').fill('Qui apporte les rallonges ?');
  await discussion.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(discussion.locator('.discussion-liste li')).toContainText('Qui apporte les rallonges ?');
  await expect(discussion.locator('.discussion-liste li')).toContainText('corrigé');

  page.once('dialog', (d) => void d.accept());
  await discussion.getByRole('button', { name: 'Retirer' }).click();
  await expect(discussion.locator('.discussion-liste li')).toHaveCount(0);
});

test('historique : création puis changement de titre', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche suivie');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('main').getByText('Tâche suivie').filter({ visible: true }).first().click();
  await page.getByPlaceholder('Que faut-il faire ?').fill('Tâche suivie de près');
  await page.locator('.modal').first().getByRole('button', { name: /^Enregistrer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('main').getByText('Tâche suivie de près').filter({ visible: true }).first().click();
  const historique = page.locator('.modal').first().locator('details.historique');
  await historique.locator('summary').click();
  await expect(historique.locator('.historique-liste > li')).toHaveCount(2);
  await expect(historique.locator('.historique-liste > li').first()).toContainText('Titre : « Tâche suivie » → « Tâche suivie de près »');
  await expect(historique.locator('.historique-liste > li').last()).toContainText('a créé la tâche');
});

test('nouvelle tâche : À prendre et Pour info s’ajoutent', async ({ page }) => {
  const fiche = await nouvelleTache(page, 'Tenir le stand');
  await fiche.locator('.chip', { hasText: 'À prendre' }).click();
  await expect(fiche.locator('.a-prendre')).toBeVisible();
  await fiche.locator('.chip', { hasText: 'Pour info' }).click();
  await expect(fiche.getByText('Pour info', { exact: false }).first()).toBeVisible();
  await expect(fiche.locator('.chip', { hasText: 'Pour info' })).toHaveCount(0);
});

test('Annuler puis Refaire une création de tâche', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Réserver la salle');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect.poll(() => compter(page, 'Réserver la salle')).toBeGreaterThan(0);

  await page.locator('.annuler-btn').first().click();
  await expect.poll(() => compter(page, 'Réserver la salle')).toBe(0);
  await expect(page.locator('.toast')).toContainText('Annulé');

  await page.keyboard.press('Control+y');
  await expect.poll(() => compter(page, 'Réserver la salle')).toBeGreaterThan(0);
  await page.keyboard.press('Control+z');
  await expect.poll(() => compter(page, 'Réserver la salle')).toBe(0);
});

test('les données de la démo restent après un rechargement', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Commander les maillots');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('main').getByText('Commander les maillots').filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('.annuler-btn')).toHaveCount(0);
});

test('recherche globale (Ctrl+K) : tâche, séance, personne', async ({ page }) => {
  const fiche = await nouvelleTache(page, 'Commander les maillots');
  await fiche.locator('textarea').first().fill('Tailles à demander avant la Fête de Noël');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  const champ = page.getByRole('searchbox', { name: 'Rechercher' });
  await expect(champ).toBeFocused();
  await champ.fill('maillot');
  await expect(page.locator('.recherche-item').first()).toBeVisible();
  await expect(page.locator('.recherche-item mark').first()).toHaveText(/maillot/i);
  // Sans accents ni majuscules, et trouvé dans la remarque
  await champ.fill('fete noel');
  await expect(page.locator('.recherche-extrait').first()).toContainText('Fête de Noël');
  await champ.fill('COMITE');
  await expect(page.locator('.recherche-liste h3').first()).toBeVisible();
  // Personne connectée retrouvée par son nom de famille
  const nom = (await page.locator('.who-text strong').first().textContent()) ?? '';
  await champ.fill(nom.split(' ').slice(1).join(' ') || nom);
  await expect(page.locator('.recherche-liste section', { has: page.locator('h3', { hasText: 'Personnes' }) }).locator('.recherche-item').first()).toBeVisible();
  // Entrée : ouvre le premier résultat
  await champ.fill('maillot');
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Que faut-il faire ?')).toHaveValue('Commander les maillots');
});
