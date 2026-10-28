import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { allerA, compter, expect, nouvelleTache, ouvrirDemo, ouvrirEntite, test, verifierEntite } from './outils';

// Parcours essentiels de la démo, sur ordinateur.

test.beforeEach(async ({ page }) => {
  await ouvrirDemo(page);
});

test('toutes les pages s’ouvrent sans erreur', async ({ page }) => {
  const pages = ['/', '/taches', '/messages', '/agenda', '/comite', '/evenements', '/ordre-du-jour', '/pv', '/sondages', '/organigramme', '/membres-club', '/reglages', '/admin', '/admin/droits', '/propositions', '/mots-de-passe', '/aide'];
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

test('tâche créée avec checklist, répétition et statut, retrouvée à la réouverture', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Préparer le matériel');
  await fiche.locator('.chip', { hasText: 'Checklist' }).click();
  const liste = fiche.locator('fieldset.full', { hasText: 'Checklist' }).first();
  await liste.getByPlaceholder('Ajouter une étape…').fill('Compter les cordes');
  await liste.getByRole('button', { name: 'Ajouter' }).click();
  await expect(liste.locator('.check-row')).toHaveCount(1);
  await fiche.getByRole('combobox', { name: 'Statut' }).click();
  await page.getByRole('option', { name: 'En cours' }).click();
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
  await expect(rouverte.getByRole('combobox', { name: 'Statut' })).toHaveText('En cours');
});

test('discussion : commenter, corriger puis retirer un commentaire', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche discutée');
  await expect(fiche.getByRole('button', { name: 'Discussion', exact: true })).toHaveCount(0);
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('main').getByText('Tâche discutée').filter({ visible: true }).first().click();
  // La bulle en haut de la fiche ouvre la discussion dans sa fenêtre, curseur dans le champ.
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'Tâche discutée' });
  const discussion = chat.getByRole('region', { name: 'Discussion' });
  await expect(discussion.getByLabel('Nouveau commentaire')).toBeFocused();
  await discussion.getByLabel('Nouveau commentaire').fill('Qui apporte la rallonge ?');
  await discussion.getByLabel('Nouveau commentaire').press('Enter');
  await expect(discussion.locator('.discussion-message')).toHaveCount(1);
  await expect(discussion.locator('.discussion-message.mien')).toContainText('Qui apporte la rallonge ?');
  await expect(discussion.getByRole('separator')).toHaveText('Aujourd’hui');
  await expect(discussion.getByLabel('Nouveau commentaire')).toHaveValue('');

  await discussion.getByRole('button', { name: 'Corriger' }).click();
  await discussion.getByLabel('Corriger le commentaire').fill('Qui apporte les rallonges ?');
  await discussion.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(discussion.locator('.discussion-message')).toContainText('Qui apporte les rallonges ?');
  await expect(discussion.locator('.discussion-message')).toContainText('corrigé');

  page.once('dialog', (d) => void d.accept());
  await discussion.getByRole('button', { name: 'Retirer' }).click();
  await expect(discussion.locator('.discussion-message')).toHaveCount(0);
  // Échap ferme la discussion, pas la fiche.
  await page.keyboard.press('Escape');
  await expect(chat).toHaveCount(0);
  await expect(page.locator('.modal')).toHaveCount(1);
});

test('notification d’un message : la discussion s’ouvre dans Messages, la croix y ramène, l’icône ouvre la tâche', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche commentée');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await page.locator('main').getByText('Tâche commentée').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  const chat = page.getByRole('dialog', { name: 'Tâche commentée' });
  await chat.getByLabel('Nouveau commentaire').fill('Le devis est arrivé');
  await chat.getByLabel('Nouveau commentaire').press('Enter');
  await expect(chat.locator('.discussion-message')).toHaveCount(1);
  // Identifiant de la tâche : celui de sa discussion dans Messages.
  await page.goto('./?demo#/messages');
  await page.locator('.messages-ligne', { hasText: 'Tâche commentée' }).click();
  const id = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('d'));
  expect(id).toBeTruthy();

  // Lien d'une notification 💬 (cloche, ou téléphone) : la discussion, sur la page Messages.
  await page.goto(`./?demo#/taches?tache=${id}&discussion=1`);
  await expect(page).toHaveURL(/#\/messages\?d=/);
  const ouverte = page.getByRole('dialog', { name: 'Tâche commentée' });
  await expect(ouverte.locator('.discussion-message')).toContainText('Le devis est arrivé');
  // La croix ramène aux discussions (pas à la fiche de la tâche).
  await ouverte.getByRole('button', { name: 'Fermer' }).click();
  await expect(page).toHaveURL(/#\/messages$/);
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.messages-ligne', { hasText: 'Tâche commentée' })).toBeVisible();
  // Rouverte : l'icône de la tâche ouvre sa fiche.
  await page.locator('.messages-ligne', { hasText: 'Tâche commentée' }).click();
  await page.getByRole('dialog', { name: 'Tâche commentée' }).getByRole('button', { name: 'Ouvrir la tâche' }).click();
  await expect(page).toHaveURL(/#\/taches\?tache=/);
  await expect(page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true })).toBeVisible();
});

test('discussion : mon message écrit depuis une autre de mes entités reste le mien', async ({ page }) => {
  const entite = async (nom: string) => {
    await ouvrirEntite(page, nom);
    await page.goto('./?demo#/taches');
  };
  // Julien Moreau, aussi membre de la Soirée récréative, y crée une tâche partagée avec le comité central.
  await entite('Soirée récréative');
  const fiche = await nouvelleTache(page, 'Choisir la musique');
  await fiche.locator('.chip', { hasText: 'Partager' }).click();
  await fiche.getByRole('button', { name: '🏛️ Comité central' }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Il écrit dans la discussion depuis le comité central ; en tête, l'entité de la tâche.
  await entite('Comité central');
  await page.locator('main').getByText('Choisir la musique').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  await expect(page.locator('.discussion-entite')).toHaveText('Tâche de « Soirée récréative »');
  await page.getByLabel('Nouveau commentaire').fill('Une liste de chansons pour samedi ?');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.locator('.discussion-message.mien')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // De retour dans la Soirée : son message, à droite, ni non lu ni notifié ; il le corrige et le retire d'ici.
  await entite('Soirée récréative');
  const ligne = page.locator('main tr', { hasText: 'Choisir la musique' });
  await expect(ligne.locator('.discussion-tag')).toBeVisible();
  await expect(ligne.locator('.discussion-tag .pastille-nonlu')).toHaveCount(0);
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).not.toContainText('Choisir la musique');
  await page.keyboard.press('Escape');
  await ligne.getByText('Choisir la musique').first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  const discussion = page.getByRole('dialog', { name: 'Choisir la musique' }).getByRole('region', { name: 'Discussion' });
  await expect(discussion.locator('.discussion-entite')).toHaveText('Tâche de « Soirée récréative »');
  // De personne à personne : ni son nom ni l'entité d'où il a écrit.
  await expect(discussion.locator('.discussion-message.mien')).toContainText('Une liste de chansons pour samedi ?');
  await expect(discussion.locator('.discussion-message.mien')).not.toContainText('Comité central');
  await expect(discussion.locator('.discussion-auteur')).toHaveCount(0);
  await expect(discussion.locator('.discussion-nouveaux')).toHaveCount(0);
  await discussion.getByRole('button', { name: 'Corriger' }).click();
  await discussion.getByLabel('Corriger le commentaire').fill('Une liste de chansons pour la soirée ?');
  await discussion.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(discussion.locator('.discussion-message.mien')).toContainText('Une liste de chansons pour la soirée ?');
  await expect(discussion.locator('.discussion-message.mien')).toContainText('corrigé');
  page.once('dialog', (d) => void d.accept());
  await discussion.getByRole('button', { name: 'Retirer' }).click();
  await expect(discussion.locator('.discussion-message')).toHaveCount(0);
});

