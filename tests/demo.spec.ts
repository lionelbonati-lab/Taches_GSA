import { PDFDocument } from 'pdf-lib';
import { compter, expect, nouvelleTache, ouvrirDemo, test } from './outils';

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

test('discussion : mon message écrit depuis une autre de mes entités reste le mien', async ({ page }) => {
  const entite = async (nom: string) => {
    await page.locator('.unit-btn').click();
    await page.locator('.unit-menu .unit-item', { hasText: nom }).click();
    await expect(page.locator('.unit-btn')).toContainText(nom);
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

test('discussion : une seule notification par personne, dans l’entité de la tâche', async ({ page }) => {
  const entite = async (nom: string) => {
    await page.locator('.unit-btn').click();
    await page.locator('.unit-menu .unit-item', { hasText: nom }).click();
    await expect(page.locator('.unit-btn')).toContainText(nom);
    await page.goto('./?demo#/taches');
  };
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.unit-btn')).toBeVisible();
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
  await expect(page.locator('.unit-btn')).toContainText('Comité central');
  await ecrire('Bonne idée !');
  await changer('Julien Moreau');
  await entite('Comité central');
  await expect(await notifications()).not.toContainText('Choisir la musique');
  await page.keyboard.press('Escape');
  await entite('Soirée récréative');
  await expect(await notifications()).toContainText('Marc Lambert a commenté « Choisir la musique »');
  await page.keyboard.press('Escape');
  // De personne à personne : son message avec son nom, sans l'entité d'où il l'a écrit.
  await page.locator('main').getByText('Choisir la musique').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion (1 non lu)' }).click();
  await expect(page.locator('.discussion-message:not(.mien) .discussion-auteur')).toHaveText('Marc Lambert');
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
  await expect(page.locator('.unit-btn')).toBeVisible();
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
    await expect(page.locator('.unit-btn')).toBeVisible();
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
  await chat.getByRole('button', { name: 'Fermer' }).click();
  // Lue : plus de pastille, la bulle reste pour dire qu'il y a une discussion.
  await expect(page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true })).toBeVisible();
  await page.locator('.modal').first().getByRole('button', { name: 'Fermer' }).first().click();
  await expect(page.locator('.modal')).toHaveCount(0);
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
    await expect(page.locator('.unit-btn')).toBeVisible();
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
    await expect(page.locator('.unit-btn')).toBeVisible();
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
