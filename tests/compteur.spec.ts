import type { Page } from '@playwright/test';
import { allerA, expect, ouvrirDemo, test } from './outils';

// Compteur de temps personnel (PLAN_COMPTEUR_TEMPS.md) : bouton ⏱, petits boutons, page « Mon temps », compteur oublié,
// mode automatique sans double compte. L'heure est simulée (horloge de Playwright), arrêtée puis avancée à la main.

const panneau = (page: Page) => page.getByRole('dialog', { name: 'Mon compteur de temps' });
const tuile = (page: Page, nom: string) => page.locator('.mon-temps-tuile', { hasText: nom }).locator('strong');

/** Heure suisse le 11.11.2026 (fuseau des tests : Europe/Zurich, +01:00 en novembre). */
const le11 = (heure: string) => new Date(`2026-11-11T${heure}+01:00`);

/** Démo ouverte le 11.11.2026 à `heure`, l'horloge arrêtée ; compteur activé dans les Réglages. */
async function demarrerA(page: Page, heure: string, auto = false) {
  await page.clock.install({ time: le11(`${heure}:00`) });
  await ouvrirDemo(page);
  await page.clock.pauseAt(le11(`${heure}:30`));
  await allerA(page, '/reglages');
  await page.getByLabel('Afficher mon compteur ⏱ dans la barre du haut').check();
  if (auto) await page.getByLabel(/Mode automatique/).check();
  await expect(page.locator('.compteur-btn')).toBeVisible();
}

test('compteur manuel : démarrer, arrêter, petits boutons, détail, correction et export', async ({ page }) => {
  // Sans réglage, pas de bouton ⏱.
  await ouvrirDemo(page);
  await expect(page.locator('.compteur-btn')).toHaveCount(0);

  await demarrerA(page, '14:00');
  await page.locator('.compteur-btn').click();
  const p = panneau(page);
  await p.getByLabel('Sur quoi ?').fill('Course de côte');
  await p.getByRole('button', { name: 'Démarrer' }).click();
  await page.clock.fastForward('42:00');
  await expect(page.locator('.compteur-btn .compteur-temps')).toHaveText('0:42');
  await expect(p.locator('.compteur-grand')).toHaveText('0:42:00');
  await p.getByRole('button', { name: 'Arrêter' }).click();
  await expect(p.locator('.compteur-grand')).toHaveText('Arrêté');
  await expect(page.locator('.compteur-btn .compteur-temps')).toHaveCount(0);

  // Petits boutons : deux appuis rapprochés sur +15 min font une seule entrée de 30 min ; −5 min retire.
  await p.getByRole('button', { name: '+15 min' }).click();
  await p.getByRole('button', { name: '+15 min' }).click();
  await p.getByRole('button', { name: '−5 min' }).click();
  await expect(p.locator('.compteur-totaux span', { hasText: 'Aujourd’hui' }).locator('b')).toHaveText('1 h 07');

  // Gardé après rechargement ; la page « Mon temps » en détail.
  await page.reload();
  await allerA(page, '/mon-temps');
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('1 h 07');
  await expect(tuile(page, 'Cette semaine')).toHaveText('1 h 07');
  const jour = page.locator('.mon-temps-jour').first();
  await expect(jour.locator('h3')).toContainText('mercredi 11 novembre');
  await expect(jour.locator('.mon-temps-entree')).toHaveCount(2);
  const compteur = jour.locator('.mon-temps-entree', { hasText: '14h00 – 14h42' });
  await expect(compteur).toContainText('Course de côte');
  await expect(compteur.locator('.mon-temps-duree')).toHaveText('42 min');
  await expect(jour.locator('.mon-temps-entree', { hasText: 'Ajout' }).locator('.mon-temps-duree')).toHaveText('25 min');
  await expect(page.locator('.mon-temps-libelles')).toContainText('Course de côte');

  // Corriger : le compteur a commencé à 13h30.
  await compteur.getByRole('button', { name: 'Corriger' }).click();
  await page.getByLabel('Début').fill('2026-11-11T13:30');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('1 h 37');

  // Ajouter du temps à un autre jour (hier : mardi).
  await page.getByRole('button', { name: '+ Ajouter du temps' }).click();
  await page.getByLabel('Heures').fill('2');
  await page.locator('.mon-temps .compteur-autre-jour').getByRole('button', { name: 'Ajouter' }).click();
  await expect(tuile(page, 'Cette semaine')).toHaveText('3 h 37');
  await expect(page.locator('.mon-temps-jour h3').nth(1)).toContainText('mardi 10 novembre');

  // Export CSV : une ligne par entrée.
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter (CSV)' }).click();
  const fichier = await (await telechargement).createReadStream();
  let csv = '';
  for await (const morceau of fichier) csv += morceau;
  expect(csv).toContain('Jour;Sorte;Début;Fin;Minutes;Libellé');
  expect(csv).toContain('2026-11-11;Compteur;');
  expect(csv).toContain(';72;Course de côte');
  expect(csv).toContain('2026-11-10;Ajout;;;120;');

  // Retirer une entrée, puis tout effacer.
  page.once('dialog', (d) => d.accept());
  await page.locator('.mon-temps-jour').nth(1).getByRole('button', { name: 'Retirer' }).click();
  await expect(tuile(page, 'Cette semaine')).toHaveText('1 h 37');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Tout effacer…' }).click();
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('0 min');
  await expect(page.locator('.mon-temps-detail')).toHaveCount(0);
});