test('discussion : une seule notification par personne, lue partout une fois lue', async ({ page }) => {
  const entite = async (nom: string) => {
    await ouvrirEntite(page, nom);
    await page.goto('./?demo#/taches');
  };
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  const ecrire = async (texte: string) => {
    await page.goto('./?demo#/messages');
    await page.getByRole('button', { name: 'Nouvelle discussion' }).click();
    await page.getByLabel('Chercher une tâche').fill('musique');
    await page.locator('.messages-choix button', { hasText: 'Choisir la musique' }).click();
    await page.getByLabel('Nouveau commentaire').fill(texte);
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(page.locator('.discussion-message.mien', { hasText: texte })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
  };
  const notifications = async () => {
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const panneau = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panneau).toBeVisible();
    return panneau;
  };
  // Julien Moreau : responsable de la tâche dans la Soirée récréative (partagée avec le comité central), où il a écrit.
  await entite('Soirée récréative');
  const fiche = await nouvelleTache(page, 'Choisir la musique');
  await fiche.locator('.chip', { hasText: 'Partager' }).click();
  await fiche.getByRole('button', { name: '🏛️ Comité central' }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await entite('Comité central');
  await ecrire('Je regarde ça.');

  // Marc Lambert écrit depuis le comité central : Julien, concerné dans les deux entités, est prévenu une fois, dans la Soirée.
  await changer('Marc Lambert');
  await verifierEntite(page, 'Comité central');
  await ecrire('Bonne idée !');
  await changer('Julien Moreau');
  await entite('Comité central');
  // Pas encore lue : non lue au comité central aussi.
  const ligne = page.locator('main tr', { hasText: 'Choisir la musique' });
  await expect(ligne.locator('.discussion-tag .pastille-nonlu')).toHaveText('1');
  // Vue « moi » : la cloche montre aussi celles de mes autres entités ; celle-ci une seule fois, avec le nom de la Soirée.
  const venue = (await notifications()).locator('.bell-item', { hasText: 'Choisir la musique' });
  await expect(venue).toHaveCount(1);
  await expect(venue).toContainText('Soirée récréative');
  await page.keyboard.press('Escape');
  await entite('Soirée récréative');
  await expect(await notifications()).toContainText('Marc Lambert a commenté « Choisir la musique »');
  await page.keyboard.press('Escape');
  // De personne à personne : son message avec son nom, sans l'entité d'où il l'a écrit.
  await page.locator('main').getByText('Choisir la musique').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion (1 non lu)' }).click();
  await expect(page.locator('.discussion-message:not(.mien) .discussion-auteur')).toHaveText('Marc Lambert');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // Lue dans la Soirée, elle est lue partout : plus rien de non lu au comité central.
  await entite('Comité central');
  await expect(ligne.locator('.discussion-tag')).toBeVisible();
  await expect(ligne.locator('.discussion-tag .pastille-nonlu')).toHaveCount(0);
  await expect(page.locator('.tabs .onglet-nb')).toHaveCount(0);

  // Et la cloche : prévenu dans la Soirée, message lu au comité central, la notification de la Soirée est lue aussi.
  await changer('Marc Lambert');
  await verifierEntite(page, 'Comité central');
  await ecrire('Et la sono ?');
  await changer('Julien Moreau');
  await entite('Soirée récréative');
  await expect((await notifications()).locator('.bell-item.unread', { hasText: 'Choisir la musique' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await entite('Comité central');
  await page.locator('main').getByText('Choisir la musique').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion (1 non lu)' }).click();
  await expect(page.locator('.discussion-message', { hasText: 'Et la sono ?' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  await entite('Soirée récréative');
  await expect((await notifications()).locator('.bell-item', { hasText: 'Choisir la musique' }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Notifications' }).locator('.bell-item.unread', { hasText: 'Choisir la musique' })).toHaveCount(0);
});

test('vue « moi » : les tâches de mes autres entités, ouvertes et modifiées sans changer d’entité', async ({ page }) => {
  const entite = async (nom: string) => {
    await ouvrirEntite(page, nom);
    await page.goto('./?demo#/taches');
  };
  // Julien Moreau crée une tâche dans la Soirée récréative (pas partagée).
  await entite('Soirée récréative');
  const fiche = await nouvelleTache(page, 'Louer les tables');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Au comité central, elle est dans ses tâches, avec la pastille de son entité ; le filtre « Entité » la garde ou la retire.
  await entite('Comité central');
  const ligne = page.locator('main tr', { hasText: 'Louer les tables' });
  await expect(ligne.locator('.tsource')).toHaveText('Soirée récréative');
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await page.getByLabel('Entité').selectOption({ label: 'Comité central' });
  await expect(ligne).toHaveCount(0);
  await page.getByLabel('Entité').selectOption({ label: 'Soirée récréative' });
  await expect(ligne).toHaveCount(1);

  // Ouverte d'ici, dans son entité : modifiée, commentée, sans changer d'entité.
  await ligne.getByText('Louer les tables').first().click();
  const ouverte = page.locator('.modal').first();
  await expect(ouverte.getByPlaceholder('Que faut-il faire ?')).toHaveValue('Louer les tables');
  await expect(ouverte).not.toContainText('partagée avec');
  await ouverte.getByPlaceholder('Que faut-il faire ?').fill('Louer les tables et les bancs');
  await ouverte.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await verifierEntite(page, 'Comité central');
  await expect(page.locator('main tr', { hasText: 'Louer les tables et les bancs' }).locator('.tsource')).toHaveText('Soirée récréative');
  await page.locator('main').getByText('Louer les tables et les bancs').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  await page.getByLabel('Nouveau commentaire').fill('Combien de bancs ?');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.locator('.discussion-message.mien')).toContainText('Combien de bancs ?');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  // La discussion est aussi dans Messages, d'ici.
  await page.goto('./?demo#/messages');
  await expect(page.locator('.messages-ligne', { hasText: 'Louer les tables et les bancs' })).toContainText('Combien de bancs ?');

  // Enregistrée dans la Soirée : tâche d'ici là-bas, avec son message.
  await entite('Soirée récréative');
  const chezElle = page.locator('main tr', { hasText: 'Louer les tables et les bancs' });
  await expect(chezElle).toHaveCount(1);
  // Sa pilule : la Soirée elle-même (membre de plusieurs entités, chaque tâche porte celle de son entité).
  await expect(chezElle.locator('.tsource')).toHaveText('Soirée récréative');
  await chezElle.getByText('Louer les tables et les bancs').first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  await expect(page.locator('.discussion-message.mien')).toContainText('Combien de bancs ?');
});

test('vue « moi » : nouvelle tâche créée dans une autre de mes entités, sans changer d’entité', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Commander les boissons');
  const choix = fiche.getByRole('combobox', { name: 'Entité' });
  await expect(choix).toHaveText(/Comité central/);
  await choix.click();
  await page.getByRole('option', { name: /Soirée récréative/ }).click();
  // La fenêtre passe dans la Soirée : le titre suit, la section se choisit parmi les siennes.
  await expect(choix).toHaveText(/Soirée récréative/);
  await expect(fiche.getByPlaceholder('Que faut-il faire ?')).toHaveValue('Commander les boissons');
  await fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first().selectOption({ index: 1 });
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await verifierEntite(page, 'Comité central');
  await expect(page.locator('main tr', { hasText: 'Commander les boissons' }).locator('.tsource')).toHaveText('Soirée récréative');

  // Enregistrée dans la Soirée, comme une tâche à elle.
  await ouvrirEntite(page, 'Soirée récréative');
  await page.goto('./?demo#/taches');
  const chezElle = page.locator('main tr', { hasText: 'Commander les boissons' });
  await expect(chezElle).toHaveCount(1);
  // Sa pilule : la Soirée elle-même (membre de plusieurs entités, chaque tâche porte celle de son entité).
  await expect(chezElle.locator('.tsource')).toHaveText('Soirée récréative');
});

test('vue « moi » : mon profil, le même dans toutes mes entités', async ({ page }) => {
  await page.goto('./?demo#/reglages');
  const profil = page.locator('section.mon-profil');
  await expect(profil).toContainText('Soirée récréative');
  await expect(profil.getByLabel('Email')).toBeDisabled();
  await profil.getByLabel('Prénom').fill('Jules');
  await profil.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.who-text strong')).toHaveText('Jules Moreau');
  // Dans la Soirée récréative aussi, sans l'avoir modifié là-bas.
  await ouvrirEntite(page, 'Soirée récréative');
  await expect(page.locator('.who-text strong')).toHaveText('Jules Moreau');
  await page.goto('./?demo#/reglages');
  await expect(page.locator('section.mon-profil').getByLabel('Prénom')).toHaveValue('Jules');
});

test('vue « moi » : mes réglages, les mêmes dans toutes mes entités ; la sauvegarde du club, une entité restaurée', async ({ page }) => {
  await page.goto('./?demo#/reglages');
  // Préférence enregistrée aussi dans la Soirée récréative (pages affichées chez elle, sa cloche).
  await page.getByLabel('Phrase d’explication en haut des pages').selectOption('non');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('taches-gsa-demo-u-u-soiree') ?? '{}');
        const moi = d.people?.find((p: { prenom: string }) => p.prenom === 'Julien');
        return d.prefs?.[moi?.id]?.explications;
      }),
    )
    .toBe(false);
  // Sauvegarde : dans la console admin, celle de tout le club.
  await page.locator('.who-btn').click();
  await page.getByRole('menuitem', { name: 'Console admin' }).click();
  await page.getByRole('link', { name: /Sauvegarde/ }).click();
  const club = page.locator('section.sauvegarde-club');
  const [fichier] = await Promise.all([page.waitForEvent('download'), club.getByRole('button', { name: 'Télécharger la sauvegarde du club' }).click()]);
  expect(fichier.suggestedFilename()).toMatch(/^taches-gsa-sauvegarde-club-/);
  await expect(club.locator('.backup-ok')).toContainText('Sauvegarde du club téléchargée');
  const chemin = (await fichier.path())!;
  const contenu = JSON.parse(readFileSync(chemin, 'utf8'));
  expect(contenu.version).toBe(2);
  const soiree = contenu.entites.find((e: { nom: string }) => e.nom === 'Soirée récréative');
  expect(soiree.data.events.some((e: { lieu?: string }) => e.lieu === 'Salle des fêtes')).toBe(true);
  expect(contenu.entites.length).toBeGreaterThan(2);
  expect(contenu.personnes.length).toBeGreaterThan(0);
  expect(contenu.personnes.some((m: { iban?: string }) => 'iban' in m)).toBe(false);

  // Restaurer la Soirée seule, depuis la sauvegarde du club : un événement ajouté depuis disparaît, le comité central ne bouge pas.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('taches-gsa-demo-u-u-soiree') ?? '{}');
    d.events = [...(d.events ?? []), { ...d.events[0], id: 'ev-apres', nom: 'Ajouté après la sauvegarde' }];
    localStorage.setItem('taches-gsa-demo-u-u-soiree', JSON.stringify(d));
  });
  const central = await page.evaluate(() => localStorage.getItem('taches-gsa-demo-v7'));
  // Par son admin, Pierre Favre (pas admin du comité central : pas de sauvegarde du club pour lui).
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Pierre Favre' }).first().click();
  await page.locator('.who-btn').click();
  await page.getByRole('menuitem', { name: 'Console admin' }).click();
  await page.getByRole('link', { name: /Sauvegarde/ }).click();
  await expect(page.locator('section.sauvegarde-club')).toContainText('se télécharge par un super-admin');
  await expect(page.getByRole('heading', { name: 'Restaurer « Soirée récréative »' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Fichier de sauvegarde').setInputFiles(chemin);
  await expect(page.locator('.backup-ok', { hasText: '« Soirée récréative » restaurée' })).toBeVisible();
  const apres = await page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-u-u-soiree') ?? '{}'));
  expect(apres.events.some((e: { id: string }) => e.id === 'ev-apres')).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('taches-gsa-demo-v7'))).toBe(central);
});

test('vue « moi » : les séances de toutes mes entités, réunies (page Séances, accueil, agenda)', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  // Une réunion aujourd'hui dans la Soirée récréative, posée par son responsable depuis la page Séances, sans changer
  // d'entité : seule entité où il gère les séances, elle est indiquée dans la fenêtre.
  await changer('Pierre Favre');
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/comite');
  await expect(page.locator('.subtabs-entite')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Nouvelle séance' }).click();
  const fen = page.getByRole('dialog', { name: 'Nouvelle séance' });
  await expect(fen.locator('.champ-entite')).toContainText('Soirée récréative');
  await expect(fen.getByLabel('Titre')).toHaveValue(/^Réunion /);
  await fen.getByLabel('Titre').fill('Séance de la Soirée');
  await fen.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  // Avec celles du comité central, chacune avec la pilule de son entité.
  await expect(page.locator('.agenda-item', { hasText: 'Séance de la Soirée' }).locator('.tsource')).toHaveText('Soirée récréative');
  await expect(page.locator('.agenda-item', { hasText: 'Comité d’octobre' }).locator('.tsource')).toHaveText('Comité central');
  await verifierEntite(page, 'Comité central');

  // Julien, au comité central : sur l'accueil, la prochaine séance de chacune de ses entités.
  await changer('Julien Moreau');
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/');
  const bloc = page.locator('.bloc-seance');
  await expect(bloc.locator('h2')).toHaveText(/Prochaines séances/);
  // Dans l'ordre chronologique, chacune avec la pilule de son entité (comme les tâches).
  const cartes = bloc.locator('.link-panel');
  await expect(cartes).toHaveCount(2);
  await expect(cartes.first()).toContainText('Séance de la Soirée');
  await expect(cartes.first().locator('.tsource')).toHaveText('Soirée récréative');
  await expect(cartes.nth(1).locator('.tsource')).toHaveText('Comité central');
  // Les tâches aussi : celles du comité central portent son nom.
  await allerA(page, '/taches');
  const fiche = await nouvelleTache(page, 'Réserver la salle');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('main tr', { hasText: 'Réserver la salle' }).locator('.tsource')).toHaveText('Comité central');

  // Dans l'agenda aussi, avec le nom de son entité ; ouverte, elle mène à sa carte dans les séances réunies.
  await allerA(page, '/agenda');
  const ligne = page.locator('.cal-side .cal-row', { hasText: 'Séance de la Soirée' });
  await expect(ligne.locator('.tsource')).toHaveText('Soirée récréative');
  await ligne.click();
  const cible = page.locator('.agenda-item.cible');
  await expect(cible).toContainText('Séance de la Soirée');
  await expect(cible.locator('.tsource')).toHaveText('Soirée récréative');
  await expect(page.locator('main')).toContainText('Comité d’octobre');
  await verifierEntite(page, 'Comité central');
});

test('vue « moi » : ordre du jour et PV de mes deux comités, choisis en haut de la page ; console admin depuis le menu, entité choisie en haut', async ({ page }) => {
  // Julien Moreau, président du comité central (ouvert), est ici aussi admin de la Soirée récréative.
  const cle = 'taches-gsa-demo-u-u-soiree';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    d.people.find((p: { prenom: string }) => p.prenom === 'Julien').roles = ['admin'];
    localStorage.setItem(k, JSON.stringify(d));
  }, cle);
  await page.reload();
  await ouvrirEntite(page, 'Comité central');
  // Une réunion de la Soirée, posée depuis les séances réunies.
  await allerA(page, '/comite');
  await page.getByRole('button', { name: '+ Nouvelle séance' }).click();
  const fen = page.getByRole('dialog', { name: 'Nouvelle séance' });
  const choix = fen.getByRole('combobox', { name: 'Comité' });
  await expect(choix).toHaveText(/Comité central/);
  await choix.click();
  await page.getByRole('option', { name: /Soirée récréative/ }).click();
  await expect(choix).toHaveText(/Soirée récréative/);
  await expect(fen.getByLabel('Titre')).toHaveValue(/^Réunion /);
  await fen.getByLabel('Titre').fill('Réunion de la soirée');
  await fen.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  // Ordre du jour : celui du comité central d'abord ; la Soirée, choisie en haut de la page, s'affiche directement.
  await page.locator('.subtabs').getByRole('link', { name: 'Ordre du jour' }).click();
  const comite = page.locator('.subtabs').getByRole('combobox', { name: 'Comité' });
  await expect(comite).toHaveText(/Comité central/);
  await comite.click();
  await page.getByRole('option', { name: /Soirée récréative/ }).click();
  await expect(comite).toHaveText(/Soirée récréative/);
  await expect(page.locator('main')).toContainText('Réunion de la soirée');
  // Son PV aussi, toujours dans la Soirée.
  await page.locator('.subtabs').getByRole('link', { name: 'PV' }).click();
  await expect(comite).toHaveText(/Soirée récréative/);
  await expect(page.getByLabel('Séance', { exact: true })).toContainText('Réunion de la soirée');
  // Le comité central reste l'entité ouverte ; choisi, son PV revient.
  await verifierEntite(page, 'Comité central');
  await comite.click();
  await page.getByRole('option', { name: /Comité central/ }).click();
  await expect(comite).toHaveText(/Comité central/);
  await expect(page.getByLabel('Séance', { exact: true })).not.toContainText('Réunion de la soirée');

  // Console admin : dans le menu du compte ; l'entité se choisit en haut de la console (plus dans les Réglages).
  await page.locator('.who-btn').click();
  await page.getByRole('menuitem', { name: 'Console admin' }).click();
  const entite = page.locator('.subtabs').getByRole('combobox', { name: 'Entité' });
  await expect(entite).toHaveText(/Comité central/);
  await expect(page.locator('main')).toContainText('Logo, icône et couleur du comité');
  await entite.click();
  await page.getByRole('option', { name: /Soirée récréative/ }).click();
  await expect(entite).toHaveText(/Soirée récréative/);
  await expect(page.locator('main')).toContainText('Logo et icône de l’entité.');
  await page.getByRole('link', { name: /Rôles et droits/ }).click();
  await expect(page.locator('main h1')).toContainText('Rôles et droits');
  await expect(entite).toHaveText(/Soirée récréative/);
  await verifierEntite(page, 'Comité central');
});

