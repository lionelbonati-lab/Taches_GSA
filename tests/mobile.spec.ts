import { expect, nouvelleTache, ouvrirDemo, test } from './outils';

// Démo sur téléphone : pages sans défilement horizontal, fiche de tâche utilisable.

test.beforeEach(async ({ page }) => {
  await ouvrirDemo(page);
});

test('pages principales à la largeur de l’écran', async ({ page }) => {
  for (const h of ['/', '/taches', '/messages', '/agenda', '/chronologie', '/comite', '/sondages', '/reglages', '/etiquettes', '/evenements', '/admin/taches']) {
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

test('barre du bas : onglets choisis et rangés', async ({ page }) => {
  await page.goto('./?demo#/');
  const barre = page.locator('.bottomnav');
  await expect(barre.locator('a')).toHaveText(['Accueil', 'Points', 'Messages', 'Agenda', 'Comité']);
  await barre.getByRole('button', { name: 'Plus' }).click();
  await page.getByRole('button', { name: 'Modifier la barre du bas' }).click();
  const fenetre = page.getByRole('dialog', { name: 'Barre du bas' });
  // 5 onglets au plus : décocher Agenda pour mettre Sondages, puis le monter.
  await expect(fenetre.getByRole('checkbox', { name: 'Sondages' })).toBeDisabled();
  await fenetre.getByRole('checkbox', { name: 'Agenda' }).uncheck();
  await fenetre.getByRole('checkbox', { name: 'Sondages' }).check();
  await fenetre.getByRole('button', { name: 'Monter « Sondages »' }).click();
  await fenetre.getByRole('button', { name: 'Fermer' }).last().click();
  await expect(barre.locator('a')).toHaveText(['Accueil', 'Points', 'Messages', 'Sondages', 'Comité']);
  // Agenda passe dans « Plus ».
  await barre.getByRole('button', { name: 'Plus' }).click();
  await expect(page.locator('.sheet').getByRole('link', { name: 'Calendrier' })).toBeVisible();
});

test('clavier ouvert : le « + » et la barre du bas laissent la place', async ({ page }) => {
  await page.goto('./?demo#/messages');
  const taille = page.viewportSize()!;
  await page.getByRole('searchbox', { name: 'Rechercher dans les messages' }).click();
  await page.setViewportSize({ width: taille.width, height: taille.height - 330 });
  await expect(page.locator('.fab')).toBeHidden();
  await expect(page.locator('.bottomnav')).toBeHidden();
  await expect(page.locator('.topbar')).toBeInViewport({ ratio: 1 });
  // Clavier refermé, champ encore actif : tout revient.
  await page.setViewportSize(taille);
  await expect(page.locator('.fab')).toBeVisible();
  await expect(page.locator('.bottomnav')).toBeVisible();
});

test('événements sur téléphone : les boutons à gauche sous la date ; « Points » mène à ses points', async ({ page }) => {
  await page.goto('./?demo#/evenements');
  // La Bruntrutaine (son étiquette, ses membres) : un seul avancement, plus de liens « Voir les points ».
  const carte = page.locator('article.carte-evenement', { has: page.getByRole('button', { name: 'Bruntrutaine', exact: true }) });
  await expect(carte).toContainText('6 membres');
  await expect(carte.locator('.progress-wrap')).toHaveCount(1);
  await expect(carte.getByRole('link', { name: /Voir les points|Points de l’étiquette/ })).toHaveCount(0);
  const date = (await carte.locator('.dateblock').boundingBox())!;
  const titre = (await carte.getByRole('button', { name: 'Bruntrutaine', exact: true }).boundingBox())!;
  for (const nom of ['Chronologie', 'Points', 'Modifier']) {
    const b = (await carte.locator('.agenda-actions').getByRole(nom === 'Points' ? 'link' : 'button', { name: nom }).boundingBox())!;
    expect(b.y, `${nom} sous la date`).toBeGreaterThanOrEqual(date.y + date.height - 1);
    expect(b.x + b.width, `${nom} à gauche du nom`).toBeLessThanOrEqual(titre.x + 1);
  }
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(deborde).toBeLessThanOrEqual(1);
  await carte.getByRole('link', { name: 'Points' }).click();
  await expect(page).toHaveURL(/#\/taches\?etiquette=et-u-bruntrutaine/);
});

test('événements sur téléphone : boutons en icônes seules, pas de « Discussion » ; nom d’étiquette trop long rogné au milieu', async ({ page }) => {
  await page.goto('./?demo#/evenements');
  const soiree = page.locator('article.carte-evenement', { hasText: 'Courtemautruy' });
  const actions = soiree.locator('.agenda-actions');
  // Leur nom reste pour les lecteurs d'écran, sans prendre de place.
  for (const [role, nom] of [['button', 'Chronologie'], ['link', 'Points'], ['button', 'Modifier'], ['button', 'Copier']] as const) {
    const b = actions.getByRole(role, { name: nom, exact: true });
    await expect(b, nom).toBeVisible();
    expect((await b.locator('.libelle').boundingBox())!.width, `${nom} : icône seule`).toBeLessThanOrEqual(1);
  }
  // La discussion de l'étiquette se trouve dans « Messages », plus sur la carte (même pour ses membres).
  await expect(page.locator('main .agenda').getByRole('link', { name: 'Discussion' })).toHaveCount(0);
  await expect(page.locator('main .agenda').getByRole('button', { name: 'Discussion' })).toHaveCount(0);

  // Nom long (celui de l'événement) : la pastille reste dans la carte, le début et l'année visibles.
  await actions.getByRole('button', { name: 'Modifier' }).click();
  const f = page.getByRole('dialog', { name: 'Événement' });
  await f.getByPlaceholder('Ajouter un titre').fill('Soirée récréative et repas de soutien du club 2026');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const badge = soiree.locator('.etiquette-taches .badge.etiquette');
  await expect(badge).toHaveText('Soirée récréative et repas de soutien du club 2026');
  const debut = badge.locator('.etiquette-debut');
  expect(await debut.evaluate((x) => x.scrollWidth > x.clientWidth), 'début rogné').toBe(true);
  await expect(badge.locator('.etiquette-fin')).toHaveText('2026');
  const b = (await badge.boundingBox())!;
  const carte = (await soiree.locator('.grow').boundingBox())!;
  expect(b.x + b.width, 'pastille dans la carte').toBeLessThanOrEqual(carte.x + carte.width + 1);
  const deborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(deborde).toBeLessThanOrEqual(1);
});

test('PV sur téléphone : pas de vue en fenêtres, même choisie sur un ordinateur', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Point du PV au téléphone');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem('taches-gsa-pv-fenetres', '1'));
  await page.goto('./?demo#/pv');
  await expect(page.locator('.min-task[data-point="Point du PV au téléphone"]')).toBeVisible();
  await expect(page.locator('.pv-fiche-ecran')).toHaveCount(0);
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  await expect(pilule).toBeVisible();
  await expect(pilule.getByRole('button', { name: /^Vue en fenêtres/ })).toBeHidden();
});

test('chronologie : une colonne, et « Déplacer » sans glisser', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-09T09:00:00Z'));
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const moi = d.people[0].id;
    d.tasks.push({
      id: 't-maillots', sectionId: d.sections[0].id, sousSection: '', titre: 'Commander les maillots', responsables: [moi], statusId: d.statuses[0].id, delai: '2026-11-18',
      remarque: '', checklist: [], createdBy: moi, updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(k, JSON.stringify(d));
  }, cle);
  await page.goto('./?demo#/chronologie');
  await page.reload();
  // Une seule colonne : la séance et l'événement l'un sous l'autre, à la même largeur.
  const seance = page.locator('article.cc-carte', { hasText: 'Comité de décembre 2026' });
  const soiree = page.locator('article.cc-carte', { hasText: 'Soirée récréative' });
  expect((await seance.boundingBox())!.x).toBeCloseTo((await soiree.boundingBox())!.x, 0);
  await page.getByRole('button', { name: 'Déplacer « Commander les maillots »' }).click();
  const fenetre = page.getByRole('dialog', { name: 'Déplacer « Commander les maillots »' });
  await fenetre.getByLabel('Vers').selectOption({ label: 'Comité de décembre 2026 · 03.12.2026' });
  await fenetre.getByRole('button', { name: 'Déplacer' }).click();
  await expect(seance).toContainText('Commander les maillots');
});