test('compteur oublié : à l’ouverture, on l’arrête à l’heure choisie', async ({ page }) => {
  await demarrerA(page, '08:00');
  await page.locator('.compteur-btn').click();
  await panneau(page).getByRole('button', { name: 'Démarrer' }).click();
  await page.clock.fastForward('05:10:00');
  await page.reload();
  const f = page.getByRole('dialog', { name: 'Compteur oublié ?' });
  await expect(f).toContainText('Ton compteur tourne depuis 08h00 (5 h 10)');
  await f.getByLabel('Arrêter à').fill('2026-11-11T09:30');
  await f.getByRole('button', { name: 'Arrêter à cette heure' }).click();
  await expect(f).toHaveCount(0);
  await allerA(page, '/mon-temps');
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('1 h 30');
});

test('compteur oublié : « Continuer » le laisse tourner, le rappel repart de là', async ({ page }) => {
  await demarrerA(page, '08:00');
  await page.locator('.compteur-btn').click();
  await panneau(page).getByRole('button', { name: 'Démarrer' }).click();
  await page.clock.fastForward('04:30:00');
  await page.reload();
  await page.getByRole('dialog', { name: 'Compteur oublié ?' }).getByRole('button', { name: 'Continuer' }).click();
  await page.reload();
  await expect(page.locator('.compteur-btn .compteur-temps')).toHaveText('4:30');
  await expect(page.getByRole('dialog', { name: 'Compteur oublié ?' })).toHaveCount(0);
});

test('mode automatique : le temps dans l’appli compte, pas plus de 2 min sans geste, jamais en double avec le compteur', async ({ page }) => {
  await demarrerA(page, '10:00', true);
  await allerA(page, '/mon-temps');
  const toucher = () => page.locator('main h1').click();
  // 3 minutes d'utilisation (un geste toutes les 30 s), puis plus rien pendant 10 minutes : compté jusqu'à 2 min après le
  // dernier geste.
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(30_000);
    await toucher();
  }
  await page.clock.runFor('10:00');
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('5 min');
  await expect(page.locator('.mon-temps-entree.auto .mon-temps-duree')).toHaveText('5 min');

  // Compteur lancé : 10 minutes d'utilisation, comptées une seule fois.
  await page.locator('.compteur-btn').click();
  await panneau(page).getByRole('button', { name: 'Démarrer' }).click();
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(30_000);
    await toucher();
  }
  await page.locator('.compteur-btn').click();
  await panneau(page).getByRole('button', { name: 'Arrêter' }).click();
  await page.keyboard.press('Escape');
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('15 min');

  // Le compteur avancé sur le temps automatique : la partie commune ne compte qu'une fois.
  const compteur = page.locator('.mon-temps-entree', { hasText: '– ' }).filter({ has: page.locator('.mon-temps-duree', { hasText: '10 min' }) });
  await compteur.getByRole('button', { name: 'Corriger' }).click();
  await page.getByLabel('Début').fill('2026-11-11T10:02');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // Automatique 10h00–10h05, compteur 10h02–fin : réunis, de 10h00 à la fin du compteur.
  const fin = await page.locator('.mon-temps-entree', { hasText: '10h02 – ' }).locator('.mon-temps-quoi > span').textContent();
  const [h, m] = fin!.split('– ')[1].split('h').map(Number);
  await expect(tuile(page, 'Aujourd’hui')).toHaveText(`${(h - 10) * 60 + m} min`);
});

test('le compteur est à chacun : une autre personne a le sien', async ({ page }) => {
  await demarrerA(page, '09:00');
  await page.locator('.compteur-btn').click();
  await panneau(page).getByRole('button', { name: '+1 h' }).click();
  await page.locator('.topbar').getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user').nth(1).click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await expect(page.locator('.compteur-btn')).toHaveCount(0);
  await allerA(page, '/mon-temps');
  await expect(page.getByLabel('Afficher mon compteur ⏱ dans la barre du haut')).not.toBeChecked();
  await expect(page.locator('.mon-temps-tuiles')).toHaveCount(0);
});

test('compteur retiré de la barre du haut pendant qu’il tourne : il s’arrête', async ({ page }) => {
  await demarrerA(page, '16:00');
  await page.locator('.compteur-btn').click();
  await panneau(page).getByRole('button', { name: 'Démarrer' }).click();
  await page.clock.fastForward('20:00');
  await page.keyboard.press('Escape');
  await page.getByLabel('Afficher mon compteur ⏱ dans la barre du haut').uncheck();
  await expect(page.locator('.compteur-btn')).toHaveCount(0);
  await page.clock.fastForward('01:00:00');
  await allerA(page, '/mon-temps');
  await expect(tuile(page, 'Aujourd’hui')).toHaveText('20 min');
  await expect(page.locator('.mon-temps-entree', { hasText: '16h00 – 16h20' })).toBeVisible();
});