test('vue « moi » : console admin de mon entité, depuis le menu, sans l’ouvrir', async ({ page }) => {
  // Pierre Favre : membre du comité central (ouvert), admin de la Soirée récréative seulement.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Pierre Favre' }).first().click();
  await ouvrirEntite(page, 'Comité central');
  await page.locator('.who-btn').click();
  await page.getByRole('menuitem', { name: 'Console admin' }).click();
  // Seule entité dont il est admin : pas de choix, elle est nommée.
  await expect(page.locator('.subtabs').getByRole('combobox')).toHaveCount(0);
  await expect(page.locator('.subtabs .subtabs-entite')).toHaveText(/Soirée récréative/);
  await expect(page.locator('main')).toContainText('Logo et icône de l’entité.');
  await verifierEntite(page, 'Comité central');
});

test('vue « moi » : organigramme sans « Ouvrir », fiche du club d’une personne, son rôle dans mon entité modifié sur place', async ({ page }) => {
  // Pierre Favre : membre du comité central (ouvert), admin de la Soirée récréative.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Pierre Favre' }).first().click();
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/organigramme');
  await expect(page.locator('main').getByText('Yannick Leroy').first()).toBeVisible();
  await expect(page.locator('main').getByTitle(/^Ouvrir «/)).toHaveCount(0);
  await page.locator('main').getByText('Yannick Leroy').first().click();
  await page.getByRole('dialog', { name: 'Yannick Leroy' }).getByRole('button', { name: 'Fiche complète' }).click();
  // Sa fiche du club : ses places, et son rôle dans la Soirée (dont Pierre est admin), modifiable sur place.
  const fiche = page.getByRole('dialog', { name: 'Yannick Leroy' });
  await expect(fiche.locator('.acces-ligne', { hasText: 'Comité central' })).toBeVisible();
  const soiree = fiche.locator('.acces-ligne', { hasText: 'Soirée récréative' });
  await soiree.getByRole('button', { name: 'Caissier' }).click();
  // Enregistré dans la Soirée, sans l'avoir ouverte.
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-u-u-soiree') ?? '{}').people?.find((p: { prenom: string }) => p.prenom === 'Yannick')?.roles),
    )
    .toContain('caissier');
  await verifierEntite(page, 'Comité central');
});

test('vue « moi » : remboursement envoyé à la caisse d’une autre de mes entités, puis retrouvé avec les autres', async ({ page }) => {
  // Marc Lambert : membre du comité central et du CO Bruntrutaine (caisse : Valérie Lefèvre).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Marc Lambert' }).first().click();
  await ouvrirEntite(page, 'Comité central');
  await page.locator('.fab').click();
  await page.locator('.fab-menu button', { hasText: 'Nouveau remboursement' }).click();
  const form = page.locator('.modal').first();
  await form.getByLabel('Objet de la dépense').fill('Gobelets pour le ravitaillement');
  // La caisse du CO : la fenêtre s'y affiche, avec ce qui est déjà écrit.
  await form.getByRole('combobox', { name: 'Envoyer à la caisse de' }).click();
  await page.getByRole('option', { name: /CO Bruntrutaine/ }).click();
  await expect(form).toContainText('Valérie Lefèvre');
  await expect(form.getByLabel('Objet de la dépense')).toHaveValue('Gobelets pour le ravitaillement');
  await form.locator('fieldset.docs input[type=file]').first().setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: png });
  await expect(form.locator('.doc-list li')).toHaveCount(1);
  await form.getByLabel('Montant (CHF)').fill('12.50');
  await form.getByRole('button', { name: 'Envoyer à la caisse' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (JSON.parse(localStorage.getItem('taches-gsa-demo-u-u-bruntrutaine') ?? '{}').tasks ?? []).some((t: { titre: string; paiement?: unknown }) => t.titre === 'Gobelets pour le ravitaillement' && !!t.paiement),
      ),
    )
    .toBe(true);
  await verifierEntite(page, 'Comité central');
  // Retrouvé dans ses paiements et remboursements, avec ceux de ses autres entités ; il s'ouvre là.
  await allerA(page, '/taches?type=tickets');
  const ligne = page.locator('main').getByText('Gobelets pour le ravitaillement').first();
  await expect(ligne).toBeVisible();
  await ligne.click();
  await expect(page.locator('.modal').first()).toContainText('Gobelets pour le ravitaillement');
  await expect(page.locator('.modal').first()).toContainText('CHF 12,50');
  await verifierEntite(page, 'Comité central');
});

test('tâche confiée à une personne d’une autre entité : elle seule la voit, pas son entité', async ({ page }) => {
  // Antoine Mercier : moniteur de l'École de cyclisme, sans fiche au comité central.
  const fiche = await nouvelleTache(page, 'Préparer les dossards');
  await fiche.getByRole('combobox', { name: 'Ajouter une personne' }).click();
  await page.getByRole('option', { name: /Antoine Mercier/ }).click();
  await expect(fiche.locator('.qui .chip', { hasText: 'Antoine Mercier' })).toBeVisible();
  // La tâche n'est pas partagée avec son entité.
  await expect(fiche.locator('.partage .chip.on')).toHaveCount(0);
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const enregistree = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').tasks ?? []).find((t: { titre: string }) => t.titre === 'Préparer les dossards'),
  );
  expect(enregistree.partage ?? []).not.toContain('u-ecole');
  expect(enregistree.respPartage['u-ecole']).toHaveLength(1);
  // Antoine la retrouve dans ses tâches et la modifie ; elle reste au comité central.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Antoine Mercier' }).first().click();
  await allerA(page, '/taches');
  await page.locator('main').getByText('Préparer les dossards').first().click();
  const chez = page.locator('.modal').first();
  await chez.locator('textarea').first().fill('Numéros 1 à 120');
  await chez.getByRole('button', { name: /^Enregistrer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => (JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').tasks ?? []).find((t: { titre: string }) => t.titre === 'Préparer les dossards')?.remarque),
    )
    .toBe('Numéros 1 à 120');
  // Simon Vincent, moniteur de l'École (il voit toutes ses tâches), ne la voit pas : elle n'est confiée qu'à Antoine.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Simon Vincent' }).first().click();
  await allerA(page, '/taches');
  await page.locator('main').getByRole('button', { name: 'Toutes', exact: true }).click();
  await expect(page.locator('main').getByRole('button', { name: 'Toutes', exact: true })).toHaveClass(/on/);
  await expect(page.locator('main').getByText('Préparer les dossards')).toHaveCount(0);
});

test('tâche : quelqu’un sans place dans l’organigramme, son nom sur la tâche ; avec un accès, ses tâches seulement', async ({ page }) => {
  const avant = await page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').people.length);
  const fiche = await nouvelleTache(page, 'Tenir le stand de crêpes');
  await fiche.getByRole('combobox', { name: 'Ajouter une personne' }).click();
  await page.getByRole('option', { name: 'Quelqu’un d’autre…' }).click();
  const autre = page.getByRole('dialog', { name: 'Quelqu’un d’autre' });
  await autre.getByLabel('Prénom').fill('Claire');
  await autre.getByLabel('Nom', { exact: true }).fill('Dumas');
  await autre.getByRole('button', { name: 'Ajouter à la tâche' }).click();
  await expect(autre).toHaveCount(0);
  await expect(fiche.locator('.qui .chip', { hasText: 'Claire Dumas' })).toBeVisible();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}'));
  // Pas de fiche dans le comité : son nom est sur la tâche ; elle entre dans « Personnes du club » (Julien gère les personnes).
  expect(d.people.length).toBe(avant);
  const claire = await page.evaluate(() => (JSON.parse(localStorage.getItem('taches-gsa-demo-membres') ?? '[]') as { id: string; prenom: string }[]).find((m) => m.prenom === 'Claire'));
  expect(claire).toBeTruthy();
  expect(d.tasks.find((t: { titre: string }) => t.titre === 'Tenir le stand de crêpes').respHors).toEqual([expect.objectContaining({ prenom: 'Claire', nom: 'Dumas', membreId: claire!.id })]);

  // Accès à l'appli donné sur sa fiche du club : sans place, elle ne voit que ses tâches confiées, et les fait avancer.
  await allerA(page, '/membres-club');
  await page.locator('.membres-table tr', { hasText: 'Dumas' }).first().click();
  const sa = page.getByRole('dialog', { name: /Claire Dumas/ });
  await sa.getByText('Accès à l’appli : sans place dans l’organigramme').click();
  await sa.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(sa).toHaveCount(0);
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Claire Dumas' }).click();
  await expect(page.getByRole('heading', { name: 'Mes tâches' })).toBeVisible();
  const carte = page.locator('.tache-confiee', { hasText: 'Tenir le stand de crêpes' });
  await carte.getByRole('combobox', { name: /Statut/ }).click();
  await page.getByRole('option', { name: 'Terminé' }).click();
  await expect(carte).toHaveClass(/finie/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}');
        const t = d.tasks.find((x: { titre: string }) => x.titre === 'Tenir le stand de crêpes');
        return d.statuses.find((x: { id: string }) => x.id === t.statusId)?.done;
      }),
    )
    .toBe(true);
});

test('personnes du club : la liste pour tout le monde, fiche en lecture ; retirer quelqu’un du club', async ({ page }) => {
  // Simon Vincent, moniteur de l'École (coordonnées, sans « Gérer les personnes ») : la liste et les fiches, en lecture.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Simon Vincent' }).first().click();
  await allerA(page, '/membres-club');
  await expect(page.locator('main h1')).toContainText('Personnes du club');
  await expect(page.getByRole('button', { name: '+ Nouvelle personne' })).toHaveCount(0);
  await page.locator('.membres-table tr', { hasText: 'Hugo' }).first().click();
  const fiche = page.getByRole('dialog', { name: /Hugo Morel/ });
  await expect(fiche.getByLabel('Prénom')).toBeDisabled();
  await expect(fiche.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  await expect(fiche.getByRole('button', { name: 'Retirer du club' })).toHaveCount(0);
  await fiche.locator('.modal-foot').getByRole('button', { name: 'Fermer' }).click();

  // Julien Moreau (« Gérer les personnes ») retire Hugo Morel du club : sa place au CO Bruntrutaine aussi.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Julien Moreau' }).first().click();
  await allerA(page, '/membres-club');
  await page.locator('.membres-table tr', { hasText: 'Hugo' }).first().click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('dialog', { name: /Hugo Morel/ }).getByRole('button', { name: 'Retirer du club' }).click();
  await expect(page.locator('.membres-table tr', { hasText: 'Hugo' })).toHaveCount(0);
  const fiche2 = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('taches-gsa-demo-u-u-bruntrutaine') ?? '{}').people ?? []).find((p: { prenom: string }) => p.prenom === 'Hugo'),
  );
  expect(fiche2.actif).toBe(false);
});

test('organigramme : le rôle donné par un poste, ajustable sur la fiche de la personne', async ({ page }) => {
  // Marc Lambert : postes Vice-président, Programme et Critérium du comité central, rôle « Comité » (celui de ses postes).
  const rolesDe = (prenom: string) =>
    page.evaluate((x) => (JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').people ?? []).find((p: { prenom: string }) => p.prenom === x)?.roles, prenom);
  expect(await rolesDe('Marc')).toEqual(['comite']);
  await allerA(page, '/organigramme');
  await page.getByRole('button', { name: 'Modifier l’organigramme' }).click();
  await page.locator('button.orgl-c1-nom-poste', { hasText: 'Programme' }).first().click();
  const reglages = page.getByRole('dialog', { name: /Poste « Programme »/ });
  await reglages.getByRole('combobox', { name: 'Rôle donné' }).click();
  await page.getByRole('option', { name: 'Secrétaire' }).click();
  await reglages.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(reglages).toHaveCount(0);
  // Ses rôles suivent sa place : « Comité » (ses autres postes) et « Secrétaire » (Programme).
  await expect.poll(async () => [...((await rolesDe('Marc')) ?? [])].sort()).toEqual(['comite', 'secretaire']);
  // Sa fiche le dit ; ajustés à la main, ses rôles ne suivent plus, et « Revenir au rôle de sa place » les remet.
  await allerA(page, '/membres-club');
  await page.locator('.membres-table tr', { hasText: 'Lambert' }).first().click();
  const fiche = page.getByRole('dialog', { name: /Marc Lambert/ });
  const central = fiche.locator('.acces-ligne', { hasText: 'Comité central' });
  await expect(central.locator('.role-place')).toContainText('Rôle donné par sa place dans l’organigramme : Comité, Secrétaire');
  await central.getByRole('button', { name: 'Caissier' }).click();
  await expect(central.locator('.role-place')).toContainText('Rôles ajustés à la main');
  await central.getByRole('button', { name: 'Revenir au rôle de sa place' }).click();
  await expect(central.locator('.role-place')).toContainText('Rôle donné par sa place');
  await expect.poll(async () => [...((await rolesDe('Marc')) ?? [])].sort()).toEqual(['comite', 'secretaire']);
});

test('vue « moi » : les événements de toutes mes entités, réunis ; un nouveau dans l’une d’elles', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  // Pierre Favre, au comité central (ouvert), gère les événements de la Soirée récréative : il en pose un d'ici.
  await changer('Pierre Favre');
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/evenements');
  const soiree = page.locator('.agenda-item:not(.dependant)', { hasText: 'Salle des fêtes' });
  await expect(soiree.locator('.tsource')).toHaveText('Soirée récréative');
  await page.getByRole('button', { name: '+ Nouvel événement' }).click();
  const fen = page.getByRole('dialog', { name: 'Nouvel événement' });
  await expect(fen.locator('.champ-entite')).toContainText('Soirée récréative');
  await fen.getByPlaceholder('Ajouter un titre').fill('Apéro des bénévoles');
  await fen.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const apero = page.locator('.agenda-item', { hasText: 'Apéro des bénévoles' });
  await expect(apero.locator('.tsource')).toHaveText('Soirée récréative');
  await expect(apero.getByRole('button', { name: 'Modifier' })).toBeVisible();
  await verifierEntite(page, 'Comité central');

  // Julien Moreau, membre de la Soirée : sur son accueil, avec la pilule de son entité.
  await changer('Julien Moreau');
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/');
  const bloc = page.locator('.bloc-evenements');
  await expect(bloc.locator('.link-panel', { hasText: 'Apéro des bénévoles' }).locator('.tsource')).toHaveText('Soirée récréative');
});

test('vue « moi » : les sondages de toutes mes entités, réunis ; un nouveau dans l’une d’elles', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  // Pierre Favre crée des sondages au comité central (ouvert) et à la Soirée récréative : il pose celui-ci à la Soirée.
  await changer('Pierre Favre');
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/sondages');
  await page.getByRole('button', { name: '+ Nouveau sondage' }).click();
  const fen = page.getByRole('dialog', { name: 'Nouveau sondage' });
  const choix = fen.getByRole('combobox', { name: 'Entité' });
  await expect(choix).toHaveText(/Comité central/);
  await fen.getByLabel('Question').fill('Faut-il une tombola ?');
  await choix.click();
  await page.getByRole('option', { name: /Soirée récréative/ }).click();
  await expect(choix).toHaveText(/Soirée récréative/);
  await expect(fen.getByLabel('Question')).toHaveValue('Faut-il une tombola ?');
  await fen.getByRole('button', { name: 'Créer le sondage' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.locator('.seg').getByRole('button', { name: /^En cours/ }).click();
  const carte = page.locator('.poll', { hasText: 'Faut-il une tombola ?' });
  await expect(carte.locator('.tsource')).toHaveText('Soirée récréative');
  await verifierEntite(page, 'Comité central');

  // Julien Moreau, membre de la Soirée : à voter sur son accueil et dans les sondages, sans changer d'entité.
  await changer('Julien Moreau');
  await ouvrirEntite(page, 'Comité central');
  await allerA(page, '/');
  await expect(page.locator('a.link-panel', { hasText: 'Faut-il une tombola ?' }).locator('.tsource')).toHaveText('Soirée récréative');
  await allerA(page, '/sondages');
  await page.locator('.seg').getByRole('button', { name: /^À voter/ }).click();
  const aVoter = page.locator('.poll', { hasText: 'Faut-il une tombola ?' });
  await expect(aVoter.locator('.tsource')).toHaveText('Soirée récréative');
  await aVoter.locator('.poll-choice', { hasText: 'Oui' }).click();
  await aVoter.getByRole('button', { name: 'Envoyer ma réponse' }).click();
  // Réponse enregistrée chez la Soirée : le sondage passe dans « En cours », avec ma réponse.
  await expect(page.locator('.seg').getByRole('button', { name: /^À voter/ })).toHaveText('À voter (0)');
  await page.locator('.seg').getByRole('button', { name: /^En cours/ }).click();
  await expect(aVoter).toContainText('1/5 réponses');
  await expect(aVoter).toContainText('Oui (ton choix)');
  await verifierEntite(page, 'Comité central');
});

test('messagerie : nouvelle discussion, liste et non lus sur l’onglet', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche de la messagerie');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // « Nouvelle discussion » : choisir la tâche, écrire, la discussion apparaît dans la liste.
  await page.locator('.tabs').getByRole('link', { name: 'Messages' }).click();
  await page.getByRole('button', { name: 'Nouvelle discussion' }).click();
  await page.getByLabel('Chercher une tâche').fill('messagerie');
  await page.locator('.messages-choix button', { hasText: 'Tâche de la messagerie' }).click();
  const chat = page.getByRole('dialog', { name: 'Tâche de la messagerie' });
  await chat.getByLabel('Nouveau commentaire').fill('On en parle ici ?');
  await chat.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(chat.locator('.discussion-message.mien')).toHaveCount(1);
  await chat.getByRole('button', { name: 'Fermer' }).click();
  const ligne = page.locator('.messages-ligne', { hasText: 'Tâche de la messagerie' });
  await expect(ligne).toContainText('On en parle ici ?');
  await expect(ligne).not.toHaveClass(/nonlu/);

  // Une autre personne : pastille sur l'onglet, discussion en gras, lue une fois ouverte.
  await page.locator('.who-btn').click();
  await page.getByText('Changer d’utilisateur').click();
  await page.locator('.login-user').nth(1).click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await page.goto('./?demo#/messages');
  await expect(page.locator('.tabs .onglet-nb')).toHaveText('1');
  await expect(ligne).toHaveClass(/nonlu/);
  await page.getByRole('button', { name: /^Non lues/ }).click();
  await ligne.click();
  await expect(page.getByRole('dialog', { name: 'Tâche de la messagerie' }).locator('.discussion-nouveaux')).toHaveText('Nouveau message');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.tabs .onglet-nb')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Tout est lu');
});

test('discussion : messages non lus sur la carte et la bulle, ouverte depuis la notification', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche à discuter');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const changerDePersonne = async (n: number) => {
    await page.locator('.who-btn').click();
    await page.getByText('Changer d’utilisateur').click();
    await page.locator('.login-user').nth(n).click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };

  // Une autre personne écrit dans la discussion.
  await changerDePersonne(1);
  await page.goto('./?demo#/taches');
  await page.getByRole('button', { name: 'Toutes', exact: true }).click();
  await page.locator('main').getByText('Tâche à discuter').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true }).click();
  const champ = page.getByLabel('Nouveau commentaire');
  await champ.fill('Je peux m’en occuper samedi.');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.locator('.discussion-message.mien')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // L'auteur de la tâche : pastille « 1 » sur la tâche, puis la notification 💬 ouvre la discussion.
  await changerDePersonne(0);
  await page.goto('./?demo#/taches');
  const ligne = page.locator('main tr', { hasText: 'Tâche à discuter' });
  await expect(ligne.locator('.discussion-tag .pastille-nonlu')).toHaveText('1');
  await page.goto('./?demo#/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.locator('.bell-item', { hasText: 'a commenté « Tâche à discuter »' }).click();
  const chat = page.getByRole('dialog', { name: 'Tâche à discuter' });
  await expect(chat.locator('.discussion-nouveaux')).toHaveText('Nouveau message');
  await expect(chat.locator('.discussion-message:not(.mien)')).toContainText('Je peux m’en occuper samedi.');
  // Ouverte dans Messages : la croix ramène aux discussions.
  await expect(page).toHaveURL(/#\/messages\?d=/);
  await chat.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.messages-ligne', { hasText: 'Tâche à discuter' })).toBeVisible();
  // Lue : plus de pastille, la bulle reste pour dire qu'il y a une discussion.
  await page.goto('./?demo#/taches');
  await expect(ligne.locator('.discussion-tag')).toBeVisible();
  await expect(ligne.locator('.pastille-nonlu')).toHaveCount(0);
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

test('rapport d’erreurs : erreur d’essai reçue, réglée puis effacée', async ({ page }) => {
  await page.goto('./?demo#/admin/erreurs');
  await expect(page.getByText('Aucune erreur signalée.')).toBeVisible();
  await page.getByRole('button', { name: 'Envoyer une erreur d’essai' }).click();
  const ligne = page.locator('.erreurs-liste > li').first();
  await expect(ligne).toContainText('Erreur d’essai envoyée depuis la console admin');
  await expect(ligne).toContainText('1 fois · 1 personne');
  await ligne.getByRole('button', { name: 'Réglée' }).click();
  await expect(ligne).toHaveClass(/reglee/);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Effacer les réglées' }).click();
  await expect(page.getByText('Aucune erreur signalée.')).toBeVisible();
});

test('fichiers joints à l’ordre du jour : regroupés par mise en page, pages de PDF choisies, choix par fichier', async ({ page }) => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 3; i++) pdf.addPage([595, 842]);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche avec annexes');
  await fiche.getByRole('button', { name: /Document/ }).first().click();
  await fiche.locator('fieldset.docs input[type=file]').first().setInputFiles([
    { name: 'ticket1.png', mimeType: 'image/png', buffer: png },
    { name: 'rapport.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) },
    { name: 'ticket2.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(fiche.locator('.doc-list li')).toHaveCount(3);
  await fiche.getByRole('button', { name: /^Créer$/ }).click();

  await page.goto('./?demo#/ordre-du-jour');
  const reglages = page.locator('.pv-settings');
  await reglages.locator('summary', { hasText: 'Contenu' }).click();
  await reglages.getByText('Joindre les fichiers liés en fin d’ordre du jour').click();
  await reglages.getByLabel('Photos par page').selectOption('4');
  const pages = page.locator('.pv-annexes-page');
  // Les deux photos ensemble sur une page malgré le PDF entre elles, chaque page du PDF sur la sienne.
  await expect(pages).toHaveCount(4);
  await expect(pages.nth(0)).toHaveClass(/par-4/);
  await expect(pages.nth(0).locator('figure')).toHaveCount(2);
  await expect(pages.nth(1)).toHaveClass(/par-1/);
  await expect(pages.nth(1)).toContainText('rapport.pdf (page 1/3)');

  // Seulement les pages 1 et 3 du PDF.
  await reglages.locator('.choix-annexes summary').click();
  await reglages.getByLabel('Pages à imprimer de « rapport.pdf »').fill('1, 3');
  await reglages.getByLabel('Pages à imprimer de « rapport.pdf »').press('Enter');
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(2)).toContainText('rapport.pdf (page 3/3)');
  await expect(page.locator('.pv-annexes')).toContainText('pages 1, 3 jointes');

  await reglages.getByLabel('Mise en page de « rapport.pdf »').selectOption('2');
  await reglages.getByLabel('Mise en page de « ticket2.png »').selectOption('1');
  await expect(pages).toHaveCount(3);
  await expect(pages.nth(0).locator('figure')).toHaveCount(1);
  await expect(pages.nth(1)).toHaveClass(/par-2/);
  await expect(pages.nth(1).locator('figure')).toHaveCount(2);
  await expect(pages.nth(2)).toHaveClass(/par-1/);
  await expect(pages.nth(2)).toContainText('ticket2.png');
});

test('nouvelle tâche : À prendre et Pour info s’ajoutent', async ({ page }) => {
  const fiche = await nouvelleTache(page, 'Tenir le stand');
  await fiche.locator('.chip', { hasText: 'À prendre' }).click();
  await expect(fiche.locator('.a-prendre')).toBeVisible();
  await fiche.locator('.chip', { hasText: 'Pour info' }).click();
  await expect(fiche.getByText('Pour info', { exact: false }).first()).toBeVisible();
  await expect(fiche.locator('.chip', { hasText: 'Pour info' })).toHaveCount(0);
});

test('Pour info : sans compte, relance, « ✓ Vu », tout le monde a vu, à revoir', async ({ page }) => {
  // Une personne sans adresse email (démo : sans compte) ne reçoit rien et ne compte pas.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!);
    d.people.find((p: { prenom: string }) => p.prenom === 'Sophie').email = '';
    localStorage.setItem('taches-gsa-demo-v7', JSON.stringify(d));
  });
  await page.reload();
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  const ouvrir = async () => {
    await page.goto('./?demo#/taches');
    await page.locator('main').getByText('Prévenir les moniteurs').filter({ visible: true }).first().click();
    return page.locator('.modal').first();
  };
  const notifications = async () => {
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const panneau = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panneau).toBeVisible();
    return panneau;
  };

  const fiche = await nouvelleTache(page, 'Prévenir les moniteurs');
  await fiche.locator('.chip', { hasText: 'Pour info' }).click();
  const ajouter = fiche.getByRole('combobox', { name: 'Mettre au courant' });
  for (const nom of [/^Marc Lambert/, /^Sophie Girard/]) {
    await ajouter.click();
    await page.getByRole('option', { name: nom }).click();
  }
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Auteur : la personne sans compte en gris, le bilan sans elle, 🔔 Relancer (une fois par heure).
  let ouverte = await ouvrir();
  let suivi = ouverte.locator('.pour-info');
  await expect(suivi.locator('.chip.sans-compte')).toContainText('Sophie Girard');
  await expect(suivi.locator('.pour-info-bilan')).toContainText('Personne ne l’a encore marquée « ✓ Vu ». 1 sans compte');
  await suivi.getByRole('button', { name: /Relancer/ }).click();
  await expect(suivi.getByRole('status')).toHaveText('🔔 1 personne relancée.');
  await suivi.getByRole('button', { name: /Relancer/ }).click();
  await expect(page.locator('.toast')).toContainText('Déjà relancée');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // Mes « Pour info » pas encore vus.
  await page.goto('./?demo#/taches?delai=pourinfo');
  await expect(page.locator('main').getByText('Prévenir les moniteurs').filter({ visible: true }).first()).toBeVisible();

  // La personne mentionnée est relancée, puis marque « ✓ Vu ».
  await changer('Marc Lambert');
  await expect(await notifications()).toContainText('te rappelle « Prévenir les moniteurs »');
  await page.keyboard.press('Escape');
  ouverte = await ouvrir();
  await ouverte.locator('.pour-info-banner').getByRole('button', { name: 'Vu' }).click();
  await expect(ouverte.locator('.pour-info-banner')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // L'auteur est prévenu que tout le monde l'a vue, puis la modifie.
  await changer('Julien Moreau');
  await expect(await notifications()).toContainText('Tout le monde a vu « Prévenir les moniteurs »');
  await page.keyboard.press('Escape');
  await page.goto('./?demo#/ordre-du-jour');
  await expect(page.locator('main').getByText(/vue par tout le monde/).first()).toBeVisible();
  ouverte = await ouvrir();
  suivi = ouverte.locator('.pour-info');
  await expect(suivi.locator('.pour-info-bilan')).toContainText('✓ Vue par tout le monde.');
  await expect(suivi.getByRole('button', { name: /Relancer/ })).toHaveCount(0);
  await ouverte.locator('textarea').first().fill('Rendez-vous à 18 h devant la salle');
  await ouverte.getByRole('button', { name: /^Enregistrer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  ouverte = await ouvrir();
  await expect(ouverte.locator('.pour-info .chip.revoir')).toContainText('Marc Lambert');
  await page.keyboard.press('Escape');

  // Modifiée depuis son « ✓ Vu » : elle revient à l'accueil (✏️ À revoir), et se revoit.
  await changer('Marc Lambert');
  await page.goto('./?demo#/');
  await expect(page.locator('main .badge.pour-info.revoir').filter({ visible: true }).first()).toBeVisible();
  ouverte = await ouvrir();
  await expect(ouverte.locator('.pour-info-banner')).toContainText('Elle a changé depuis ton « ✓ Vu »');
  await ouverte.locator('.pour-info-banner').getByRole('button', { name: 'Vu' }).click();
  await expect(ouverte.locator('.pour-info-banner')).toHaveCount(0);
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

test('recherche globale (Ctrl+K) : tâche, séance, personne, dans toutes mes entités', async ({ page }) => {
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
  // Dans toutes mes entités : une personne de la Soirée récréative seulement, au nom de son entité, ouverte sur place.
  await champ.fill('yannick');
  const yannick = page.locator('.recherche-item', { hasText: 'Yannick Leroy' }).filter({ hasText: 'Soirée récréative' });
  await expect(yannick).toHaveCount(1);
  await yannick.click();
  await expect(page.getByRole('dialog', { name: 'Yannick Leroy' })).toBeVisible();
  await verifierEntite(page, 'Comité central');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.keyboard.press('Control+k');
  await expect(champ).toBeFocused();
  // Entrée : ouvre le premier résultat
  await champ.fill('maillot');
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Que faut-il faire ?')).toHaveValue('Commander les maillots');
});

test('pilule du PV : garde sa place quand l’écran tourne ou que le clavier s’ouvre', async ({ page }) => {
  await page.goto('./?demo#/pv');
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  const boite = async () => (await pilule.boundingBox())!;
  const droite = async () => {
    const r = await boite();
    return Math.round((await page.evaluate(() => document.documentElement.clientWidth)) - r.x - r.width);
  };
  // Contre le bord droit, vers le haut.
  await pilule.getByRole('button', { name: /Déplacer la barre/ }).focus();
  for (let i = 0; i < 70; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowUp');
  const avant = await boite();
  expect(await droite()).toBe(4);
  // Écran tourné : toujours contre le bord droit, puis à la même place au retour.
  const taille = page.viewportSize()!;
  await page.setViewportSize({ width: taille.height, height: taille.width });
  await expect.poll(droite).toBe(4);
  await page.setViewportSize(taille);
  await expect.poll(boite).toEqual(avant);
  // Clavier ouvert dans une note : en-tête et pilule restent à l'écran, le « + » laisse la place.
  await page.locator('.note-riche').first().click();
  await page.setViewportSize({ width: taille.width, height: taille.height - 320 });
  await expect(page.locator('html')).toHaveClass(/clavier/);
  await expect(page.locator('.fab')).toBeHidden();
  await expect(pilule).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.topbar')).toBeInViewport({ ratio: 1 });
  await page.setViewportSize(taille);
  await expect(page.locator('.fab')).toBeVisible();
  await expect.poll(boite).toEqual(avant);
});

test('reprendre un événement passé : nouvelle édition avec ses tâches, délais décalés', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Réserver les dossards');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  // Liée à la course d'avril (passée), 7 jours avant ; terminée, checklist cochée.
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k)?.includes('Réserver les dossards'), cle)).toBe(true);
  await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    d.events.find((x: { id: string }) => x.id === 'e1').nom = 'Course de préparation 2026';
    const t = d.tasks.find((x: { titre: string }) => x.titre === 'Réserver les dossards');
    const fini = d.statuses.find((s: { done: boolean }) => s.done).id;
    Object.assign(t, { eventId: 'e1', delaiRef: { type: 'event', joursAvant: 7, unite: 'jours' }, delai: '2026-04-18', statusId: fini, checklist: [{ id: 'c1', label: 'Commander', done: true }] });
    localStorage.setItem(k, JSON.stringify(d));
  }, cle);
  await page.goto('./?demo#/evenements');
  await page.reload();

  await page.locator('.agenda-item', { hasText: 'Course de préparation 2026' }).getByRole('button', { name: 'Reprendre' }).click();
  const reprise = page.getByRole('dialog', { name: 'Reprendre « Course de préparation 2026 »' });
  await reprise.getByLabel('Premier jour').fill('2027-04-24');
  await expect(reprise.getByLabel('Nom', { exact: true })).toHaveValue('Course de préparation 2027');
  const ligne = reprise.locator('.anciennes-liste li', { hasText: 'Réserver les dossards' });
  await expect(ligne.locator('input')).toBeChecked();
  await expect(ligne).toContainText('délai 17.04.2027 (7 jours avant)');
  await reprise.getByRole('button', { name: 'Reprendre avec 1 tâche' }).click();

  // Les tâches de la nouvelle édition : la copie, à faire, au 17.04.2027, checklist décochée.
  await expect(page).toHaveURL(/#\/taches\?event=/);
  const copie = page.locator('main tr', { hasText: 'Réserver les dossards' });
  await expect(copie).toHaveCount(1);
  await expect(copie).toContainText('17.04.2027');
  await copie.getByText('Réserver les dossards').click();
  const rouverte = page.locator('.modal').first();
  await expect(rouverte.getByRole('combobox', { name: 'Statut' })).toHaveText('À faire');
  await expect(rouverte.locator('.check-row input')).not.toBeChecked();
  await rouverte.getByRole('button', { name: 'Fermer' }).first().click();

  await page.goto('./?demo#/evenements');
  await expect(page.locator('.agenda-item', { hasText: 'Course de préparation 2026' }).locator('.reprise')).toContainText('Course de préparation 2027');
  const nouvelle = page.locator('.agenda-item').filter({ has: page.locator('strong', { hasText: /^Course de préparation 2027$/ }) });
  await expect(nouvelle).toContainText('0/1 tâches terminées');
});

test('résumé de la semaine, le lundi : notification et tâches de la semaine', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T08:00:00Z'));
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Préparer le stand');
  await fiche.getByRole('combobox', { name: 'Date fixe, ou selon un événement / une séance' }).click();
  await page.getByRole('option', { name: 'Date fixe' }).click();
  await fiche.getByLabel('Pour quand ?').fill('2026-11-04');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.goto('./?demo#/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const resume = page.locator('.bell-item', { hasText: 'Cette semaine :' });
  await expect(resume).toContainText('1 tâche à faire');
  await expect(resume).toContainText('« Préparer le stand » mercredi');
  await resume.click();
  await expect(page).toHaveURL(/delai=semaine/);
  await expect(page.locator('main tr', { hasText: 'Préparer le stand' })).toHaveCount(1);
});

test('discussion : mentionner quelqu’un avec @, notification 📣 sans 💬 en double', async ({ page }) => {
  const changerDePersonne = async (n: number) => {
    await page.locator('.who-btn').click();
    await page.getByText('Changer d’utilisateur').click();
    const nom = (await page.locator('.login-user strong').nth(n).textContent())!.trim();
    await page.locator('.login-user').nth(n).click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
    return nom;
  };
  const ouvrirDiscussion = async () => {
    await page.goto('./?demo#/taches');
    await page.getByRole('button', { name: 'Toutes', exact: true }).click();
    await page.locator('main').getByText('Tâche avec mention').filter({ visible: true }).first().click();
    await page.locator('.modal').first().getByRole('button', { name: /^Discussion/ }).click();
    return page.getByRole('region', { name: 'Discussion' });
  };
  const autre = await changerDePersonne(1);
  const moi = await changerDePersonne(0);
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche avec mention');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // « @ » et le début du prénom (sans accents) : la personne est proposée, Entrée l'insère.
  let discussion = await ouvrirDiscussion();
  const champ = discussion.getByLabel('Nouveau commentaire');
  await expect(champ).toHaveAttribute('placeholder', /@ pour mentionner/);
  await champ.pressSequentially(`Peux-tu regarder, @${autre.slice(0, 3).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}`);
  await expect(page.getByRole('option', { name: autre })).toBeVisible();
  await page.getByRole('option').filter({ hasText: autre }).click();
  await expect(champ).toHaveValue(`Peux-tu regarder, @${autre} `);
  await expect(page.getByRole('listbox', { name: 'Mentionner' })).toHaveCount(0);
  await champ.pressSequentially('stp ?');
  await champ.press('Enter');
  await expect(discussion.locator('.discussion-message.mien .mention')).toHaveText(`@${autre}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // La personne mentionnée (ni responsable ni autrice) : 📣, qui ouvre la discussion ; son nom ressort.
  await changerDePersonne(1);
  await page.goto('./?demo#/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.locator('.bell-item', { hasText: 'a commenté « Tâche avec mention »' })).toHaveCount(0);
  await page.locator('.bell-item', { hasText: `${moi} te mentionne dans « Tâche avec mention »` }).click();
  const chat = page.getByRole('dialog', { name: 'Tâche avec mention' });
  await expect(chat.locator('.mention.moi')).toHaveText(`@${autre}`);
  await chat.getByLabel('Nouveau commentaire').fill(`C’est fait, @${moi} !`);
  await chat.getByLabel('Nouveau commentaire').press('Enter');
  await expect(chat.locator('.discussion-message.mien .mention')).toHaveText(`@${moi}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // L'autrice de la tâche, prévenue de toute façon (💬), ne reçoit que le 📣.
  await changerDePersonne(0);
  await page.goto('./?demo#/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.locator('.bell-item', { hasText: `${autre} te mentionne dans « Tâche avec mention »` })).toHaveCount(1);
  await expect(page.locator('.bell-item', { hasText: 'a commenté « Tâche avec mention »' })).toHaveCount(0);
  discussion = await ouvrirDiscussion();
  await expect(discussion.locator('.discussion-message:not(.mien) .mention.moi')).toHaveText(`@${moi}`);
});

test('accueil du comité central : pas de cartes « Prochaine édition » en haut, même ouvert sur un sous-comité', async ({ page }) => {
  // Une notification peut ouvrir l'appli sur l'entité de la tâche : l'accueil ne change pas pour autant.
  await ouvrirEntite(page, 'Soirée récréative');
  await page.goto('./?demo#/');
  await expect(page.getByRole('heading', { name: /^Bonjour/ })).toBeVisible();
  await expect(page.locator('.panel.edition')).toHaveCount(0);
  // Le bloc reste au choix de chacun (⚙️ Mon accueil), masqué d'origine.
  await page.getByRole('button', { name: 'Personnaliser l’accueil' }).click();
  const ligne = page.getByRole('checkbox', { name: 'Date de l’édition — Ordinateur' });
  await expect(ligne).not.toBeChecked();
  await ligne.check();
  await page.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(page.locator('.panel.edition').first()).toBeVisible();
});
