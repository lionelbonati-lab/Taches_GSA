import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Page } from '@playwright/test';
import { allerA, compter, evenementEtiquete, expect, groupe, nouvelleTache, ouvrirDemo, test, verifierUnSeulEspace } from './outils';

// Parcours essentiels de la démo, sur ordinateur.

test.beforeEach(async ({ page }) => {
  await ouvrirDemo(page);
});

test('toutes les pages s’ouvrent sans erreur', async ({ page }) => {
  const pages = ['/', '/taches', '/messages', '/agenda', '/comite', '/evenements', '/ordre-du-jour', '/pv', '/sondages', '/membres-club', '/reglages', '/admin', '/admin/droits', '/propositions', '/mots-de-passe', '/aide'];
  for (const h of pages) {
    await test.step(h, async () => {
      await page.goto('./?demo#' + h);
      await expect(page.locator('main h1, main h2').first()).toBeVisible();
      await expect(page.locator('.chargement-page')).toHaveCount(0);
      await expect(page.locator('.erreur-appli')).toHaveCount(0);
    });
  }
  // L'ancienne adresse de l'organigramme mène aux personnes du club.
  await page.goto('./?demo#/organigramme');
  await expect(page).toHaveURL(/#\/membres-club$/);
});

test('un seul espace : la démo d’avant reprise, ses entités devenues des étiquettes avec leurs tâches et leurs personnes', async ({ page }) => {
  // Démo d'avant (v8) : le comité central et la Soirée récréative, chacune dans sa clé ; une tâche de la Soirée, partagée,
  // confiée à Lina Bovet (au bar de la Soirée, pas au comité), et l'entité ouverte retenue.
  await page.evaluate(() => {
    const central = JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!);
    const julien = central.people.find((p: { prenom: string }) => p.prenom === 'Julien');
    const soiree = {
      schema: central.schema,
      sections: [{ id: 's-org', nom: 'Organisation', sousSections: [] }],
      statuses: central.statuses,
      roles: central.roles,
      people: [
        { ...julien, id: 'x1' },
        { id: 'x2', prenom: 'Lina', nom: 'Bovet', email: 'lina.bovet@gsajoie.example', telephone: '', couleur: '#0d9488', poste: 'Bar', roles: ['responsable'], actif: true },
      ],
      tasks: [
        { id: 'tv8', sectionId: 's-org', sousSection: '', titre: 'Louer la sono', responsables: ['x2'], statusId: central.statuses[0].id, delai: '', remarque: '', checklist: [], createdBy: 'x1', updatedAt: new Date().toISOString(), partage: ['u-central'], source: 'u-soiree' },
      ],
      events: [],
      meetings: [],
      polls: [],
      emails: [],
      prefs: {},
      log: [],
    };
    localStorage.setItem('taches-gsa-demo-u-u-soiree', JSON.stringify(soiree));
    // Au comité central : une tâche attribuée à la Soirée, son délai calé sur la date de l'entité.
    central.tasks.push({ id: 'tc-info', sectionId: central.sections[0].id, sousSection: '', titre: 'Annoncer la soirée', responsables: [julien.id], statusId: central.statuses[0].id, delai: '2026-11-25', delaiRef: { type: 'event', joursAvant: 3, unite: 'jours' }, evenementEntite: { uniteId: 'u-soiree', nom: 'Soirée récréative', date: '2026-11-28' }, remarque: '', checklist: [], createdBy: julien.id, updatedAt: new Date().toISOString() });
    localStorage.setItem('taches-gsa-demo-v7', JSON.stringify(central));
    localStorage.setItem('taches-gsa-demo-club', JSON.stringify([{ id: 'u-central', nom: 'Comité central', type: 'central' }, { id: 'u-soiree', nom: 'Soirée récréative', type: 'evenement', date: '2026-11-28' }]));
    localStorage.setItem('taches-gsa-demo-unite', 'u-soiree');
    localStorage.setItem('taches-gsa-demo-version', '8');
  });
  await page.reload();
  await verifierUnSeulEspace(page);

  // Les anciennes clés sont oubliées ; la tâche est dans l'espace, avec l'étiquette de son entité, sans les champs du partage.
  const etat = await page.evaluate(() => ({
    anciennes: ['taches-gsa-demo-club', 'taches-gsa-demo-u-u-soiree', 'taches-gsa-demo-unite'].map((k) => localStorage.getItem(k)),
    version: localStorage.getItem('taches-gsa-demo-version'),
    tache: JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).tasks.find((t: { titre: string }) => t.titre === 'Louer la sono'),
    centrale: JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).tasks.find((t: { titre: string }) => t.titre === 'Annoncer la soirée'),
  }));
  expect(etat.anciennes).toEqual([null, null, null]);
  expect(etat.version).toBe('9');
  expect(etat.tache.etiquettes).toEqual(['et-u-soiree']);
  expect(etat.tache.partage).toBeUndefined();
  expect(etat.tache.source).toBeUndefined();
  // Un événement : rangé dans « Événements », sous-section de nom proche (« Soirée récréative 28.11 »).
  expect([etat.tache.sectionId, etat.tache.sousSection]).toEqual(['sec8', 'Soirée récréative 28.11']);
  // La tâche du comité central attribuée à la Soirée : son étiquette, et son délai calé sur la date de l'étiquette.
  expect(etat.centrale.etiquettes).toEqual(['et-u-soiree']);
  expect(etat.centrale.evenementEntite).toBeUndefined();
  expect(etat.centrale.delaiRef).toEqual({ type: 'etiquette', etiquetteId: 'et-u-soiree', joursAvant: 3, unite: 'jours' });

  await allerA(page, '/taches');
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await expect(page.locator('main tr', { hasText: 'Louer la sono' }).locator('.badge.etiquette')).toHaveText('Soirée récréative');

  // Lina Bovet est au club, membre de l'étiquette ; sa tâche est la sienne.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  const lina = page.locator('.login-user', { hasText: 'Lina Bovet' });
  await expect(lina.locator('.role-pill')).toHaveText('Soirée récréative');
  await lina.click();
  await allerA(page, '/taches');
  await expect(page.locator('main tr', { hasText: 'Louer la sono' })).toHaveCount(1);
  await verifierUnSeulEspace(page);
});

test('page lourde ouverte directement par son adresse', async ({ page, context }) => {
  const autre = await context.newPage();
  const erreurs: string[] = [];
  autre.on('pageerror', (e) => erreurs.push(e.message));
  await autre.goto('./?demo#/pv');
  await expect(autre.locator('main h1, main h2').first()).toBeVisible();
  await expect(autre.locator('.erreur-appli')).toHaveCount(0);
  expect(autre.url()).toContain('#/pv');
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
  await page.getByRole('dialog', { name: 'Tâche commentée' }).getByRole('button', { name: 'Ouvrir le point' }).click();
  await expect(page).toHaveURL(/#\/taches\?tache=/);
  await expect(page.locator('.modal').first().getByRole('button', { name: 'Discussion', exact: true })).toBeVisible();
});

test('discussion : une seule notification par personne, lue partout une fois lue', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  const ecrire = async (texte: string) => {
    await page.goto('./?demo#/messages');
    await page.getByRole('button', { name: 'Nouvelle discussion' }).click();
    await page.getByLabel('Chercher un point').fill('musique');
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
  // Julien Moreau : responsable de la tâche, où il a écrit.
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Choisir la musique');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await ecrire('Je regarde ça.');

  // Marc Lambert écrit : Julien est prévenu une fois.
  await changer('Marc Lambert');
  await verifierUnSeulEspace(page);
  await ecrire('Bonne idée !');
  await changer('Julien Moreau');
  await page.goto('./?demo#/taches');
  const ligne = page.locator('main tr', { hasText: 'Choisir la musique' });
  await expect(ligne.locator('.discussion-tag .pastille-nonlu')).toHaveText('1');
  // La cloche : celle-ci une seule fois.
  const venue = (await notifications()).locator('.bell-item', { hasText: 'Choisir la musique' });
  await expect(venue).toHaveCount(1);
  await expect(venue).toContainText('Marc Lambert a commenté « Choisir la musique »');
  await page.keyboard.press('Escape');
  // De personne à personne : son message avec son nom.
  await ligne.getByText('Choisir la musique').first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion (1 non lu)' }).click();
  await expect(page.locator('.discussion-message:not(.mien) .discussion-auteur')).toHaveText('Marc Lambert');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // Lue une fois, elle est lue partout : liste, onglet Messages et cloche.
  await expect(ligne.locator('.discussion-tag')).toBeVisible();
  await expect(ligne.locator('.discussion-tag .pastille-nonlu')).toHaveCount(0);
  await expect(page.locator('.tabs .onglet-nb')).toHaveCount(0);
  await expect((await notifications()).locator('.bell-item.unread', { hasText: 'Choisir la musique' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Un nouveau message : sa notification, lue avec la discussion (ouverte depuis la tâche).
  await changer('Marc Lambert');
  await ecrire('Et la sono ?');
  await changer('Julien Moreau');
  await expect((await notifications()).locator('.bell-item.unread', { hasText: 'Choisir la musique' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.goto('./?demo#/taches');
  await page.locator('main').getByText('Choisir la musique').filter({ visible: true }).first().click();
  await page.locator('.modal').first().getByRole('button', { name: 'Discussion (1 non lu)' }).click();
  await expect(page.locator('.discussion-message', { hasText: 'Et la sono ?' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect((await notifications()).locator('.bell-item', { hasText: 'Choisir la musique' }).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Notifications' }).locator('.bell-item.unread', { hasText: 'Choisir la musique' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Réglages : la messagerie a sa propre case, à part des tâches ; décochée, les 💬 quittent la cloche.
  await page.goto('./?demo#/reglages');
  const messagerie = page.getByRole('checkbox', { name: /Quelqu’un écrit dans la discussion/ });
  await expect(messagerie).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Un point m’est confié/ })).not.toHaveAccessibleName(/mentionne/);
  await messagerie.uncheck();
  await expect(page.getByRole('checkbox', { name: /Un point m’est confié/ })).toBeChecked();
  await expect((await notifications()).locator('.bell-item', { hasText: 'a commenté « Choisir la musique »' })).toHaveCount(0);
});

test('mon profil : ma fiche et « Personnes du club » mises à jour ensemble', async ({ page }) => {
  await page.goto('./?demo#/reglages');
  const profil = page.locator('section.mon-profil');
  // Un seul espace : l'email de la fiche se corrige aussi (la connexion à la démo se fait par la fiche).
  await expect(profil.getByRole('textbox', { name: /^Email/ })).toBeEditable();
  await profil.getByLabel('Prénom').fill('Jules');
  await profil.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.locator('.who-text strong')).toHaveText('Jules Moreau');
  const prenoms = () =>
    page.evaluate(() => [
      (JSON.parse(localStorage.getItem('taches-gsa-demo-membres') ?? '[]') as { prenom: string; nom: string }[]).find((m) => m.nom === 'Moreau')?.prenom,
      JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').people?.find((p: { nom: string }) => p.nom === 'Moreau')?.prenom,
    ]);
  await expect.poll(prenoms).toEqual(['Jules', 'Jules']);
  await page.reload();
  await expect(page.locator('.who-text strong')).toHaveText('Jules Moreau');
  await expect(page.locator('section.mon-profil').getByLabel('Prénom')).toHaveValue('Jules');
});

test('mes réglages, dans l’espace ; la sauvegarde du club, puis sa restauration', async ({ page }) => {
  await page.goto('./?demo#/reglages');
  await expect(page.locator('.page-intro')).toHaveCount(1);
  await page.getByLabel('Phrase d’explication en haut des pages').selectOption('non');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}');
        const julien = d.people.find((p: { prenom: string }) => p.prenom === 'Julien').id;
        return d.prefs?.[julien]?.explications;
      }),
    )
    .toBe(false);
  // Les mêmes partout : dans la console admin aussi, et après un rechargement.
  await expect(page.locator('.page-intro')).toHaveCount(0);
  await page.locator('.who-btn').click();
  await page.getByRole('menuitem', { name: 'Console admin' }).click();
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('.page-intro')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('.page-intro')).toHaveCount(0);

  // Sauvegarde du club : un seul espace, ses étiquettes, et « Personnes du club » sans IBAN.
  await page.getByRole('link', { name: /Sauvegarde/ }).click();
  const club = page.locator('section.sauvegarde-club');
  const [fichier] = await Promise.all([page.waitForEvent('download'), club.getByRole('button', { name: 'Télécharger la sauvegarde du club' }).click()]);
  expect(fichier.suggestedFilename()).toMatch(/^taches-gsa-sauvegarde-club-/);
  await expect(club.locator('.backup-ok')).toContainText('Sauvegarde du club téléchargée');
  const chemin = (await fichier.path())!;
  const contenu = JSON.parse(readFileSync(chemin, 'utf8'));
  expect(contenu.version).toBe(2);
  expect(contenu.entites.length).toBe(1);
  expect(contenu.entites[0].data.etiquettes.map((e: { nom: string }) => e.nom)).toContain('Soirée récréative');
  expect(contenu.personnes.length).toBeGreaterThan(0);
  expect(contenu.personnes.some((m: { iban?: string }) => 'iban' in m)).toBe(false);

  // Restaurer : un événement ajouté depuis disparaît.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}');
    d.events = [...(d.events ?? []), { ...d.events[0], id: 'ev-apres', nom: 'Ajouté après la sauvegarde' }];
    localStorage.setItem('taches-gsa-demo-v7', JSON.stringify(d));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Restaurer « Comité central »' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Fichier de sauvegarde').setInputFiles(chemin);
  await expect(page.locator('.backup-ok', { hasText: '« Comité central » restaurée' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').events ?? []).some((e: { id: string }) => e.id === 'ev-apres')))
    .toBe(false);
});

test('tâche : quelqu’un sans fiche dans l’appli, son nom sur la tâche ; avec une fiche, la tâche devient la sienne', async ({ page }) => {
  const avant = await page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').people.length);
  const fiche = await nouvelleTache(page, 'Tenir le stand de crêpes');
  await fiche.getByRole('combobox', { name: 'Ajouter une personne' }).click();
  await page.getByRole('option', { name: 'Quelqu’un d’autre…' }).click();
  const autre = page.getByRole('dialog', { name: 'Quelqu’un d’autre' });
  await autre.getByLabel('Prénom').fill('Claire');
  await autre.getByLabel('Nom', { exact: true }).fill('Dumas');
  await autre.getByRole('button', { name: 'Ajouter au point' }).click();
  await expect(autre).toHaveCount(0);
  await expect(fiche.locator('.qui .chip', { hasText: 'Claire Dumas' })).toBeVisible();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}'));
  // Pas de fiche dans l'appli : son nom est sur la tâche ; elle entre dans « Personnes du club » (Julien gère les personnes).
  expect(d.people.length).toBe(avant);
  const claire = await page.evaluate(() => (JSON.parse(localStorage.getItem('taches-gsa-demo-membres') ?? '[]') as { id: string; prenom: string }[]).find((m) => m.prenom === 'Claire'));
  expect(claire).toBeTruthy();
  expect(d.tasks.find((t: { titre: string }) => t.titre === 'Tenir le stand de crêpes').respHors).toEqual([expect.objectContaining({ prenom: 'Claire', nom: 'Dumas', membreId: claire!.id })]);

  // Une fiche dans l'appli, donnée depuis « Personnes du club » : la tâche notée à son nom devient la sienne.
  await allerA(page, '/membres-club');
  await page.locator('.membres-table tr', { hasText: 'Dumas' }).first().click();
  const sa = page.getByRole('dialog', { name: /Claire Dumas/ });
  await sa.getByRole('button', { name: 'Lui donner une fiche dans l’appli' }).click();
  await expect(sa.getByText(/Claire Dumas a une fiche dans l’appli/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}');
        const claire = d.people.find((p: { prenom: string }) => p.prenom === 'Claire');
        const t = d.tasks.find((x: { titre: string }) => x.titre === 'Tenir le stand de crêpes');
        return !!claire && t.responsables.includes(claire.id) && !t.respHors;
      }),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Claire Dumas' }).click();
  await allerA(page, '/taches');
  await expect(page.locator('main tr', { hasText: 'Tenir le stand de crêpes' })).toHaveCount(1);
});

test('personnes du club : la liste pour tout le monde, fiche en lecture ; retirer quelqu’un du club', async ({ page }) => {
  // Marc Lambert, au comité (sans « Gérer les personnes ») : la liste et les fiches, en lecture.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Marc Lambert' }).first().click();
  await allerA(page, '/membres-club');
  await expect(page.locator('main h1')).toContainText('Personnes du club');
  await expect(page.getByRole('button', { name: '+ Nouvelle personne' })).toHaveCount(0);
  await page.locator('.membres-table tr', { hasText: 'Hugo' }).first().click();
  const fiche = page.getByRole('dialog', { name: /Hugo Morel/ });
  await expect(fiche.getByLabel('Prénom')).toBeDisabled();
  await expect(fiche.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  await expect(fiche.getByRole('button', { name: 'Retirer du club' })).toHaveCount(0);
  await fiche.locator('.modal-foot').getByRole('button', { name: 'Fermer' }).click();

  // Julien Moreau (« Gérer les personnes ») retire Hugo Morel du club : sa fiche dans l'appli aussi.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Julien Moreau' }).first().click();
  await allerA(page, '/membres-club');
  await page.locator('.membres-table tr', { hasText: 'Hugo' }).first().click();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('dialog', { name: /Hugo Morel/ }).getByRole('button', { name: 'Retirer du club' }).click();
  await expect(page.locator('.membres-table tr', { hasText: 'Hugo' })).toHaveCount(0);
  const fiche2 = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('taches-gsa-demo-v7') ?? '{}').people ?? []).find((p: { prenom: string }) => p.prenom === 'Hugo'),
  );
  expect(fiche2.actif).toBe(false);
});

test('messagerie : nouvelle discussion, liste et non lus sur l’onglet', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche de la messagerie');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // « Nouvelle discussion » : choisir la tâche, écrire, la discussion apparaît dans la liste.
  await page.locator('.tabs').getByRole('link', { name: 'Messages' }).click();
  await page.getByRole('button', { name: 'Nouvelle discussion' }).click();
  await page.getByLabel('Chercher un point').fill('messagerie');
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
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
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
  await page.getByPlaceholder('Que faut-il faire ou savoir ?').fill('Tâche suivie de près');
  await page.locator('.modal').first().getByRole('button', { name: /^Enregistrer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.locator('main').getByText('Tâche suivie de près').filter({ visible: true }).first().click();
  const historique = page.locator('.modal').first().locator('details.historique');
  await historique.locator('summary').click();
  await expect(historique.locator('.historique-liste > li')).toHaveCount(2);
  await expect(historique.locator('.historique-liste > li').first()).toContainText('Titre : « Tâche suivie » → « Tâche suivie de près »');
  await expect(historique.locator('.historique-liste > li').last()).toContainText('a créé le point');
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
  await expect(page.locator('main').getByText(/vu par tout le monde/).first()).toBeVisible();
  ouverte = await ouvrir();
  suivi = ouverte.locator('.pour-info');
  await expect(suivi.locator('.pour-info-bilan')).toContainText('✓ Vu par tout le monde.');
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
  await expect(ouverte.locator('.pour-info-banner')).toContainText('Il a changé depuis ton « ✓ Vu »');
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

test('recherche globale (Ctrl+K) : tâche, séance, personne, étiquette', async ({ page }) => {
  const fiche = await nouvelleTache(page, 'Commander les maillots');
  await fiche.locator('textarea').first().fill('Tailles à demander avant la Fête de Noël');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  const champ = page.locator('.modal.recherche').getByRole('searchbox', { name: 'Rechercher' });
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
  // Une personne : la liste des personnes du club, filtrée sur elle.
  await champ.fill('yannick');
  const yannick = page.locator('.recherche-item', { hasText: 'Yannick Leroy' });
  await expect(yannick).toHaveCount(1);
  await yannick.click();
  await expect(page).toHaveURL(/#\/membres-club\?q=/);
  await expect(page.locator('.membres-table tr', { hasText: 'Leroy' }).first()).toBeVisible();
  await verifierUnSeulEspace(page);
  // Une étiquette : ses tâches.
  await page.keyboard.press('Control+k');
  await champ.fill('bruntrutaine');
  await page.locator('.recherche-liste section', { has: page.locator('h3', { hasText: 'Étiquettes' }) }).locator('.recherche-item', { hasText: 'Bruntrutaine' }).click();
  await expect(page).toHaveURL(/#\/taches\?etiquette=et-u-bruntrutaine/);
  await page.keyboard.press('Control+k');
  await expect(champ).toBeFocused();
  // Entrée : ouvre le premier résultat
  await champ.fill('maillot');
  await page.keyboard.press('Enter');
  await expect(page.getByPlaceholder('Que faut-il faire ou savoir ?')).toHaveValue('Commander les maillots');
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

  // Événement passé : replié dans « Événements passés », sous ceux à venir.
  await expect(page.locator('main .agenda').first().locator('.agenda-item', { hasText: 'Course de préparation 2026' })).toHaveCount(0);
  await page.locator('details.evenements-passes summary').click();
  await page.locator('.agenda-item', { hasText: 'Course de préparation 2026' }).getByRole('button', { name: 'Reprendre' }).click();
  const reprise = page.getByRole('dialog', { name: 'Reprendre « Course de préparation 2026 »' });
  await reprise.getByLabel('Premier jour').fill('2027-04-24');
  await expect(reprise.getByLabel('Nom', { exact: true })).toHaveValue('Course de préparation 2027');
  const ligne = reprise.locator('.anciennes-liste li', { hasText: 'Réserver les dossards' });
  await expect(ligne.locator('input')).toBeChecked();
  await expect(ligne).toContainText('délai 17.04.2027 (7 jours avant)');
  await reprise.getByRole('button', { name: 'Reprendre avec 1 point' }).click();

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
  await expect(nouvelle).toContainText('0/1 points terminés');
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
  await expect(resume).toContainText('1 point à faire');
  await expect(resume).toContainText('« Préparer le stand » mercredi');
  await resume.click();
  await expect(page).toHaveURL(/delai=semaine/);
  await expect(page.locator('main tr', { hasText: 'Préparer le stand' })).toHaveCount(1);
});

test('discussion d’une tâche étiquetée : réservée aux membres de l’étiquette, qui peuvent y ajouter quelqu’un ; plus de mentions @', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  const ouvrirFiche = async (titre: string) => {
    await allerA(page, '/taches');
    await page.getByRole('button', { name: 'Tous', exact: true }).click();
    await page.locator('main').getByText(titre).filter({ visible: true }).first().click();
    return page.locator('.modal').first();
  };
  const section = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first();
  const sousSection = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Sous-section/ }).locator('select').first();
  // Julien Moreau (admin) fait de « Section natation » un groupe, dont seule Émilie Rossi est membre ; un point y est rangé.
  await groupe(page, 'Section natation', ['Émilie Rossi']);
  const fiche = await nouvelleTache(page, 'Réserver les tentes');
  await section(fiche).selectOption({ label: 'Section natation' });
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Section natation/ })).toHaveAttribute('aria-pressed', 'true');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Julien voit la tâche (admin, et il l'a créée), mais pas sa discussion.
  let vue = await ouvrirFiche('Réserver les tentes');
  await expect(vue.getByRole('button', { name: /^Discussion/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Émilie Rossi, membre : la discussion, rappelée réservée ; pas de mentions (« @ » ne propose personne).
  await changer('Émilie Rossi');
  vue = await ouvrirFiche('Réserver les tentes');
  await vue.getByRole('button', { name: /^Discussion/ }).click();
  const discussion = page.getByRole('region', { name: 'Discussion' });
  await expect(discussion.locator('.discussion-reservee')).toHaveText('🔒 Réservée aux membres de l’étiquette « Section natation »');
  const champ = discussion.getByLabel('Nouveau commentaire');
  await expect(champ).toHaveAttribute('placeholder', 'Écrire un message…');
  await champ.pressSequentially('Qui a les tentes, @Jul');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await champ.press('Enter');
  await expect(discussion.locator('.discussion-message.mien')).toContainText('Qui a les tentes, @Jul');
  await expect(discussion.locator('.mention')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // Julien, auteur et responsable mais pas membre : ni notification, ni discussion dans Messages.
  await changer('Julien Moreau');
  await allerA(page, '/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.locator('.bell-item', { hasText: '« Réserver les tentes »' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await allerA(page, '/messages');
  await expect(page.locator('main')).not.toContainText('Réserver les tentes');

  // Émilie ajoute Julien à la discussion (il n'est pas membre de l'étiquette).
  await changer('Émilie Rossi');
  vue = await ouvrirFiche('Réserver les tentes');
  await vue.getByRole('button', { name: /^Discussion/ }).click();
  let fil = page.getByRole('region', { name: 'Discussion' });
  await fil.getByRole('button', { name: '+ Ajouter quelqu’un' }).click();
  await fil.getByLabel('Personne à ajouter à la discussion').selectOption({ label: 'Julien Moreau' });
  await expect(fil.locator('.discussion-personne')).toHaveText(/Julien Moreau/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Julien est prévenu ; la notification ouvre la discussion, qu'il lit et où il écrit ; puis il la quitte.
  await changer('Julien Moreau');
  await allerA(page, '/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.locator('.bell-item', { hasText: 'Émilie Rossi t’ajoute à la discussion de « Réserver les tentes »' }).click();
  fil = page.getByRole('region', { name: 'Discussion' });
  await expect(fil.locator('.discussion-message:not(.mien)')).toContainText('Qui a les tentes, @Jul');
  await fil.getByLabel('Nouveau commentaire').fill('Elles sont au local.');
  await fil.getByLabel('Nouveau commentaire').press('Enter');
  await expect(fil.locator('.discussion-message.mien')).toContainText('Elles sont au local.');
  page.once('dialog', (d) => void d.accept());
  await fil.locator('.discussion-personne', { hasText: 'Julien Moreau' }).getByRole('button', { name: 'Quitter' }).click();
  await expect(fil).toHaveCount(0);
  vue = await ouvrirFiche('Réserver les tentes');
  await expect(vue.getByRole('button', { name: /^Discussion/ })).toHaveCount(0);
});

test('étiquette d’un événement : sa sous-section dans « Événements », à l’accueil et dans l’agenda, ses membres voient ses points', async ({ page }) => {
  const d = new Date();
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const section = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first();
  const sousSection = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Sous-section/ }).locator('select').first();
  // Nouvel événement, case « Étiquette » cochée, Émilie Rossi (pas du comité) membre.
  await evenementEtiquete(page, 'Marché de Noël', jour, ['Émilie Rossi']);

  // Sa sous-section a été créée dans « Événements » ; un point rangé là porte l'étiquette d'office.
  const fiche = await nouvelleTache(page, 'Monter le stand');
  await section(fiche).selectOption({ label: 'Événements' });
  await sousSection(fiche).selectOption('Marché de Noël');
  const chip = fiche.locator('.etiquettes-choix').getByRole('button', { name: /Marché de Noël/ });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toBeDisabled();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Accueil : dans « Prochains événements » ; un clic ouvre la chronologie de ses points, et de là leur liste.
  await allerA(page, '/');
  const carte = page.locator('.bloc-evenements .link-panel', { hasText: 'Marché de Noël' });
  await expect(carte).toHaveCount(1);
  await expect(carte).toContainText('en cours');
  await carte.click();
  const chrono = page.getByRole('dialog', { name: 'Chronologie · Marché de Noël' });
  await expect(chrono.locator('.chrono-point', { hasText: 'Monter le stand' })).toHaveCount(1);
  await chrono.getByRole('link', { name: /Voir dans la liste des points/ }).click();
  await expect(page).toHaveURL(/#\/taches\?etiquette=/);
  await expect(page.locator('main tbody tr')).toHaveCount(1);
  await expect(page.locator('main tr', { hasText: 'Monter le stand' })).toHaveCount(1);

  // Agenda : l'événement à sa date, une seule fois (pas l'étiquette à part).
  await allerA(page, '/agenda');
  await expect(page.locator('.k-event', { hasText: 'Marché de Noël' }).first()).toBeVisible();
  await expect(page.locator('.k-etiquette', { hasText: 'Marché de Noël' })).toHaveCount(0);

  // Émilie Rossi, membre, voit le point.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Émilie Rossi' }).first().click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await allerA(page, '/taches');
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await expect(page.locator('main tr', { hasText: 'Monter le stand' })).toHaveCount(1);
});

test('statuts : réglés dans la console admin ; accueil, liste, filtre et fiche d’accord', async ({ page }) => {
  await allerA(page, '/admin/taches');
  await expect(page.locator('.subtabs').getByRole('combobox', { name: 'Entité' })).toHaveCount(0);
  const nouveau = page.getByPlaceholder('Nouveau statut (ex. En attente)');
  await nouveau.fill('Envoyé');
  await page.locator('.row', { has: nouveau }).getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByLabel('Nom du statut Envoyé')).toBeVisible();

  await allerA(page, '/taches');
  const fiche = await nouvelleTache(page, 'Poster les invitations');
  await fiche.getByRole('combobox', { name: 'Statut' }).click();
  await page.getByRole('option', { name: 'Envoyé' }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await allerA(page, '/');
  await expect(page.locator('.stat', { hasText: 'Envoyé' }).locator('b')).toHaveText('1');
  await allerA(page, '/taches');
  const ligne = page.locator('main tr', { hasText: 'Poster les invitations' });
  await expect(ligne.locator('.badge').first()).toHaveText('Envoyé');
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await page.locator('.filters select', { has: page.locator('option', { hasText: 'Tous statuts' }) }).selectOption({ label: 'Envoyé' });
  await expect(ligne).toHaveCount(1);
  await expect(page.locator('main tbody tr')).toHaveCount(1);
  await ligne.getByText('Poster les invitations').click();
  await expect(page.locator('.modal').first().getByRole('combobox', { name: 'Statut' })).toHaveText('Envoyé');
});

test('tâches : le filtre « Étiquette » ; « Événement » ne propose que des choix qui ont des tâches', async ({ page }) => {
  await allerA(page, '/taches');
  const fiche = await nouvelleTache(page, 'Louer la sono');
  await fiche.locator('.etiquettes-choix').getByRole('button', { name: 'Soirée récréative' }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const autre = await nouvelleTache(page, 'Commander les flyers');
  await autre.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await page.getByRole('button', { name: /^Filtres/ }).click();
  // Plus de filtre « Entité ».
  await expect(page.getByLabel('Entité')).toHaveCount(0);
  await page.getByLabel('Étiquette', { exact: true }).selectOption({ label: 'Soirée récréative' });
  await expect(page.locator('main tbody tr')).toHaveCount(1);
  await expect(page.locator('main tr', { hasText: 'Louer la sono' })).toHaveCount(1);
  // « Événement » : seulement celui de l'étiquette (son point la porte), comme sur la carte de l'événement ; pas les autres.
  expect((await page.getByLabel('Événement').locator('option').allTextContents()).map((x) => x.trim())).toEqual(['Tous événements', 'Soirée récréative']);
  await page.getByLabel('Événement').selectOption({ label: 'Soirée récréative' });
  await expect(page.locator('main tbody tr')).toHaveCount(1);
});

test('lien d’avant, avec son entité : la tâche s’ouvre dans l’espace du club', async ({ page }) => {
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!);
    const julien = d.people.find((p: { prenom: string }) => p.prenom === 'Julien');
    d.tasks.push({ id: 'tlien', sectionId: d.sections[0].id, sousSection: '', titre: 'Réserver la sono', responsables: [julien.id], statusId: d.statuses[0].id, delai: '', remarque: '', checklist: [], createdBy: julien.id, updatedAt: new Date().toISOString() });
    localStorage.setItem('taches-gsa-demo-v7', JSON.stringify(d));
  });
  // Un lien envoyé avant D1 (notification, WhatsApp) porte l'entité de la tâche : elle est ignorée.
  await page.goto('./?demo=u-soiree#/taches?tache=tlien');
  await expect(page.locator('.modal').first().getByPlaceholder('Que faut-il faire ou savoir ?')).toHaveValue('Réserver la sono');
  await verifierUnSeulEspace(page);
  await page.goto('./?demo#/');
  await verifierUnSeulEspace(page);
});

test('groupe : une section cochée « Groupe » ; ses membres voient ses points, la liste montre l’étiquette et la filtre', async ({ page }) => {
  // Julien Moreau (admin) coche « Groupe » sur « Section natation » ; Émilie Rossi (sans « voir tous les points ») en est membre.
  await groupe(page, 'Section natation', ['Émilie Rossi']);

  // Un point de la section, confié à quelqu'un d'autre : il porte l'étiquette du groupe d'office.
  const fiche = await nouvelleTache(page, 'Réserver les tentes');
  await fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first().selectOption({ label: 'Section natation' });
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await allerA(page, '/taches');
  const ligne = page.locator('main tr', { hasText: 'Réserver les tentes' });
  await expect(ligne.locator('.badge.etiquette')).toHaveText('Section natation');
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await page.getByLabel('Étiquette', { exact: true }).selectOption({ label: 'Section natation' });
  await expect(page.locator('main tbody tr')).toHaveCount(1);

  // Émilie Rossi la voit (« Toutes » : les points de ses étiquettes), avec qui s'en occupe.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Émilie Rossi' }).first().click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await allerA(page, '/taches');
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  const vue = page.locator('main tr', { hasText: 'Réserver les tentes' });
  await expect(vue).toHaveCount(1);
  await expect(vue.locator('.badge.etiquette')).toHaveText('Section natation');
  await expect(vue.locator('.avatars .avatar')).toHaveCount(1);

  // La section n'est plus un groupe : l'étiquette part, le point reste.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Julien Moreau' }).first().click();
  await allerA(page, '/admin/taches');
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Groupe : la section Section natation est une étiquette').uncheck();
  await allerA(page, '/taches');
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await expect(page.locator('main tr', { hasText: 'Réserver les tentes' }).locator('.badge.etiquette')).toHaveCount(0);
});

test('point rattaché à un événement qui a son étiquette : il la porte ; son délai et l’étiquette suivent la date', async ({ page }) => {
  const jour = (n: number) => {
    const d = new Date(Date.now() + n * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  await evenementEtiquete(page, 'Marché de Noël', jour(10), []);

  // « Pour quand ? » (une nouvelle tâche suit la prochaine séance) › l'événement, 2 jours avant : la tâche porte son étiquette.
  const fiche = await nouvelleTache(page, 'Monter le stand');
  await fiche.getByRole('combobox', { name: 'Date fixe, ou selon un événement / une séance' }).click();
  // Proposé une fois : l'événement (pas son étiquette en plus).
  await expect(page.getByRole('option', { name: /^Marché de Noël \(/ })).toHaveCount(1);
  await page.getByRole('option', { name: /^Marché de Noël \(/ }).click();
  await fiche.getByLabel('Nombre').fill('2');
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Marché de Noël/ })).toHaveAttribute('aria-pressed', 'true');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const donnees = () => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!));
  const tache = async () => (await donnees()).tasks.find((t: { titre: string }) => t.titre === 'Monter le stand');
  const etiquette = async () => (await donnees()).etiquettes.find((e: { nom: string }) => e.nom === 'Marché de Noël');
  await expect.poll(async () => (await tache())?.delai).toBe(jour(8));
  expect((await tache()).delaiRef).toMatchObject({ type: 'event', joursAvant: 2 });
  expect((await tache()).etiquettes).toEqual([(await etiquette()).id]);

  // La date de l'événement change : le délai et la date de l'étiquette suivent.
  await allerA(page, '/evenements');
  await page.locator('article.agenda-item', { hasText: 'Marché de Noël' }).getByRole('button', { name: 'Modifier' }).click();
  const f = page.getByRole('dialog', { name: 'Événement' });
  await expect(f.locator('.case-etiquette').getByRole('checkbox')).toBeChecked();
  await f.getByLabel('Premier jour').fill(jour(20));
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await tache())?.delai).toBe(jour(18));
  await expect.poll(async () => (await etiquette())?.date).toBe(jour(20));
});

test('étiquettes d’office : groupe, événement, « Comité » pour le reste ; un membre ne range et n’étiquette que chez lui', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  // Noms des étiquettes d'un point enregistré.
  const etiquettesDe = (titre: string) =>
    page.evaluate((x) => {
      const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!);
      const t = d.tasks.find((y: { titre: string }) => y.titre === x);
      return (t?.etiquettes ?? []).map((id: string) => d.etiquettes.find((e: { id: string }) => e.id === id)?.nom).sort();
    }, titre);
  const section = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first();
  const sousSection = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Sous-section/ }).locator('select').first();

  // Julien Moreau (admin) : « Comité » (console admin, avec ses membres : l'accès aux séances).
  await changer('Julien Moreau');
  await allerA(page, '/admin/taches');
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Comité : l’étiquette des autres points').check();
  const comite = page.locator('.comite-reglage fieldset');
  await expect(comite.getByRole('button', { name: 'Marc Lambert' })).toHaveAttribute('aria-pressed', 'true');
  await expect(comite.getByRole('button', { name: 'David Muller' })).toHaveAttribute('aria-pressed', 'false');
  // Les groupes de la démo : leur section cochée.
  await expect(page.getByLabel('Groupe : la section Groupe compétition est une étiquette')).toBeChecked();
  await expect(page.getByLabel('Groupe : la section Divers est une étiquette')).not.toBeChecked();

  // Page Étiquettes : l'événement coché, avec sa sous-section ; le même réglage dans le formulaire de l'événement.
  await allerA(page, '/etiquettes');
  await expect(page.getByLabel('Étiquette de l’événement Bruntrutaine')).toBeChecked();
  await expect(page.locator('.groupe-section', { has: page.getByLabel('Étiquette de l’événement Bruntrutaine') })).toContainText('Événements › Bruntrutaine 27.02.27');
  await allerA(page, '/evenements');
  await page.locator('article.agenda-item', { hasText: 'Bruntrutaine' }).getByRole('button', { name: 'Modifier' }).click();
  const ev = page.getByRole('dialog', { name: 'Événement' });
  await expect(ev.locator('.case-etiquette').getByRole('checkbox')).toBeChecked();
  await expect(ev.locator('.case-etiquette').getByRole('button', { name: 'David Muller' })).toHaveAttribute('aria-pressed', 'true');
  await ev.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await allerA(page, '/taches');

  // Un point du comité reçoit « Comité » d'office ; rangé dans « Groupe compétition », il prend l'étiquette du groupe.
  let fiche = await nouvelleTache(page, 'Renouveler la licence');
  await section(fiche).selectOption({ label: 'Administration' });
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Comité/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Comité/ })).toBeDisabled();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(() => etiquettesDe('Renouveler la licence')).toEqual(['Comité']);
  await page.locator('main').getByText('Renouveler la licence').filter({ visible: true }).first().click();
  fiche = page.locator('.modal').first();
  await section(fiche).selectOption({ label: 'Groupe compétition' });
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Groupe compétition/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Comité/ })).toHaveAttribute('aria-pressed', 'false');
  await fiche.getByRole('button', { name: /^Enregistrer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(() => etiquettesDe('Renouveler la licence')).toEqual(['Groupe compétition']);

  // David Muller (Bruntrutaine, pas du comité) : ses points ne vont que dans la sous-section de la Bruntrutaine, avec son
  // étiquette d'office ; il ne voit pas les étiquettes dont il n'est pas membre.
  await changer('David Muller');
  await allerA(page, '/taches');
  fiche = await nouvelleTache(page, 'Commander les dossards');
  await expect(section(fiche).locator('option')).toHaveText(['— Choisir —', 'Événements']);
  await expect(sousSection(fiche)).toHaveValue('Bruntrutaine 27.02.27');
  await expect(sousSection(fiche).locator('option')).toHaveText(['Bruntrutaine 27.02.27']);
  const choix = fiche.locator('.etiquettes-choix .chip');
  await expect(choix).toHaveCount(1);
  await expect(choix).toHaveText(/Bruntrutaine/);
  await expect(choix).toBeDisabled();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(() => etiquettesDe('Commander les dossards')).toEqual(['Bruntrutaine']);

  // Marc Lambert (comité) range ses points partout ; à la main, seulement les étiquettes dont il est membre.
  await changer('Marc Lambert');
  await allerA(page, '/taches');
  fiche = await nouvelleTache(page, 'Préparer le budget');
  await section(fiche).selectOption({ label: 'Comptabilité' });
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Bruntrutaine/ })).toBeEnabled();
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /École de cyclisme/ })).toHaveCount(0);
  await fiche.locator('.etiquettes-choix').getByRole('button', { name: /Bruntrutaine/ }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(() => etiquettesDe('Préparer le budget')).toEqual(['Bruntrutaine', 'Comité']);
});

test('anciennes étiquettes reprises : en cochant « Groupe » sur la section, ou « Étiquette » dans l’événement du même jour', async ({ page }) => {
  // Deux étiquettes d'avant (ni section ni événement), avec leurs points et leurs membres, comme sur le serveur.
  await page.evaluate(() => {
    const k = 'taches-gsa-demo-v7';
    const d = JSON.parse(localStorage.getItem(k)!);
    d.etiquettes.push(
      { id: 'et-gruppetto', nom: 'Gruppetto', couleur: '#ea580c', type: 'groupe', membres: ['p8'] },
      { id: 'et-st-martin', nom: 'Sortie de St-Martin', couleur: '#0891b2', type: 'evenement', date: '2026-11-14', membres: ['p6', 'p8'] },
    );
    const t = (id: string, titre: string, sectionId: string, sousSection: string, etiquettes?: string[]) => ({
      id, titre, sectionId, sousSection, responsables: ['p1'], statusId: d.statuses[0].id, delai: '', remarque: '', checklist: [], createdBy: 'p1', updatedAt: '2026-11-01T10:00:00.000Z', etiquettes,
    });
    d.tasks.push(t('t-g1', 'Sortie du dimanche', 'sec7', '', ['et-gruppetto']), t('t-g2', 'Maillots du gruppetto', 'sec7', ''), t('t-s1', 'Lampions', 'sec8', 'Sortie St-Martin 14.11', ['et-st-martin']));
    localStorage.setItem(k, JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  const donnees = () => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!));

  // Page Étiquettes : elles sont « à relier ».
  await allerA(page, '/etiquettes');
  await expect(page.locator('main h2', { hasText: 'À relier' })).toBeVisible();

  // Section Gruppetto cochée « Groupe » : l'ancienne étiquette est proposée ; reprise, elle garde son identifiant et ses
  // membres, et tous les points de la section la portent.
  await allerA(page, '/admin/taches');
  await page.getByLabel('Groupe : la section Gruppetto est une étiquette').check();
  await expect(page.getByLabel('Étiquette de la section Gruppetto')).toHaveValue('et-gruppetto');
  await page.getByRole('button', { name: 'Créer le groupe' }).click();
  await expect.poll(async () => (await donnees()).etiquettes.find((e: { id: string }) => e.id === 'et-gruppetto')).toMatchObject({ sectionId: 'sec7', membres: ['p8'], nom: 'Gruppetto' });
  await expect.poll(async () => (await donnees()).tasks.find((t: { id: string }) => t.id === 't-g2').etiquettes).toEqual(['et-gruppetto']);

  // Événement du même jour (« Sortie de la St-Martin », 14.11) : sa case « Étiquette » propose de reprendre l'ancienne ;
  // elle prend le nom de l'événement et garde sa sous-section (et ses points).
  await allerA(page, '/evenements');
  await page.locator('article.agenda-item', { hasText: 'Sortie de la St-Martin' }).getByRole('button', { name: 'Modifier' }).click();
  const f = page.getByRole('dialog', { name: 'Événement' });
  await f.locator('.case-etiquette').getByRole('checkbox').check();
  await expect(f.locator('.case-etiquette select')).toHaveValue('et-st-martin');
  await expect(f.locator('.case-etiquette').getByRole('button', { name: 'Pierre Favre' })).toHaveAttribute('aria-pressed', 'true');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect.poll(async () => (await donnees()).etiquettes.find((e: { id: string }) => e.id === 'et-st-martin')).toMatchObject({
    eventId: 'e9', nom: 'Sortie de la St-Martin', lieux: [{ sectionId: 'sec8', sousSection: 'Sortie St-Martin 14.11' }],
  });
  expect((await donnees()).sections.find((x: { id: string }) => x.id === 'sec8').sousSections.filter((x: string) => /St-Martin/.test(x))).toEqual(['Sortie St-Martin 14.11']);
  expect((await donnees()).tasks.find((t: { id: string }) => t.id === 't-s1').etiquettes).toEqual(['et-st-martin']);

  // Plus rien « à relier ».
  await allerA(page, '/etiquettes');
  await expect(page.locator('main h1', { hasText: 'Étiquettes' })).toBeVisible();
  await expect(page.locator('main h2', { hasText: 'À relier' })).toHaveCount(0);
});

test('page Étiquettes, dans le menu Club : tout le réglage ; une icône choisie dans la bibliothèque, sur les pastilles', async ({ page }) => {
  // Le menu : Club › Étiquettes.
  await page.locator('.topbar nav a', { hasText: 'Club' }).first().click();
  await page.locator('nav.subtabs').getByRole('link', { name: 'Étiquettes' }).click();
  await expect(page).toHaveURL(/#\/etiquettes$/);
  await expect(page.locator('main h1', { hasText: 'Étiquettes' })).toBeVisible();

  // Un événement coché ici a son étiquette (et sa sous-section) tout de suite.
  // (Marche familiale, le 13.09.2026 : parmi les événements passés, repliés.)
  await page.getByRole('button', { name: /Voir les événements passés/ }).click();
  await page.getByLabel('Étiquette de l’événement Marche familiale').check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).etiquettes.find((e: { eventId?: string }) => e.eventId === 'e6')?.nom)).toBe('Marche familiale');

  // Groupe compétition : icône « VTT » choisie dans la bibliothèque (recherche).
  const ligne = page.locator('.groupe-section', { has: page.getByLabel('Groupe : la section Groupe compétition est une étiquette') });
  await ligne.getByRole('button', { name: /5 membres/ }).click();
  await ligne.getByRole('button', { name: 'Icône de l’étiquette Groupe compétition' }).click();
  await ligne.getByLabel('Chercher une icône').fill('vtt');
  await ligne.getByRole('radio', { name: 'VTT', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).etiquettes.find((e: { id: string }) => e.id === 'et-u-competition')?.icone)).toBe('vtt');

  // Sur la pastille d'un point du groupe : l'icône, puis le nom.
  const fiche = await nouvelleTache(page, 'Inscrire l’équipe');
  await fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first().selectOption({ label: 'Groupe compétition' });
  await expect(fiche.locator('.etiquettes-choix').getByRole('button', { name: /Groupe compétition/ }).locator('svg')).toHaveCount(1);
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await allerA(page, '/taches');
  const badge = page.locator('main tr', { hasText: 'Inscrire l’équipe' }).locator('.badge.etiquette');
  await expect(badge).toHaveText('Groupe compétition');
  await expect(badge.locator('svg')).toHaveCount(1);

  // Sans droit de réglage (Émilie Rossi) : la page en lecture.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Émilie Rossi' }).first().click();
  await allerA(page, '/etiquettes');
  await expect(page.getByLabel('Groupe : la section Groupe compétition est une étiquette')).toBeDisabled();
  await expect(page.getByLabel('Comité : l’étiquette des autres points')).toBeDisabled();
});

test('discussion d’une étiquette : ses membres seuls la lisent, sont prévenus et la retrouvent dans Messages', async ({ page }) => {
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  // Julien Moreau, membre de « Soirée récréative » : la discussion de l'étiquette depuis la page Étiquettes.
  await changer('Julien Moreau');
  await allerA(page, '/etiquettes');
  await page.getByRole('button', { name: 'Discussion de l’étiquette Soirée récréative' }).click();
  let fil = page.getByRole('region', { name: 'Discussion' });
  await expect(fil.locator('.discussion-reservee')).toHaveText('🔒 Réservée aux membres de l’étiquette « Soirée récréative » (5)');
  await expect(fil.getByRole('button', { name: '+ Ajouter quelqu’un' })).toHaveCount(0);
  await fil.getByLabel('Nouveau commentaire').fill('Qui apporte la sono ?');
  await fil.getByLabel('Nouveau commentaire').press('Enter');
  await expect(fil.locator('.discussion-message.mien')).toContainText('Qui apporte la sono ?');
  await page.keyboard.press('Escape');
  await expect(page.locator('main .messages-ligne', { hasText: 'Soirée récréative' })).toContainText('Qui apporte la sono ?');

  // Pierre Favre, membre : prévenu ; Messages la montre non lue ; la notification l'ouvre.
  await changer('Pierre Favre');
  await allerA(page, '/messages');
  await expect(page.locator('main .messages-ligne.nonlu', { hasText: 'Soirée récréative' })).toBeVisible();
  await allerA(page, '/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.locator('.bell-item', { hasText: 'Julien Moreau a commenté « Soirée récréative »' }).click();
  fil = page.getByRole('region', { name: 'Discussion' });
  await expect(fil.locator('.discussion-message:not(.mien)')).toContainText('Qui apporte la sono ?');
  await fil.getByLabel('Nouveau commentaire').fill('Moi, je l’ai.');
  await fil.getByLabel('Nouveau commentaire').press('Enter');
  await expect(fil.locator('.discussion-message.mien')).toContainText('Moi, je l’ai.');
  await page.keyboard.press('Escape');

  // Marc Lambert, pas membre : ni la discussion dans Messages, ni par son adresse ; « Nouvelle discussion » propose les siennes.
  await changer('Marc Lambert');
  await allerA(page, '/messages');
  await expect(page.locator('main')).not.toContainText('Qui apporte la sono');
  await allerA(page, '/messages?d=et:et-u-soiree');
  await expect(page.getByRole('region', { name: 'Discussion' })).toHaveCount(0);
  await allerA(page, '/messages');
  await page.getByRole('button', { name: 'Nouvelle discussion' }).click();
  const choix = page.getByRole('dialog', { name: 'Nouvelle discussion' });
  await expect(choix.locator('.badge.etiquette', { hasText: 'Bruntrutaine' })).toBeVisible();
  await expect(choix.locator('.badge.etiquette', { hasText: 'Soirée récréative' })).toHaveCount(0);
});

test('discussions de points de même nom : chacune avec les étiquettes de son point (Messages, fenêtre, notification)', async ({ page }) => {
  const section = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first();
  const sousSection = (fiche: ReturnType<typeof page.locator>) => fiche.locator('label', { hasText: /^\s*Sous-section/ }).locator('select').first();
  const changer = async (nom: string) => {
    await page.getByRole('button', { name: 'Changer', exact: true }).click();
    await page.locator('.login-user', { hasText: nom }).first().click();
    await expect(page.locator('.topbar .brand')).toBeVisible();
  };
  // Julien Moreau, membre de la Soirée récréative, devient aussi membre de la Bruntrutaine (page Étiquettes).
  await changer('Julien Moreau');
  await allerA(page, '/etiquettes');
  const brunt = page.locator('.groupe-section', { has: page.getByLabel('Étiquette de l’événement Bruntrutaine') });
  await brunt.getByRole('button', { name: /6 membres/ }).click();
  await brunt.locator('fieldset').getByRole('button', { name: 'Julien Moreau', exact: true }).click();
  await expect(brunt.locator('fieldset').getByRole('button', { name: 'Julien Moreau', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // « Commander les maillots » pour la Bruntrutaine et pour la Soirée récréative, avec un message chacun.
  for (const [sous, texte] of [['Bruntrutaine 27.02.27', 'Tailles S à XL'], ['Soirée récréative 28.11', 'Couleur bordeaux']]) {
    const fiche = await nouvelleTache(page, 'Commander les maillots');
    await section(fiche).selectOption({ label: 'Événements' });
    await sousSection(fiche).selectOption(sous);
    await fiche.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
    await allerA(page, '/taches');
    await page.getByRole('button', { name: 'Tous', exact: true }).click();
    await page.locator('main tr', { hasText: 'Commander les maillots' }).filter({ has: page.locator('.badge.etiquette', { hasText: sous.split(' ')[0] }) }).getByText('Commander les maillots').click();
    const vue = page.locator('.modal').first();
    await vue.getByRole('button', { name: /^Discussion/ }).click();
    const fil = page.getByRole('region', { name: 'Discussion' });
    await expect(page.getByRole('dialog', { name: `Commander les maillots · ${sous.startsWith('Bruntrutaine') ? 'Bruntrutaine' : 'Soirée récréative'}` })).toBeVisible();
    await fil.getByLabel('Nouveau commentaire').fill(texte);
    await fil.getByLabel('Nouveau commentaire').press('Enter');
    await expect(fil.locator('.discussion-message.mien')).toContainText(texte);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
  }

  // Messages : deux discussions de même titre, chacune avec l'étiquette de son point ; la recherche trouve par étiquette.
  await allerA(page, '/messages');
  const lignes = page.locator('main .messages-ligne', { hasText: 'Commander les maillots' });
  await expect(lignes).toHaveCount(2);
  await expect(lignes.filter({ hasText: 'Tailles S à XL' }).locator('.badge.etiquette')).toHaveText('Bruntrutaine');
  await expect(lignes.filter({ hasText: 'Couleur bordeaux' }).locator('.badge.etiquette')).toHaveText('Soirée récréative');
  // À la place de l'initiale du point : l'icône de son étiquette, dans sa couleur.
  await expect(lignes.filter({ hasText: 'Tailles S à XL' }).locator('.messages-avatar')).toHaveAttribute('title', 'Étiquette « Bruntrutaine »');
  await expect(lignes.filter({ hasText: 'Tailles S à XL' }).locator('.messages-avatar svg')).toHaveCount(1);
  await expect(lignes.filter({ hasText: 'Couleur bordeaux' }).locator('.messages-avatar')).toHaveAttribute('title', 'Étiquette « Soirée récréative »');
  await page.getByLabel('Rechercher dans les messages').fill('bruntrutaine');
  await expect(lignes).toHaveCount(1);

  // Pierre Favre (membre de la Soirée) répond ; Julien, l'auteur du point, est prévenu : la notification dit de quel
  // événement il s'agit.
  await changer('Pierre Favre');
  await allerA(page, '/messages');
  await page.locator('main .messages-ligne', { hasText: 'Couleur bordeaux' }).click();
  const fil = page.getByRole('region', { name: 'Discussion' });
  await fil.getByLabel('Nouveau commentaire').fill('Vu, je m’en occupe.');
  await fil.getByLabel('Nouveau commentaire').press('Enter');
  await expect(fil.locator('.discussion-message.mien')).toContainText('Vu, je m’en occupe.');
  await page.keyboard.press('Escape');
  await changer('Julien Moreau');
  await allerA(page, '/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.locator('.bell-item', { hasText: 'Pierre Favre a commenté « Commander les maillots » (Soirée récréative)' })).toBeVisible();
});

test('aide et textes de l’appli : plus d’entités, d’organigramme ni de comité central (admin et membre)', async ({ page }) => {
  // Un seul espace (PLAN_APPLI_SIMPLE.md, D5) : l'aide, la console admin et les propositions ne parlent que du club.
  const ancien = /entit[ée]s?\b|organigramme|comité central|sous-comité|caisse centrale|vue « moi »/i;
  const verifier = async () => {
    for (const h of ['/aide', '/propositions', '/admin', '/membres-club']) {
      await allerA(page, h);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('.chargement-page')).toHaveCount(0);
      expect(await page.locator('main').innerText(), h).not.toMatch(ancien);
    }
  };
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Julien Moreau' }).first().click();
  await verifier();
  // Le menu du compte ne propose plus d'ancienne entité à ouvrir.
  await page.locator('.who-btn').click();
  await expect(page.locator('.compte-menu')).toBeVisible();
  await expect(page.locator('.compte-menu')).not.toContainText('Ouvrir «');
  await page.locator('.unit-back').click();
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Antoine Mercier' }).first().click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await verifier();
});

test('notes des séances : dans la fiche de la tâche, PV en cours pour qui tient le PV, PV validés pour les autres', async ({ page }) => {
  // « Point piscine », confié à Émilie Rossi (sans la page PV), et son occurrence précédente ; trois PV en parlent :
  // avril (validé, l'occurrence précédente), mai (validé, en gras) et juin (pas encore validé).
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const ouvert = d.statuses.find((s: { done: boolean }) => !s.done).id;
    const fini = d.statuses.find((s: { done: boolean }) => s.done).id;
    const base = { sectionId: d.sections[0].id, sousSection: '', titre: 'Point piscine', remarque: '', checklist: [], createdBy: d.people[0].id, updatedAt: new Date().toISOString(), responsables: ['p9'] };
    d.tasks.push({ ...base, id: 'tn-avant', statusId: fini, delai: '2026-04-09', termineeLe: '2026-04-09', suivanteId: 'tn' }, { ...base, id: 'tn', statusId: ouvert, delai: '2026-12-31' });
    const pv = (notes: Record<string, string>, valide: boolean) => ({ presents: [], excuses: [], notes, ...(valide ? { valideLe: '2026-06-01T20:00:00.000Z', validePar: d.people[0].id, version: 1 } : {}) });
    const seance = (id: string) => d.meetings.find((x: { id: string }) => x.id === id);
    seance('m1').minutes = pv({ 'task:tn-avant': 'Horaires d’hiver confirmés.' }, true);
    seance('m2').minutes = pv({ 'task:tn': '<!--mef--><b>Devis reçu</b> : à comparer.' }, true);
    seance('m3').minutes = pv({ 'task:tn': 'Budget à revoir avec la caisse.' }, false);
    localStorage.setItem(k, JSON.stringify(d));
  }, cle);
  await page.reload();

  // Admin (page PV) : les trois notes, la plus récente d'abord ; celle du PV pas encore validé marquée « PV en cours ».
  await allerA(page, '/taches?tache=tn');
  const notes = page.locator('.modal').first().locator('fieldset.notes-seances');
  await expect(notes.locator('legend')).toHaveText('Notes des séances');
  const lignes = notes.locator('li');
  await expect(lignes).toHaveCount(3);
  await expect(lignes.nth(0)).toContainText('Budget à revoir avec la caisse.');
  await expect(lignes.nth(0).locator('.pbadge')).toHaveText('PV en cours');
  await expect(lignes.nth(1)).toContainText('Devis reçu : à comparer.');
  await expect(lignes.nth(1).locator('b')).toHaveText('Devis reçu');
  await expect(lignes.nth(1).locator('.pbadge')).toHaveCount(0);
  await expect(lignes.nth(2)).toContainText('occurrence précédente');
  await expect(lignes.nth(2)).toContainText('Horaires d’hiver confirmés.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal')).toHaveCount(0);

  // Émilie Rossi, sans la page PV : seulement les notes des PV validés.
  await page.getByRole('button', { name: 'Changer', exact: true }).click();
  await page.locator('.login-user', { hasText: 'Émilie Rossi' }).first().click();
  await expect(page.locator('.topbar .brand')).toBeVisible();
  await allerA(page, '/taches?tache=tn');
  await expect(lignes).toHaveCount(2);
  await expect(notes).not.toContainText('Budget à revoir');
  await expect(notes.locator('.pbadge')).toHaveCount(0);

  // Une tâche dont aucun PV ne parle : pas de « Notes des séances ».
  await page.keyboard.press('Escape');
  await allerA(page, '/taches');
  const fiche = await nouvelleTache(page, 'Tâche sans séance');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await page.locator('main').getByText('Tâche sans séance').filter({ visible: true }).first().click();
  await expect(page.locator('.modal').first().getByPlaceholder('Que faut-il faire ou savoir ?')).toHaveValue('Tâche sans séance');
  await expect(page.locator('fieldset.notes-seances')).toHaveCount(0);
});

/** Date locale dans `n` jours (AAAA-MM-JJ). */
const dansJours = (n: number) => {
  const d = new Date(Date.now() + n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('PV : les points dans le même ordre que l’ordre du jour (sous-sections, rattachés, sondage, tri choisi)', async ({ page }) => {
  // Points de la prochaine séance : sans sous-section, une sous-section avec son point « de tête » (même nom), des
  // rattachés rangés ailleurs que leur point principal, un retard, un sondage rattaché ; ordre du jour trié par titre.
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const ouverts = d.statuses.filter((s: { done: boolean }) => !s.done).map((s: { id: string }) => s.id);
    let s1 = d.meetings.filter((m: { date: string }) => m.date >= j[0]).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))[0];
    if (!s1) d.meetings.push((s1 = { id: 'm-test', titre: 'Comité test', date: j[3], heure: '19:30', lieu: '' }));
    const sec = d.sections.find((s: { sousSections: string[] }) => s.sousSections.length >= 2);
    const [ssA, ssB] = sec.sousSections;
    const sec2 = d.sections.find((s: { id: string }) => s.id !== sec.id);
    const moi = d.people[0].id;
    const t = (id: string, titre: string, o: object) => ({ id, sectionId: sec.id, sousSection: '', titre, responsables: [moi], statusId: ouverts[0], delai: j[0], meetingId: s1.id, remarque: '', checklist: [], createdBy: moi, updatedAt: new Date().toISOString(), ...o });
    d.tasks.push(
      t('o1', 'Zèbre', {}),
      t('o2', 'Alpha', { statusId: ouverts[1] ?? ouverts[0] }),
      t('o3', ssA, { sousSection: ssA }),
      t('o4', 'Budget', { sousSection: ssA }),
      t('o5', 'Rattaché à Budget, rangé dans B', { sousSection: ssB, parentId: 'o4' }),
      t('o6', 'Point de B', { sousSection: ssB }),
      t('o7', 'En retard', { delai: j[1], meetingId: undefined }),
      t('o8', 'Rattaché au point de B, sans sous-section', { parentId: 'o6' }),
      t('o9', 'Rattaché au point de tête', { sousSection: ssA, parentId: 'o3' }),
      t('o10', 'Autre section', { sectionId: sec2.id }),
    );
    d.polls = [...(d.polls ?? []), { id: 'sd-o', question: 'Quelle date pour le camp ?', type: 'choix', multiple: false, options: [{ id: 'x1', label: 'Juillet' }, { id: 'x2', label: 'Août' }], votants: [], anonyme: false, votes: {}, taskId: 'o4', creePar: moi, creeLe: new Date().toISOString() }];
    d.prefs = { ...d.prefs, [moi]: { ...d.prefs?.[moi], pv: { ...d.prefs?.[moi]?.pv, tri: 'titre' } } };
    localStorage.setItem(k, JSON.stringify(d));
  }, { k: cle, j: [dansJours(0), dansJours(-30), dansJours(5), dansJours(20)] });
  await page.reload();

  const libelle = (sel: string) =>
    page.locator(sel).evaluateAll((els) =>
      els.map((e) =>
        e.classList.contains('odj-poll')
          ? `Sondage ${e.textContent!.replace(/^📊 /, '').replace(/^Sondage : /, '').split(' — ')[0].trim()}`
          : // PV : le titre est le bouton qui ouvre le point.
            (e.querySelector(':scope > .min-ouvrir')?.textContent ?? [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')).trim(),
      ),
    );
  await allerA(page, '/ordre-du-jour');
  await expect(page.locator('.pv-sheet .odj-task', { hasText: 'Zèbre' })).toBeVisible();
  const odj = await libelle('.pv-sheet .odj-task, .pv-sheet .odj-poll');
  await allerA(page, '/pv');
  await expect(page.locator('.min-agenda .min-title', { hasText: 'Zèbre' })).toBeVisible();
  const pv = await libelle('.min-agenda .min-task .min-title');
  expect(odj).toContain('Rattaché à Budget, rangé dans B');
  expect(odj).toContain('Sondage Quelle date pour le camp ?');
  expect(pv).toEqual(odj);
});

test('PV validé de la dernière séance passée : il quitte la liste des séances pour « Reprendre un ancien PV »', async ({ page }) => {
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  // Dernière séance passée : il y a 3 jours ; une prochaine séance prévue.
  const preparer = (valide: boolean) =>
    page.evaluate(({ k, j, valide }) => {
      const d = JSON.parse(localStorage.getItem(k)!);
      d.meetings = d.meetings.filter((m: { id: string; date: string }) => m.id !== 'm-passee' && !(m.date > j[0] && m.date < j[1]));
      if (!d.meetings.some((m: { date: string }) => m.date >= j[1])) d.meetings.push({ id: 'm-suivante', titre: 'Comité suivant', date: j[2], heure: '19:30', lieu: '' });
      d.meetings.push({
        id: 'm-passee', titre: 'Comité d’essai', date: j[0], heure: '19:30', lieu: '',
        minutes: { presents: [], excuses: [], notes: { divers: 'Rien.' }, demarreLe: new Date().toISOString(), ...(valide ? { valideLe: new Date().toISOString(), validePar: d.people[0].id, version: 1 } : {}) },
      });
      localStorage.setItem(k, JSON.stringify(d));
    }, { k: cle, j: [dansJours(-3), dansJours(0), dansJours(20)], valide });
  const seances = page.getByLabel('Séance', { exact: true });
  const anciens = page.getByLabel('Reprendre un ancien PV');

  // PV pas encore validé : dans la liste des séances.
  await preparer(false);
  await page.reload();
  await allerA(page, '/pv');
  await expect(seances.locator('option', { hasText: 'Comité d’essai' })).toHaveCount(1);
  await expect(anciens.locator('option', { hasText: 'Comité d’essai' })).toHaveCount(0);

  // Validé : dans « Reprendre un ancien PV », plus dans la liste des séances.
  await preparer(true);
  await page.reload();
  await allerA(page, '/pv');
  await expect(anciens.locator('option', { hasText: 'Comité d’essai' })).toHaveCount(1);
  await expect(seances.locator('option', { hasText: 'Comité d’essai' })).toHaveCount(0);
});

test('PV repris après la séance : les points tels qu’à la fin de la séance, pas ce qui a changé ailleurs depuis', async ({ page }) => {
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  // Séance il y a 5 jours (PV commencé, pas validé). « Point fermé après la séance » : terminé il y a 2 jours par une
  // autre personne. « Point modifié au PV » : passé « en cours » hier depuis le PV (journal). « Point inchangé ».
  const ids = await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const ouverts = d.statuses.filter((s: { done: boolean }) => !s.done).map((s: { id: string }) => s.id);
    const fini = d.statuses.find((s: { done: boolean }) => s.done).id;
    const [aFaire, enCours] = ouverts;
    d.meetings = d.meetings.filter((m: { date: string }) => !(m.date >= j.seance && m.date < j.auj));
    if (!d.meetings.some((m: { date: string }) => m.date >= j.auj)) d.meetings.push({ id: 'm-apres', titre: 'Comité suivant', date: j.plusTard, heure: '19:30', lieu: '' });
    const hier = `${j.hier}T10:00:00.000Z`;
    d.meetings.push({
      id: 'm-fige', titre: 'Comité figé', date: j.seance, heure: '19:30', lieu: '',
      minutes: { presents: [], excuses: [], notes: { 'task:f1': 'Devis demandé.' }, demarreLe: `${j.seance}T17:30:00.000Z`, journal: [{ taskId: 'f2', titre: 'Point modifié au PV', changes: ['statut : À faire → En cours'], at: hier }] },
    });
    const moi = d.people[0].id;
    const t = (id: string, titre: string, o: object) => ({ id, sectionId: d.sections[0].id, sousSection: '', titre, responsables: [moi], statusId: aFaire, delai: j.seance, meetingId: 'm-fige', remarque: '', checklist: [], createdBy: moi, updatedAt: `${j.seance}T12:00:00.000Z`, ...o });
    d.tasks.push(
      t('f1', 'Point fermé après la séance', { statusId: fini, termineeLe: j.avantHier, updatedAt: `${j.avantHier}T12:00:00.000Z` }),
      t('f2', 'Point modifié au PV', { statusId: enCours, updatedAt: hier }),
      t('f3', 'Point inchangé', {}),
    );
    localStorage.setItem(k, JSON.stringify(d));
    const creee = { le: `${j.avantSeance}T09:00:00.000Z`, par: 'x', nom: 'Julien Moreau', quoi: 'creee', champs: {} };
    localStorage.setItem('taches-gsa-demo-historique', JSON.stringify({ 'u-central': {
      f1: [{ le: `${j.avantHier}T12:00:00.000Z`, par: 'lea', nom: 'Léa', champs: { statusId: [aFaire, fini] } }, creee],
      f2: [{ le: hier, par: 'x', nom: 'Julien Moreau', champs: { statusId: [aFaire, enCours] } }, creee],
      f3: [creee],
    } }));
    return { aFaire, enCours, fini };
  }, { k: cle, j: { seance: dansJours(-5), avantSeance: dansJours(-8), avantHier: dansJours(-2), hier: dansJours(-1), auj: dansJours(0), plusTard: dansJours(20) } });
  await page.reload();

  await allerA(page, '/pv?seance=m-fige');
  await expect(page.locator('.pv-fige')).toContainText('tels qu’à la fin de la séance');
  const statut = (titre: string) => page.getByLabel(`Statut de ${titre}`);
  // Fermé ailleurs après la séance : « à faire », comme à la fin de la séance ; la tâche, elle, reste terminée.
  await expect(statut('Point fermé après la séance')).toHaveValue(ids.aFaire);
  await expect(page.locator('.min-task', { hasText: 'Point fermé après la séance' })).not.toHaveClass(/\bdone\b/);
  // Changé depuis le PV après la séance : gardé.
  await expect(statut('Point modifié au PV')).toHaveValue(ids.enCours);
  await expect(statut('Point inchangé')).toHaveValue(ids.aFaire);
  const lire = () => page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const m = d.meetings.find((x: { id: string }) => x.id === 'm-fige').minutes;
    return { fige: m.etats?.f1?.statusId, reel: d.tasks.find((x: { id: string }) => x.id === 'f1').statusId, journal: m.journal.map((x: { changes: string[] }) => x.changes.join()) };
  }, cle);
  await expect.poll(async () => (await lire()).fige).toBe(ids.aFaire);
  expect((await lire()).reel).toBe(ids.fini);

  // Changé dans le PV repris : la tâche et le PV suivent, le journal part de ce que montrait le PV.
  await statut('Point fermé après la séance').selectOption(ids.enCours);
  await expect.poll(async () => (await lire()).fige).toBe(ids.enCours);
  expect((await lire()).reel).toBe(ids.enCours);
  expect((await lire()).journal.at(-1)).toMatch(/^statut : .+ → .+$/);
  expect((await lire()).journal.at(-1)).not.toContain('Terminé →');

  // Rechargé : toujours figé (gardé dans le PV).
  await page.reload();
  await allerA(page, '/pv?seance=m-fige');
  await expect(statut('Point modifié au PV')).toHaveValue(ids.enCours);
  await expect(statut('Point fermé après la séance')).toHaveValue(ids.enCours);
});

test('PV : la note de la section à sa fin ; la pilule va d’un point à l’autre, puis dans la note de la section', async ({ page }) => {
  // Prochaine séance : trois points dans une section (le dernier dans une sous-section), deux dans la suivante ; une
  // note de section et une note de point déjà écrites.
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  const noms = await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const ouvert = d.statuses.find((s: { done: boolean }) => !s.done).id;
    let s1 = d.meetings.filter((m: { date: string }) => m.date >= j[0]).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))[0];
    if (!s1) d.meetings.push((s1 = { id: 'm-test', titre: 'Comité test', date: j[1], heure: '19:30', lieu: '' }));
    const i = d.sections.findIndex((s: { sousSections: string[] }) => s.sousSections.length >= 1);
    const [sec, sec2] = [d.sections[i], d.sections[i + 1]];
    const moi = d.people[0].id;
    const t = (id: string, titre: string, o: object = {}) => ({ id, sectionId: sec.id, sousSection: '', titre, responsables: [moi], statusId: ouvert, delai: j[0], meetingId: s1.id, remarque: '', checklist: [], createdBy: moi, updatedAt: new Date().toISOString(), ...o });
    d.tasks.push(t('p1', 'Premier point'), t('p2', 'Deuxième point'), t('p3', 'Point de sous-section', { sousSection: sec.sousSections[0] }), t('p4', 'Point A de la suivante', { sectionId: sec2.id }), t('p5', 'Point B de la suivante', { sectionId: sec2.id }));
    s1.minutes = { presents: [], excuses: [], notes: { [`sec:${sec.id}`]: 'Conclusion de la section.', 'task:p1': 'Décision sur le premier.' } };
    localStorage.setItem(k, JSON.stringify(d));
    return { sec: sec.nom, sec2: sec2.nom, seance: s1.id };
  }, { k: cle, j: [dansJours(0), dansJours(20)] });
  await page.reload();
  await allerA(page, `/pv?seance=${noms.seance}`);

  // Prise de notes : les points, puis la note de la section.
  const section = page.locator('.min-agenda > .min-section', { has: page.locator('h3', { hasText: noms.sec }) });
  await expect(section.locator('[data-point]')).toHaveCount(4);
  expect(await section.locator('[data-point]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.point))).toEqual([
    'Premier point',
    'Deuxième point',
    'Point de sous-section',
    `Notes de « ${noms.sec} »`,
  ]);
  const noteSection = section.locator('.min-note-sec .note-riche');
  await expect(noteSection).toHaveText('Conclusion de la section.');

  // Pilule : d'un point à l'autre (le survol dit lequel), puis dans la note de la section, puis la section suivante.
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  const suivant = pilule.getByRole('button', { name: /^Point suivant/ });
  const precedent = pilule.getByRole('button', { name: /^Point précédent/ });
  await section.evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 200 }));
  for (const nom of ['Premier point', 'Deuxième point', 'Point de sous-section']) {
    await expect(suivant).toHaveAttribute('title', `Point suivant : ${nom}`);
    await suivant.click();
    await expect(pilule.locator('.pilule-titre')).toContainText(noms.sec);
  }
  await expect(suivant).toHaveAttribute('title', `Point suivant : Notes de « ${noms.sec} »`);
  await suivant.click();
  // Dans la note : le curseur à la fin de ce qu'elle contient, on écrit à la suite.
  await expect(noteSection).toBeFocused();
  await page.keyboard.type(' Suite.');
  await expect(noteSection).toHaveText('Conclusion de la section. Suite.');
  await expect(suivant).toHaveAttribute('title', 'Point suivant : Point A de la suivante');
  await suivant.click();
  await expect(noteSection).not.toBeFocused();
  await expect(pilule.locator('.pilule-titre')).toContainText(noms.sec2);
  // En arrière : la note de la section d'avant, de nouveau prête à écrire.
  await expect(precedent).toHaveAttribute('title', `Point précédent : Notes de « ${noms.sec} »`);
  await precedent.click();
  await expect(noteSection).toBeFocused();
  await expect(pilule.locator('.pilule-titre')).toContainText(noms.sec);

  // Document du PV : la note de la section après ses points, enregistrée avec la suite écrite.
  await page.locator('.seg button', { hasText: /^\s*PV$/ }).click();
  const li = page.locator('.pv-sheet ol.odj > li', { has: page.locator('.odj-sec', { hasText: noms.sec }) });
  await expect(li.locator(':scope > .min-pv-note-sec')).toHaveText('Conclusion de la section. Suite.');
  expect(await li.evaluate((e) => [...e.children].map((c) => c.className))).toEqual(['odj-sec', 'odj-l1', 'min-pv-note min-pv-note-sec']);
});

test('fichiers joints : ouverts dans la visionneuse de l’appli (fiche, ordre du jour), jamais dans un nouvel onglet', async ({ page }) => {
  // Sur téléphone, surtout dans l'appli installée, un onglet ouvert après le téléchargement du fichier est souvent
  // bloqué ou reste vide, sans message : la photo et les pages du PDF s'affichent dans l'appli.
  const onglets: string[] = [];
  page.context().on('page', (p) => onglets.push(p.url()));
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++) pdf.addPage([595, 842]);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Tâche avec fichiers à ouvrir');
  await fiche.getByRole('button', { name: /Document/ }).first().click();
  await fiche.locator('fieldset.docs input[type=file]').first().setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: png },
    { name: 'devis.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) },
    { name: 'budget.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK') },
  ]);
  await expect(fiche.locator('.doc-list li')).toHaveCount(3);

  const visionneuse = page.locator('.modal.visionneuse');
  // Photo : affichée en grand.
  await fiche.locator('.doc-name', { hasText: 'photo.png' }).click();
  await expect(visionneuse.locator('.visionneuse-image img')).toBeVisible();
  await expect(visionneuse).toContainText('photo.png');
  await visionneuse.locator('.modal-foot').getByRole('button', { name: 'Fermer' }).click();
  await expect(visionneuse).toHaveCount(0);
  // PDF : ses pages.
  await fiche.locator('.doc-name', { hasText: 'devis.pdf' }).click();
  await expect(visionneuse.locator('img.pdf-page')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(visionneuse).toHaveCount(0);
  await expect(fiche).toBeVisible(); // Échap ne ferme que la visionneuse
  // Autre type : pas d'aperçu, téléchargé pendant le clic.
  await fiche.locator('.doc-name', { hasText: 'budget.docx' }).click();
  await expect(visionneuse).toContainText('Pas d’aperçu');
  const telechargement = page.waitForEvent('download');
  await visionneuse.getByRole('button', { name: /Télécharger/ }).click();
  expect((await telechargement).suggestedFilename()).toBe('budget.docx');
  await visionneuse.locator('.modal-foot').getByRole('button', { name: 'Fermer' }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Ordre du jour : le nom du fichier sous le point s'ouvre aussi dans la visionneuse.
  await page.goto('./?demo#/ordre-du-jour');
  const nom = page.locator('.pv-sheet [data-doc]', { hasText: 'photo.png' }).first();
  await expect(nom).toBeVisible();
  await nom.click();
  await expect(visionneuse.locator('.visionneuse-image img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(visionneuse).toHaveCount(0);
  expect(onglets).toEqual([]);
});

test('PV en projection : les pièces jointes du point en cours à côté des notes (point où l’on écrit, sinon en haut)', async ({ page }) => {
  // PV diffusé sur un beamer : on voit de quoi on parle. Un point avec une photo et un PDF, un autre sans pièce jointe.
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 2; i++) pdf.addPage([595, 842]);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.goto('./?demo#/taches');
  let fiche = await nouvelleTache(page, 'Point avec pièces jointes');
  await fiche.getByRole('button', { name: /Document/ }).first().click();
  await fiche.locator('fieldset.docs input[type=file]').first().setInputFiles([
    { name: 'plan.png', mimeType: 'image/png', buffer: png },
    { name: 'devis.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) },
  ]);
  await expect(fiche.locator('.doc-list li')).toHaveCount(2);
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  fiche = await nouvelleTache(page, 'Point sans pièce jointe');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await allerA(page, '/pv');
  const panneau = page.getByRole('region', { name: 'Pièces jointes du point en cours' });
  await expect(panneau).toHaveCount(0);
  const projeter = page.getByRole('button', { name: 'Projection', exact: true });
  await projeter.click();
  await expect(projeter).toHaveAttribute('aria-pressed', 'true');
  await expect(panneau).toBeVisible();
  await expect(panneau.locator('h2')).toHaveText('Séance et présences');
  await expect(page.locator('.min-suivi')).toBeHidden();

  // Curseur dans le point (ici son statut) : sa photo en grand, le choix de ses deux pièces jointes.
  const avec = page.locator('.min-task[data-point="Point avec pièces jointes"]');
  const sans = page.locator('.min-task[data-point="Point sans pièce jointe"]');
  await avec.locator('select.min-status').focus();
  await expect(panneau.locator('h2')).toHaveText('Point avec pièces jointes');
  await expect(panneau.locator('.visionneuse-image img')).toBeVisible();
  await panneau.getByRole('button', { name: /devis\.pdf/ }).click();
  await expect(panneau.locator('img.pdf-page')).toHaveCount(2);
  // « Agrandir » : la visionneuse de l'appli.
  await panneau.getByRole('button', { name: /Agrandir/ }).click();
  await expect(page.locator('.modal.visionneuse img.pdf-page')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal.visionneuse')).toHaveCount(0);

  // Un point sans pièce jointe n'en montre aucune ; en revenant, le PDF choisi.
  await sans.locator('select.min-status').focus();
  await expect(panneau.locator('h2')).toHaveText('Point sans pièce jointe');
  await expect(panneau).toContainText('Pas de pièce jointe pour ce point.');
  await expect(panneau.locator('img')).toHaveCount(0);
  await avec.locator('select.min-status').focus();
  await expect(panneau.locator('img.pdf-page')).toHaveCount(2);

  // La pilule fait défiler : le point en haut de l'écran, où elle mène (le curseur laissé dans un point ne compte plus).
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  const suivant = pilule.getByRole('button', { name: /^Point suivant/ });
  const precedent = pilule.getByRole('button', { name: /^Point précédent/ });
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  for (let i = 0; i < 40 && (await panneau.locator('h2').textContent()) !== 'Point avec pièces jointes'; i++) {
    const vers = (await suivant.getAttribute('title'))!.replace('Point suivant : ', '');
    await suivant.click();
    await expect(panneau.locator('h2')).toHaveText(vers);
  }
  await expect(panneau.locator('img.pdf-page')).toHaveCount(2);
  const versSans = (await suivant.getAttribute('title'))!.endsWith('Point sans pièce jointe') ? suivant : precedent;
  await versSans.click();
  await expect(panneau.locator('h2')).toHaveText('Point sans pièce jointe');
  await expect(panneau).toContainText('Pas de pièce jointe pour ce point.');

  // Aussi dans la pilule (icône du projecteur) : enfoncée, elle l'arrête ; re-clic, elle reprend.
  const projecteur = pilule.getByRole('button', { name: /^Projection/ });
  await expect(projecteur).toHaveAttribute('aria-pressed', 'true');
  await projecteur.click();
  await expect(panneau).toHaveCount(0);
  await expect(projeter).toHaveAttribute('aria-pressed', 'false');
  await projecteur.click();
  await expect(panneau).toBeVisible();
  await expect(projecteur).toHaveAttribute('aria-pressed', 'true');

  // Retenu sur l'appareil.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Projection', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panneau).toBeVisible();
  await page.getByRole('button', { name: 'Projection', exact: true }).click();
  await expect(panneau).toHaveCount(0);
  await expect(page.locator('.min-suivi')).toBeVisible();
});

test('PV : un appui sur le titre d’un point ouvre sa fiche du PV ; « Qui s’en occupe ? » sous le statut', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Point à ouvrir depuis le PV');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await allerA(page, '/pv');
  const point = page.locator('.min-task[data-point="Point à ouvrir depuis le PV"]');
  await expect(point).toBeVisible();
  await expect(point.getByRole('button', { name: 'Modifier le point' })).toHaveCount(0);
  await point.getByRole('button', { name: 'Point à ouvrir depuis le PV' }).click();
  const fichePv = page.getByRole('dialog', { name: 'Fiche du PV : Point à ouvrir depuis le PV' });
  await expect(fichePv.getByPlaceholder('Que faut-il faire ou savoir ?')).toHaveValue('Point à ouvrir depuis le PV');
  // Plus de lien vers la fiche complète.
  await expect(fichePv.getByRole('button', { name: 'Fiche complète' })).toHaveCount(0);
  // « Qui s'en occupe ? » sous le statut, « Pour quand ? » à côté.
  const statut = (await fichePv.locator('label.statut-choix').boundingBox())!;
  const qui = (await fichePv.locator('.qui').boundingBox())!;
  const quand = (await fichePv.locator('.delai-field').boundingBox())!;
  expect(qui.y).toBeGreaterThan(statut.y + statut.height - 1);
  expect(Math.abs(qui.x - statut.x)).toBeLessThan(2);
  expect(quand.x).toBeGreaterThan(statut.x + statut.width);
  expect(Math.abs(quand.y - statut.y)).toBeLessThan(2);
  // Échap : retour à la prise de notes.
  await page.keyboard.press('Escape');
  await expect(fichePv).toHaveCount(0);
});

test('ordre du jour : un point supprimé n’apparaît plus, ni dans le PV ; le point est gardé, puis remis', async ({ page }) => {
  const supprime = 'Point à supprimer de l’ordre du jour';
  const garde = 'Point gardé à l’ordre du jour';
  await page.goto('./?demo#/taches');
  for (const titre of [supprime, garde]) {
    const fiche = await nouvelleTache(page, titre);
    await fiche.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }

  await allerA(page, '/ordre-du-jour');
  const feuille = page.locator('.pv-sheet');
  const point = feuille.locator('.odj-task', { hasText: supprime });
  await expect(point).toBeVisible();
  await point.hover();
  await feuille.getByRole('button', { name: `Supprimer « ${supprime} » de l’ordre du jour` }).click();
  await expect(point).toHaveCount(0);
  await expect(feuille.locator('.odj-task', { hasText: garde })).toBeVisible();
  await expect(page.locator('.pv-msg')).toContainText('il n’apparaîtra pas dans le PV');

  // L'archive (comme l'impression et le PDF) n'a pas les boutons de l'écran.
  await page.getByRole('button', { name: /Archiver dans la séance/ }).click();
  const archives = () =>
    page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).meetings.flatMap((m: { pvArchives?: { html: string }[] }) => (m.pvArchives ?? []).map((a) => a.html))));
  await expect.poll(archives).toContain(garde);
  expect(await archives()).not.toContain('odj-retirer');
  expect(await archives()).not.toContain(supprime);

  // PV : le point supprimé n'y est pas, les autres oui.
  await allerA(page, '/pv');
  await expect(page.locator(`.min-task[data-point="${garde}"]`)).toBeVisible();
  await expect(page.locator(`.min-task[data-point="${supprime}"]`)).toHaveCount(0);

  // Le point lui-même est gardé.
  await allerA(page, '/taches');
  await expect(page.locator('main').getByText(supprime).filter({ visible: true }).first()).toBeVisible();

  // Remis à l'ordre du jour : de nouveau là, et dans le PV.
  await allerA(page, '/ordre-du-jour');
  const retires = page.locator('.pv-settings details.odj-retires');
  await retires.locator('summary').click();
  await expect(retires).toContainText(supprime);
  await retires.getByRole('button', { name: `Remettre « ${supprime} » à l’ordre du jour` }).click();
  await expect(point).toBeVisible();
  await expect(retires).toHaveCount(0);
  await allerA(page, '/pv');
  await expect(page.locator(`.min-task[data-point="${supprime}"]`)).toBeVisible();
});

test('console admin : trier les sections ; l’ordre du jour suit, gardé après un rechargement', async ({ page }) => {
  await allerA(page, '/admin/taches');
  const noms = () => page.locator('main input[aria-label^="Nom de la section "]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  await expect(page.locator('main input[aria-label^="Nom de la section "]').first()).toBeVisible();
  const avant = await noms();
  expect(avant.length).toBeGreaterThan(3);
  const [premiere, deuxieme] = avant;
  const derniere = avant[avant.length - 1];
  await expect(page.getByRole('button', { name: `Monter la section ${premiere}` })).toBeDisabled();
  await expect(page.getByRole('button', { name: `Descendre la section ${derniere}` })).toBeDisabled();

  await page.getByRole('button', { name: `Descendre la section ${premiere}` }).click();
  await page.getByRole('button', { name: `Monter la section ${derniere}` }).click();
  const apres = [deuxieme, premiere, ...avant.slice(2, -2), derniere, avant[avant.length - 2]];
  await expect.poll(noms).toEqual(apres);

  // Ordre du jour (sections sans point comprises) : le même ordre.
  await allerA(page, '/ordre-du-jour');
  await expect(page.locator('.pv-sheet .odj-sec').first()).toHaveText(deuxieme);
  expect(await page.locator('.pv-sheet .odj-sec').allTextContents()).toEqual(apres);

  await page.reload();
  await allerA(page, '/admin/taches');
  await expect(page.locator('main input[aria-label^="Nom de la section "]').first()).toHaveValue(deuxieme);
  expect(await noms()).toEqual(apres);
});

test('étiquette déjà créée : sa couleur retouchée à partir de l’actuelle, son icône changée deux fois', async ({ page }) => {
  const etiquette = () => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).etiquettes.find((e: { id: string }) => e.id === 'et-u-competition'));
  const depart = (await etiquette()).couleur;
  expect(depart).toBe('#ea580c');
  await allerA(page, '/etiquettes');
  const ligne = page.locator('.groupe-section', { has: page.getByLabel('Groupe : la section Groupe compétition est une étiquette') });

  // Les curseurs partent de la couleur actuelle (pas de zéro).
  await ligne.getByRole('button', { name: 'Changer la couleur (Groupe compétition)' }).click();
  const choix = ligne.getByRole('group', { name: 'Couleur de l’étiquette Groupe compétition' });
  await expect(choix.getByLabel('Teinte')).toHaveValue('21');
  await expect(choix.getByLabel('Saturation')).toHaveValue('90');
  await expect(choix.getByLabel('Luminosité')).toHaveValue('48');
  await expect(choix.getByLabel('Code de la couleur de Groupe compétition')).toHaveValue('#ea580c');

  // Un peu plus foncée : même teinte, enregistrée une fois le curseur lâché.
  await choix.getByLabel('Luminosité').fill('40');
  await expect(choix.getByLabel('Teinte')).toHaveValue('21');
  const foncee = await choix.getByLabel('Code de la couleur de Groupe compétition').inputValue();
  expect(foncee).not.toBe(depart);
  await expect.poll(async () => (await etiquette()).couleur).toBe(foncee);
  await expect(choix).toContainText(`avant : ${depart}`);
  await choix.getByRole('button', { name: /Revenir à la couleur d’avant/ }).click();
  await expect.poll(async () => (await etiquette()).couleur).toBe(depart);
  await choix.getByLabel('Code de la couleur de Groupe compétition').fill('#0f766e');
  await choix.getByRole('button', { name: 'OK' }).click();
  await expect(choix).toHaveCount(0);
  await expect.poll(async () => (await etiquette()).couleur).toBe('#0f766e');
  // Rouvert : les curseurs partent de la nouvelle couleur.
  await ligne.getByRole('button', { name: 'Changer la couleur (Groupe compétition)' }).click();
  await expect(choix.getByLabel('Code de la couleur de Groupe compétition')).toHaveValue('#0f766e');
  await expect(choix.getByLabel('Teinte')).not.toHaveValue('0');
  await choix.getByRole('button', { name: 'OK' }).click();

  // Un clic sur l'étiquette ouvre la bibliothèque d'icônes ; une deuxième fois, pour en changer.
  for (const [cherche, nom, cle] of [['vtt', 'VTT', 'vtt'], ['course', 'Course à pied', 'course']]) {
    await ligne.getByRole('button', { name: 'Changer l’icône (Groupe compétition)' }).click();
    await ligne.getByLabel('Chercher une icône').fill(cherche);
    await ligne.getByRole('radio', { name: nom, exact: true }).click();
    await expect.poll(async () => (await etiquette()).icone).toBe(cle);
    await expect(ligne.getByLabel('Chercher une icône')).toHaveCount(0);
  }
});

test('copier un événement à venir : la copie à la date choisie, avec ses points à faire, délais décalés', async ({ page }) => {
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  // Course de côte dans 30 jours (deux jours) ; un point lié, 7 jours avant, commencé, checklist cochée.
  await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const moi = d.people[0].id;
    const enCours = d.statuses.filter((s: { done: boolean }) => !s.done)[1].id;
    d.events.push({ id: 'e-cote', nom: 'Course de côte', date: j.date, dateFin: j.fin, lieu: 'Fontenais', description: '' });
    d.tasks.push({
      id: 't-cote', sectionId: d.sections[0].id, sousSection: '', titre: 'Réserver la route', responsables: [moi], statusId: enCours, delai: j.avant, eventId: 'e-cote',
      delaiRef: { type: 'event', joursAvant: 7, unite: 'jours' }, remarque: '', checklist: [{ id: 'c1', label: 'Demande à la commune', done: true }], createdBy: moi, updatedAt: new Date().toISOString(),
    });
    localStorage.setItem(k, JSON.stringify(d));
  }, { k: cle, j: { date: dansJours(30), fin: dansJours(31), avant: dansJours(23) } });
  await page.goto('./?demo#/evenements');
  await page.reload();

  const carte = page.locator('main .agenda').first().locator('.agenda-item', { hasText: 'Course de côte' });
  await expect(carte.getByRole('button', { name: 'Reprendre' })).toHaveCount(0);
  await carte.getByRole('button', { name: 'Copier' }).click();
  const copie = page.getByRole('dialog', { name: 'Copier « Course de côte »' });
  await expect(copie.getByLabel('Premier jour')).toHaveValue('');
  await copie.getByLabel('Premier jour').fill(dansJours(60));
  await expect(copie.getByLabel('Dernier jour')).toHaveValue(dansJours(61));
  await copie.getByLabel('Nom', { exact: true }).fill('Course de côte (manche 2)');
  const ligne = copie.locator('.anciennes-liste li', { hasText: 'Réserver la route' });
  await expect(ligne.locator('input')).toBeChecked();
  await expect(ligne).toContainText('(7 jours avant)');
  await copie.getByRole('button', { name: 'Copier avec 1 point' }).click();

  // La copie du point : à faire, 7 jours avant la nouvelle date, checklist décochée ; l'original n'a pas changé.
  await expect(page).toHaveURL(/#\/taches\?event=/);
  const donnees = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), cle);
  const ev = donnees.events.find((x: { nom: string }) => x.nom === 'Course de côte (manche 2)');
  expect(ev).toMatchObject({ date: dansJours(60), dateFin: dansJours(61), lieu: 'Fontenais', repriseDe: 'e-cote' });
  const points = donnees.tasks.filter((x: { titre: string }) => x.titre === 'Réserver la route');
  expect(points).toHaveLength(2);
  const nouveau = points.find((x: { id: string }) => x.id !== 't-cote');
  const ouvert = donnees.statuses.find((s: { done: boolean }) => !s.done).id;
  expect(nouveau).toMatchObject({ eventId: ev.id, delai: dansJours(53), statusId: ouvert, checklist: [{ label: 'Demande à la commune', done: false }] });
  expect(points.find((x: { id: string }) => x.id === 't-cote')).toMatchObject({ eventId: 'e-cote', delai: dansJours(23) });

  await page.goto('./?demo#/evenements');
  await expect(page.locator('.agenda-item', { hasText: 'Course de côte' }).first().locator('.reprise')).toContainText('Copie : Course de côte (manche 2)');
});

const champSection = (fiche: ReturnType<Page['locator']>) => fiche.locator('label', { hasText: /^\s*Section/ }).locator('select').first();
const champSousSection = (fiche: ReturnType<Page['locator']>) => fiche.locator('label', { hasText: /^\s*Sous-section/ }).locator('select').first();
const lireDonnees = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!));

test('événement passé : à part dans les listes ; son étiquette reste sur ses points, mais n’est plus proposée', async ({ page }) => {
  await evenementEtiquete(page, 'Tournoi de printemps', dansJours(-20), []);
  await evenementEtiquete(page, 'Tournoi d’automne', dansJours(30), []);

  // Un point rangé dans la sous-section de l'événement passé : elle est proposée à part ; il en porte l'étiquette.
  const fiche = await nouvelleTache(page, 'Envoyer les remerciements');
  await champSection(fiche).selectOption({ label: 'Événements' });
  await expect(champSousSection(fiche).locator('optgroup[label="Événements passés"] option', { hasText: 'Tournoi de printemps' })).toHaveCount(1);
  await expect(champSousSection(fiche).locator('optgroup option', { hasText: 'Tournoi d’automne' })).toHaveCount(0);
  await expect(champSousSection(fiche).locator('option', { hasText: 'Tournoi d’automne' })).toHaveCount(1);
  await champSousSection(fiche).selectOption('Tournoi de printemps');
  const chips = fiche.locator('.etiquettes-choix');
  await expect(chips.getByRole('button', { name: /Tournoi de printemps/ })).toHaveAttribute('aria-pressed', 'true');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Un autre point : l'étiquette de l'événement passé n'est plus proposée ; celle de l'événement à venir, oui.
  const autre = await nouvelleTache(page, 'Préparer le budget');
  await expect(autre.locator('.etiquettes-choix').getByRole('button', { name: /Tournoi de printemps/ })).toHaveCount(0);
  await expect(autre.locator('.etiquettes-choix').getByRole('button', { name: /Tournoi d’automne/ })).toHaveCount(1);
  await autre.getByRole('button', { name: 'Fermer' }).first().click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Agenda › Événements : ceux à venir en haut, le passé replié dans « Événements passés ».
  await allerA(page, '/evenements');
  const aVenir = page.locator('main .agenda').first();
  await expect(aVenir.locator('.agenda-item', { hasText: 'Tournoi d’automne' })).toHaveCount(1);
  await expect(aVenir.locator('.agenda-item', { hasText: 'Tournoi de printemps' })).toHaveCount(0);
  const passes = page.locator('details.evenements-passes');
  await expect(passes.locator('summary')).toContainText('Événements passés');
  await expect(passes.locator('.agenda-item', { hasText: 'Tournoi de printemps' })).toBeHidden();
  await passes.locator('summary').click();
  await expect(passes.locator('.agenda-item', { hasText: 'Tournoi de printemps' })).toBeVisible();

  // Filtre « Étiquette » des points : l'événement passé à part.
  await allerA(page, '/taches');
  await page.getByRole('button', { name: /^Filtres/ }).click();
  const filtre = page.getByLabel('Étiquette', { exact: true });
  await expect(filtre.locator('optgroup[label="Événements passés"] option', { hasText: 'Tournoi de printemps' })).toHaveCount(1);
  await expect(filtre.locator('optgroup option', { hasText: 'Tournoi d’automne' })).toHaveCount(0);
  await filtre.selectOption({ label: 'Tournoi de printemps' });
  await page.getByRole('button', { name: 'Tous', exact: true }).click();
  await expect(page.locator('main tr', { hasText: 'Envoyer les remerciements' })).toHaveCount(1);

  // Club › Étiquettes : parmi les événements passés, avec ce qui reste à faire.
  await allerA(page, '/etiquettes');
  await expect(page.getByLabel('Étiquette de l’événement Tournoi d’automne')).toBeChecked();
  await expect(page.getByLabel('Étiquette de l’événement Tournoi de printemps')).toHaveCount(0);
  await page.getByRole('button', { name: /Voir les événements passés/ }).click();
  await expect(page.locator('.etiquettes-passees-aide')).toContainText('L’étiquette d’un événement passé');
  const ligne = page.locator('.etiquettes-passees .groupe-section', { has: page.getByLabel('Étiquette de l’événement Tournoi de printemps') });
  await expect(ligne.getByLabel('Étiquette de l’événement Tournoi de printemps')).toBeChecked();
  await expect(ligne).toContainText('passé · 1 point pas terminé');
});

test('chronologie d’un événement : ses points dans le temps ; en placer un, en planifier un autre', async ({ page }) => {
  await evenementEtiquete(page, 'Tournoi d’automne', dansJours(40), []);
  // Un point de l'événement, sans délai.
  const fiche = await nouvelleTache(page, 'Trouver des bénévoles');
  await champSection(fiche).selectOption({ label: 'Événements' });
  await champSousSection(fiche).selectOption('Tournoi d’automne');
  await fiche.getByRole('button', { name: '✕ Aucun délai' }).click();
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  // Un clic sur le nom de l'événement : sa chronologie, avec aujourd'hui et le jour J.
  await allerA(page, '/evenements');
  await page.locator('.agenda-item').getByRole('button', { name: 'Tournoi d’automne' }).click();
  const chrono = page.getByRole('dialog', { name: 'Chronologie · Tournoi d’automne' });
  await expect(chrono.locator('.chrono-jourj')).toContainText('Tournoi d’automne');
  await expect(chrono.locator('.chrono-aujourdhui')).toContainText('J-40');

  // Le point sans délai est « à placer » : 3 semaines avant l'événement.
  const sans = chrono.locator('.chrono-sans-delai');
  await expect(sans).toContainText('Trouver des bénévoles');
  await sans.getByRole('button', { name: /Placer/ }).click();
  const placer = chrono.getByRole('group', { name: 'Placer « Trouver des bénévoles »' });
  await placer.getByLabel('Combien').fill('3');
  await placer.getByLabel('Unité').selectOption('semaines');
  await placer.getByRole('button', { name: 'OK' }).click();
  await expect(chrono.locator('.chrono-sans-delai')).toHaveCount(0);
  const benevoles = chrono.locator('.chrono-frise .chrono-point', { hasText: 'Trouver des bénévoles' });
  await expect(benevoles).toContainText('J-21');
  await expect(benevoles).toContainText('3 semaines avant');
  const tache = async (titre: string) => (await lireDonnees(page)).tasks.find((t: { titre: string }) => t.titre === titre);
  const ev = (await lireDonnees(page)).events.find((e: { nom: string }) => e.nom === 'Tournoi d’automne');
  await expect.poll(async () => (await tache('Trouver des bénévoles'))?.delai).toBe(dansJours(19));
  expect(await tache('Trouver des bénévoles')).toMatchObject({ eventId: ev.id, delaiRef: { type: 'event', joursAvant: 21, unite: 'semaines' } });

  // Planifier un point, la veille : sa fiche s'ouvre préremplie, rangée chez l'événement.
  await chrono.getByLabel('Point à planifier').fill('Acheter les prix');
  await chrono.getByRole('button', { name: 'La veille' }).click();
  await chrono.getByRole('button', { name: 'Ajouter…', exact: true }).click();
  const nouveau = page.getByRole('dialog', { name: 'Nouveau point' });
  await expect(nouveau.getByPlaceholder('Que faut-il faire ou savoir ?')).toHaveValue('Acheter les prix');
  await expect(champSousSection(nouveau)).toHaveValue('Tournoi d’automne');
  await nouveau.getByRole('button', { name: /^Créer$/ }).click();
  await expect(nouveau).toHaveCount(0);
  await expect(chrono.locator('.chrono-frise .chrono-point', { hasText: 'Acheter les prix' })).toContainText('J-1');
  await expect.poll(async () => (await tache('Acheter les prix'))?.delai).toBe(dansJours(39));
  expect((await tache('Acheter les prix')).delaiRef).toMatchObject({ type: 'event', joursAvant: 1 });

  // Dans l'ordre : aujourd'hui, J-21, J-1, puis le jour J.
  const ordre = await chrono.locator('.chrono-frise > li.chrono-ligne').allTextContents();
  const rang = (x: string) => ordre.findIndex((l) => l.includes(x));
  expect(rang('Aujourd’hui')).toBeLessThan(rang('Trouver des bénévoles'));
  expect(rang('Trouver des bénévoles')).toBeLessThan(rang('Acheter les prix'));
  expect(rang('Acheter les prix')).toBeLessThan(rang('Jour J'));
  await expect(chrono.locator('.chrono-tete')).toContainText('0/2 points terminés');
});

test('reprendre un événement passé étiqueté : la nouvelle édition a sa propre étiquette, et les points recopiés vont chez elle', async ({ page }) => {
  await evenementEtiquete(page, 'Marché d’été 2026', dansJours(-30), ['Émilie Rossi']);
  // Un point rangé dans sa sous-section (il porte son étiquette, sans être rattaché à l'événement).
  const fiche = await nouvelleTache(page, 'Réserver les stands');
  await champSection(fiche).selectOption({ label: 'Événements' });
  await champSousSection(fiche).selectOption('Marché d’été 2026');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  await allerA(page, '/evenements');
  await page.locator('details.evenements-passes summary').click();
  await page.locator('.agenda-item', { hasText: 'Marché d’été 2026' }).getByRole('button', { name: 'Reprendre' }).click();
  const reprise = page.getByRole('dialog', { name: 'Reprendre « Marché d’été 2026 »' });
  await reprise.getByLabel('Nom', { exact: true }).fill('Marché d’été 2027');
  const etiquette = reprise.locator('.reprise-etiquette');
  await expect(etiquette.getByRole('checkbox')).toBeChecked();
  await expect(etiquette).toContainText('les mêmes membres (1)');
  await expect(reprise.locator('.anciennes-liste li', { hasText: 'Réserver les stands' }).locator('input')).toBeChecked();
  await reprise.getByRole('button', { name: 'Reprendre avec 1 point' }).click();
  await expect(page).toHaveURL(/#\/taches\?event=/);

  // La nouvelle édition : son étiquette (mêmes membres, même couleur), sa sous-section ; la copie y est, avec elle seule.
  await expect.poll(async () => (await lireDonnees(page)).etiquettes.some((e: { nom: string }) => e.nom === 'Marché d’été 2027')).toBe(true);
  const d = await lireDonnees(page);
  const emilie = d.people.find((p: { prenom: string; nom: string }) => p.prenom === 'Émilie' && p.nom === 'Rossi').id;
  const ancienne = d.etiquettes.find((e: { nom: string }) => e.nom === 'Marché d’été 2026');
  const nouvelle = d.etiquettes.find((e: { nom: string }) => e.nom === 'Marché d’été 2027');
  const ev = d.events.find((e: { nom: string }) => e.nom === 'Marché d’été 2027');
  expect(nouvelle).toMatchObject({ eventId: ev.id, type: 'evenement', membres: [emilie], couleur: ancienne.couleur, lieux: [{ sousSection: 'Marché d’été 2027' }] });
  const points = d.tasks.filter((t: { titre: string }) => t.titre === 'Réserver les stands');
  expect(points).toHaveLength(2);
  const copie = points.find((t: { id: string; etiquettes?: string[] }) => t.etiquettes?.includes(nouvelle.id));
  const original = points.find((t: { id: string }) => t.id !== copie?.id);
  expect(copie).toMatchObject({ sousSection: 'Marché d’été 2027', etiquettes: [nouvelle.id] });
  expect(original).toMatchObject({ sousSection: 'Marché d’été 2026', etiquettes: [ancienne.id] });
});

test('ordre du jour : excusé avec motif et retard annoncé, repris dans le PV (motif, heure d’arrivée)', async ({ page }) => {
  await allerA(page, '/ordre-du-jour');
  const annonces = page.locator('.pv-settings details', { has: page.locator('summary', { hasText: 'Excusés et retards' }) });
  await annonces.locator('summary').click();
  await annonces.getByRole('button', { name: 'Julien Moreau : excusé(e)' }).click();
  await annonces.getByLabel('Motif de Julien Moreau').fill('Malade');
  await annonces.getByLabel('Motif de Julien Moreau').press('Enter');
  await annonces.getByRole('button', { name: 'Marc Lambert : en retard' }).click();
  await annonces.getByLabel('Arrivée prévue de Marc Lambert').fill('20:15');
  await annonces.getByLabel('Motif de Marc Lambert').fill('Train');
  await annonces.getByLabel('Motif de Marc Lambert').press('Enter');
  await expect(annonces.locator('summary')).toHaveText('Excusés et retards (2)');

  // Dans le document : la ligne des excusés avec le motif, celle des retards annoncés.
  const entete = page.locator('.pv-sheet .odj-head');
  await expect(entete).toContainText('Excusés : Julien Moreau (JM) – Malade');
  await expect(entete).toContainText('Retards annoncés : Marc Lambert (ML) – arrivée vers 20h15 – Train');

  // PV : l'excusé et son motif repris ; le retard annoncé rappelé, laissé de côté par « Tous présents ».
  await allerA(page, '/pv');
  const julien = page.locator('.min-person', { hasText: 'Julien Moreau' });
  const marc = page.locator('.min-person', { hasText: 'Marc Lambert' });
  await expect(julien.locator('button.on')).toHaveText('Excusé');
  await expect(julien.getByLabel('Motif de Julien Moreau')).toHaveValue('Malade');
  await expect(marc.locator('.min-annonce')).toContainText('Retard annoncé (arrivée vers 20h15) – Train');
  await page.getByRole('button', { name: 'Tous présents (sauf excusés et retards annoncés)' }).click();
  await expect(marc.locator('button.on')).toHaveCount(0);
  await expect(page.locator('.min-person', { hasText: 'Sophie Girard' }).locator('button.on')).toHaveText('Présent');
  // Arrivé : « Retard » (séance pas démarrée : l'heure annoncée), motif repris.
  await marc.getByRole('button', { name: 'Retard' }).click();
  await expect(marc.getByLabel('Arrivée de Marc Lambert')).toHaveValue('20:15');
  await expect(marc.getByLabel('Motif de Marc Lambert')).toHaveValue('Train');
  // Motif corrigé dans le PV : l'annonce de la séance suit.
  await julien.getByLabel('Motif de Julien Moreau').fill('Grippe');
  await julien.getByLabel('Motif de Julien Moreau').press('Enter');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).meetings.flatMap((m: { excuses?: { motif?: string }[] }) => (m.excuses ?? []).map((e) => e.motif))))
    .toEqual(['Grippe']);

  await page.getByRole('button', { name: /Voir le PV/ }).click();
  const pv = page.locator('.pv-sheet .odj-head');
  await expect(pv).toContainText('En retard : Marc Lambert (arrivée à 20h15 – Train)');
  await expect(pv).toContainText('Excusés : Julien Moreau (Grippe)');
  await expect(pv).toContainText(/Présents : .*Marc Lambert \(ML\)/);

  // Liste des séances : excusés et retards avec leur motif.
  await allerA(page, '/comite');
  const excuses = page.locator('.excuses').first();
  await expect(excuses).toContainText('Excusé : Julien Moreau (Grippe)');
  await expect(excuses).toContainText('En retard : Marc Lambert (vers 20h15 – Train)');
});

test('filtres des points : étiquette et événement aussi d’office (place, événement), tous les points depuis un lien, « Mes points » signalé', async ({ page }) => {
  // Points enregistrés sans leurs étiquettes d'office (d'avant le réglage, ou venus d'ailleurs) : la Soirée récréative
  // (sa sous-section, ou rattaché à l'événement), l'École de cyclisme (sa section) ; deux sont à une autre personne.
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const ouvert = d.statuses.find((s: { done: boolean }) => !s.done).id;
    const [moi, autre] = d.people.map((p: { id: string }) => p.id);
    const t = (id: string, titre: string, o: object) => ({ id, sousSection: '', titre, responsables: [autre], statusId: ouvert, delai: '', remarque: '', checklist: [], createdBy: autre, updatedAt: new Date().toISOString(), ...o });
    d.tasks.push(
      t('fs1', 'Réserver la salle', { sectionId: 'sec8', sousSection: 'Soirée récréative 28.11' }),
      t('fs2', 'Annoncer la soirée', { sectionId: 'sec1', eventId: 'e10', responsables: [moi] }),
      t('fs3', 'Commander les maillots', { sectionId: 'sec6' }),
      t('fs4', 'Renouveler l’assurance', { sectionId: 'sec1' }),
    );
    localStorage.setItem(k, JSON.stringify(d));
  }, cle);
  await page.reload();
  const nombre = page.locator('.page-head h1 .count');
  const filtre = (nom: string) => page.locator('.filters select').filter({ has: page.locator('option', { hasText: nom }) });

  // Lien vers les points d'une étiquette (carte de l'événement, recherche…) : tous ses points, pas seulement les miens.
  await page.goto('./?demo#/taches?etiquette=et-u-soiree');
  await expect(nombre).toHaveText('2');
  await expect(page.locator('main').getByText('Réserver la salle').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tous' })).toHaveClass(/on/);

  // Filtre « Événement » : les points rattachés et ceux rangés chez son étiquette ; l'événement est proposé.
  await page.getByRole('button', { name: /^Filtres/ }).click();
  await filtre('Toutes étiquettes').selectOption('');
  await filtre('Tous événements').selectOption({ label: 'Soirée récréative' });
  await expect(nombre).toHaveText('2');
  // Filtre « Étiquette » d'un groupe : les points de sa section.
  await filtre('Tous événements').selectOption('');
  await filtre('Toutes étiquettes').selectOption({ label: 'École de cyclisme' });
  await expect(nombre).toHaveText('1');
  await expect(page.locator('main').getByText('Commander les maillots').filter({ visible: true }).first()).toBeVisible();

  // « Mes points » filtrés : la page dit combien « Tous » en montre, et y mène.
  await page.getByRole('button', { name: 'Effacer' }).click();
  await page.getByRole('button', { name: 'Mes points' }).click();
  await filtre('Toutes sections').selectOption({ label: 'Administration' });
  await expect(nombre).toHaveText('1');
  const note = page.locator('.filtre-mes');
  await expect(note).toContainText('tes points seulement : 1 sur 2');
  await note.getByRole('button', { name: 'Voir les 2 points' }).click();
  await expect(nombre).toHaveText('2');
  await expect(note).toHaveCount(0);
});

test('PV repris après la séance : un sous-point s’affiche sous son point, rattaché depuis le PV ou ailleurs', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  // Séance il y a 5 jours, PV repris après coup (figé) : « Point figé » à son ordre du jour ; « Point à part », plus tard.
  await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const aFaire = d.statuses.filter((s: { done: boolean }) => !s.done)[0].id;
    d.meetings = d.meetings.filter((m: { date: string }) => !(m.date >= j.seance && m.date < j.auj));
    d.meetings.push({ id: 'm-fige', titre: 'Comité figé', date: j.seance, heure: '19:30', lieu: '', minutes: { presents: [], excuses: [], notes: {}, demarreLe: `${j.seance}T17:30:00.000Z` } });
    const moi = d.people[0].id;
    const t = (id: string, titre: string, delai: string) => ({ id, sectionId: d.sections[0].id, sousSection: '', titre, responsables: [moi], statusId: aFaire, delai, remarque: '', checklist: [], createdBy: moi, updatedAt: `${j.avant}T12:00:00.000Z` });
    // « Sous-point rattaché ailleurs » : rattaché à « Point figé » après la séance, sans passer par le PV ; « Sous-point
    // fini avant » : terminé avant la séance précédente (pas au PV).
    const fini = d.statuses.find((s: { done: boolean }) => s.done).id;
    d.tasks.push(
      t('f3', 'Point figé', j.seance), t('f4', 'Point à part', j.loin),
      { ...t('f5', 'Sous-point rattaché ailleurs', j.loin), parentId: 'f3', updatedAt: `${j.auj}T08:00:00.000Z` },
      { ...t('f6', 'Sous-point fini avant', j.vieux), parentId: 'f3', statusId: fini, termineeLe: j.vieux },
    );
    localStorage.setItem(k, JSON.stringify(d));
    const creee = { le: `${j.avant}T09:00:00.000Z`, par: 'x', nom: 'Julien Moreau', quoi: 'creee', champs: {} };
    localStorage.setItem('taches-gsa-demo-historique', JSON.stringify({ 'u-central': { f3: [creee], f4: [creee], f5: [{ ...creee, le: `${j.auj}T08:00:00.000Z` }], f6: [creee] } }));
  }, { k: cle, j: { seance: dansJours(-5), avant: dansJours(-8), auj: dansJours(0), loin: dansJours(200), vieux: dansJours(-400) } });
  await page.reload();
  await allerA(page, '/pv?seance=m-fige');
  await expect(page.locator('.pv-fige')).toContainText('tels qu’à la fin de la séance');
  // Rattaché ailleurs, après la séance : il suit son point principal ; terminé il y a longtemps : pas au PV.
  await expect(page.locator('.min-task.child[data-point="Sous-point rattaché ailleurs"]')).toBeVisible();
  await expect(page.locator('.min-task[data-point="Sous-point fini avant"]')).toHaveCount(0);

  // Fiche du PV du point, onglet « Rattachements » : un nouveau point rattaché (délai lointain), puis un point existant
  // rattaché ; Échap : retour à la prise de notes.
  const ouvrir = async () => {
    await page.locator('.min-task[data-point="Point figé"]').getByRole('button', { name: 'Point figé' }).click();
    const fiche = page.getByRole('dialog', { name: 'Fiche du PV : Point figé' });
    await fiche.getByRole('tab', { name: /^Rattachements/ }).click();
    await expect(fiche.getByRole('button', { name: '+ Nouveau point rattaché' })).toBeVisible();
    return fiche;
  };
  let fiche = await ouvrir();
  await fiche.getByRole('button', { name: '+ Nouveau point rattaché' }).click();
  const enfant = page.locator('.modal').last();
  await enfant.getByPlaceholder('Que faut-il faire ou savoir ?').fill('Sous-point décidé au PV');
  await enfant.getByLabel('Pour quand ?').first().fill(dansJours(200));
  await enfant.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.pv-fiche-ecran')).toHaveCount(0);
  const sous = page.locator('.min-task.child[data-point="Sous-point décidé au PV"]');
  await expect(sous).toBeVisible();
  await expect(sous).toContainText('nouvelle');

  fiche = await ouvrir();
  await fiche.getByRole('button', { name: 'Rattacher un point existant' }).click();
  await fiche.locator('select', { has: page.locator('option', { hasText: '— Choisir le point à rattacher —' }) }).selectOption({ label: `Point à part (${dansJours(200).split('-').reverse().join('.')})` });
  await expect(fiche.locator('.linked-row', { hasText: 'Point à part' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pv-fiche-ecran')).toHaveCount(0);
  const rattache = page.locator('.min-task.child[data-point="Point à part"]');
  await expect(rattache).toBeVisible();
  await expect(rattache.locator('.min-changes')).toContainText('rattaché à « Point figé »');

  // Rechargé : toujours là.
  await page.reload();
  await allerA(page, '/pv?seance=m-fige');
  await expect(page.locator('.min-task.child[data-point="Sous-point décidé au PV"]')).toBeVisible();
  await expect(page.locator('.min-task.child[data-point="Point à part"]')).toBeVisible();
});

test('PV en cours : un sous-point créé depuis la fiche d’un point s’affiche sous lui, même avec un délai lointain', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const nouveau = await nouvelleTache(page, 'Point du PV');
  await nouveau.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await allerA(page, '/pv');
  await page.locator('.min-task[data-point="Point du PV"]').getByRole('button', { name: 'Point du PV' }).click();
  // Fiche du PV du point, onglet « Rattachements ».
  const fiche = page.getByRole('dialog', { name: 'Fiche du PV : Point du PV' });
  await fiche.getByRole('tab', { name: /^Rattachements/ }).click();
  await fiche.getByRole('button', { name: '+ Nouveau point rattaché' }).click();
  const enfant = page.locator('.modal').last();
  await enfant.getByPlaceholder('Que faut-il faire ou savoir ?').fill('Sous-point lointain');
  await enfant.getByLabel('Pour quand ?').first().fill(dansJours(200));
  await enfant.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.min-task.child[data-point="Sous-point lointain"]')).toBeVisible();
});

test('PV : un statut changé plusieurs fois n’y figure qu’une fois, de l’état du départ à celui de la fin', async ({ page }) => {
  await page.goto('./?demo#/taches');
  const fiche = await nouvelleTache(page, 'Point aux statuts');
  await fiche.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await allerA(page, '/pv');
  const statut = page.getByLabel('Statut de Point aux statuts');
  const point = page.locator('.min-task[data-point="Point aux statuts"]');
  await statut.selectOption({ label: 'En cours' });
  await statut.selectOption({ label: 'En attente' });
  await statut.selectOption({ label: 'Terminé' });
  await expect(point.locator('.min-changes')).toHaveText('↻ statut : À faire → Terminé');
  // Le document du PV aussi.
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await expect(page.locator('.min-pv-change', { hasText: 'statut' })).toHaveText('↻ statut : À faire → Terminé');
  await page.getByRole('button', { name: 'Prise de notes', exact: true }).click();
  // Revenu à l'état du départ : plus de changement.
  await statut.selectOption({ label: 'À faire' });
  await expect(point.locator('.min-changes')).toHaveCount(0);
});

test('PV imprimé : sous chaque point, ses étapes et ses points rattachés, comme dans l’ordre du jour', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const moi = d.people[0].id;
    const t = (id: string, titre: string, o: object) => ({ id, sectionId: 'sec11', sousSection: 'Newsletter', titre, responsables: [moi], statusId: 's1', delai: j, remarque: '', checklist: [], createdBy: moi, updatedAt: new Date().toISOString(), ...o });
    d.tasks.push(
      t('n1', 'Newsletter novembre', { checklist: [{ id: 'c1', label: 'Relire le texte', done: true }, { id: 'c2', label: 'Envoyer', done: false }] }),
      t('n2', 'Communiquer le remboursement', { parentId: 'n1' }),
    );
    localStorage.setItem(k, JSON.stringify(d));
  }, { k: cle, j: dansJours(2) });
  await page.reload();

  // Ordre du jour : sous « Newsletter novembre », ses deux étapes puis son point rattaché.
  await allerA(page, '/ordre-du-jour');
  const odj = page.locator('li', { has: page.locator('> .odj-task', { hasText: 'Newsletter novembre' }) });
  await expect(odj.locator('> ul > li')).toHaveText(['☑ Relire le texte', '☐ Envoyer', /^Communiquer le remboursement/]);

  // PV : pareil.
  await allerA(page, '/pv');
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByLabel('Inclure tous les points de l’ordre du jour').check();
  const pv = page.locator('.pv-sheet li', { hasText: /^Newsletter novembre/ }).first();
  await expect(pv.locator('> ul > li')).toHaveText(['☑ Relire le texte', '☐ Envoyer', /^Communiquer le remboursement/]);
  // Le point rattaché n'est plus au même niveau que son point principal.
  await expect(page.locator('.pv-sheet ul.odj-l2 > li', { hasText: /^Communiquer le remboursement/ })).toHaveCount(0);
  // Texte copié : imbriqué de même.
  await page.getByRole('button', { name: 'Copier le texte' }).click();
  const texte = await page.evaluate(() => navigator.clipboard.readText());
  expect(texte).toMatch(/\n {6}■ Newsletter novembre[^\n]*\n {9}◦ ☑ Relire le texte\n {9}◦ ☐ Envoyer\n {9}◦ Communiquer le remboursement/);
});

test('fiche du PV : d’un point à l’autre par la pilule, le point quitté enregistré ; fenêtres réglables, projection à droite', async ({ page }) => {
  await page.goto('./?demo#/taches');
  for (const titre of ['Point A de la fiche', 'Point B de la fiche']) {
    const f = await nouvelleTache(page, titre);
    await f.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await page.evaluate(() => {
    localStorage.removeItem('taches-gsa-pv-projection');
    localStorage.removeItem('taches-gsa-pv-fiche-hauteur');
  });
  await allerA(page, '/pv');
  await page.locator('.min-task[data-point="Point A de la fiche"]').getByRole('button', { name: 'Point A de la fiche' }).click();
  const fiche = page.getByRole('dialog', { name: /^Fiche du PV : / });
  await expect(fiche).toHaveAccessibleName('Fiche du PV : Point A de la fiche');
  // Sans projection : le point et ses notes au centre de l'écran.
  const boite = (await fiche.locator('.pv-fiche-gauche').boundingBox())!;
  const largeur = page.viewportSize()!.width;
  expect(Math.abs(boite.x + boite.width / 2 - largeur / 2)).toBeLessThan(20);
  await expect(page.getByRole('region', { name: 'Pièces jointes du point en cours' })).toHaveCount(0);

  // Le point changé dans la fiche (statut, remarque) et sa note de séance.
  await fiche.getByRole('combobox', { name: 'Statut' }).click();
  await page.getByRole('listbox').getByRole('option', { name: 'En cours' }).click();
  await fiche.getByPlaceholder('Détails utiles (facultatif)').fill('Remarque écrite en séance');
  const notes = fiche.getByRole('textbox', { name: 'Notes / décisions sur ce point…' });
  await notes.click();
  await page.keyboard.type('Décidé : on commande.');
  const lire = () =>
    page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!);
      const t = d.tasks.find((x: { titre: string }) => x.titre === 'Point A de la fiche');
      const statut = d.statuses.find((s: { id: string }) => s.id === t.statusId).label;
      const pv = d.meetings.map((m: { minutes?: { notes: Record<string, string>; journal?: { taskId: string; changes: string[] }[] } }) => m.minutes).find((m: { notes: Record<string, string> } | undefined) => m?.notes[`task:${t.id}`]);
      return { statut, remarque: t.remarque, note: pv?.notes[`task:${t.id}`], journal: (pv?.journal ?? []).filter((j: { taskId: string }) => j.taskId === t.id).flatMap((j: { changes: string[] }) => j.changes) };
    });
  // Pas encore enregistré : le point reste tel quel tant qu'on ne passe pas au suivant.
  expect((await lire()).statut).toBe('À faire');

  // La pilule passe au point suivant sans rouvrir la fiche : le point quitté est enregistré, inscrit au PV.
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  const suivant = pilule.getByRole('button', { name: /^Point suivant/ });
  const precedent = pilule.getByRole('button', { name: /^Point précédent/ });
  await expect(pilule.locator('.pilule-titre')).toContainText('1.');
  // D'arrêt en arrêt (vers l'avant, puis vers l'arrière), jusqu'au point voulu.
  const allerAu = async (titre: string) => {
    for (const bouton of [suivant, precedent])
      for (let i = 0; i < 30 && (await fiche.getAttribute('aria-label')) !== `Fiche du PV : ${titre}` && (await bouton.isEnabled()); i++) {
        const vers = (await bouton.getAttribute('title'))!.replace(/^Point (suivant|précédent) : /, '');
        await bouton.click();
        await expect(fiche).toHaveAccessibleName(`Fiche du PV : ${vers}`);
      }
    await expect(fiche).toHaveAccessibleName(`Fiche du PV : ${titre}`);
  };
  await allerAu('Point B de la fiche');
  await expect.poll(lire).toEqual({ statut: 'En cours', remarque: 'Remarque écrite en séance', note: 'Décidé : on commande.', journal: ['statut : À faire → En cours', 'remarque modifiée'] });
  await expect(fiche.getByPlaceholder('Que faut-il faire ou savoir ?')).toHaveValue('Point B de la fiche');
  // Retour au point A : enregistré, avec sa note.
  await allerAu('Point A de la fiche');
  await expect(fiche.getByPlaceholder('Détails utiles (facultatif)')).toHaveValue('Remarque écrite en séance');
  await expect(fiche.getByRole('combobox', { name: 'Statut' })).toHaveText('En cours');
  await expect(notes).toHaveText('Décidé : on commande.');
  await expect(fiche.locator('.min-changes')).toContainText('statut : À faire → En cours');

  // Hauteur du point et de ses notes : réglable (clavier, souris), retenue ; double-clic : comme à l'origine.
  const hauteur = fiche.getByRole('separator', { name: 'Hauteur du point et de ses notes' });
  await expect(hauteur).toHaveAttribute('aria-valuenow', '50');
  const hPoint = async () => (await fiche.getByRole('region', { name: 'Point' }).boundingBox())!.height;
  const avant = await hPoint();
  await hauteur.focus();
  await page.keyboard.press('ArrowDown');
  await expect(hauteur).toHaveAttribute('aria-valuenow', '55');
  const b = (await hauteur.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 80, { steps: 4 });
  await page.mouse.up();
  expect(Number(await hauteur.getAttribute('aria-valuenow'))).toBeGreaterThan(60);
  expect(await hPoint()).toBeGreaterThan(avant + 60);
  expect(Number(await page.evaluate(() => localStorage.getItem('taches-gsa-pv-fiche-hauteur')))).toBeGreaterThan(0.6);
  await hauteur.dblclick();
  await expect(hauteur).toHaveAttribute('aria-valuenow', '50');

  // Projection (icône de la pilule) : les pièces jointes du point à droite, la barre entre les deux réglable.
  await pilule.getByRole('button', { name: /^Projection/ }).click();
  const panneau = page.getByRole('region', { name: 'Pièces jointes du point en cours' });
  await expect(panneau.locator('h2')).toHaveText('Point A de la fiche');
  expect((await panneau.boundingBox())!.x).toBeGreaterThan(largeur / 2 - 20);
  expect((await fiche.locator('.pv-fiche-gauche').boundingBox())!.x).toBeLessThan(40);
  await expect(fiche.getByRole('separator', { name: 'Largeur de la fiche et de la projection' })).toBeVisible();
  await suivant.click();
  await expect(panneau.locator('h2')).not.toHaveText('Point A de la fiche');

  // Échap : retour à la prise de notes, au point où l'on était.
  await page.keyboard.press('Escape');
  await expect(fiche).toHaveCount(0);
  await expect(page.locator('.min-task[data-point="Point A de la fiche"] .min-changes')).toContainText('statut : À faire → En cours');
});

test('PV corrigé après la séance : la remarque des points telle qu’à la fin de la séance, en gris dans le PV', async ({ page }) => {
  const cle = 'taches-gsa-demo-v7';
  await expect.poll(() => page.evaluate((k) => !!localStorage.getItem(k), cle)).toBe(true);
  // Séance il y a 5 jours, PV validé et figé avant qu'on garde la remarque (états sans remarque). « Point annoté après » :
  // remarque écrite après la séance ; « Point annoté avant » : remarque d'avant la séance.
  await page.evaluate(({ k, j }) => {
    const d = JSON.parse(localStorage.getItem(k)!);
    const aFaire = d.statuses.filter((s: { done: boolean }) => !s.done)[0].id;
    d.meetings = d.meetings.filter((m: { date: string }) => !(m.date >= j.seance && m.date < j.auj));
    const moi = d.people[0].id;
    const etat = (titre: string) => ({ statusId: aFaire, delai: j.seance, responsables: [moi], titre, sous: {}, rang: 'p1' });
    const minutes = { presents: [moi], excuses: [], notes: { 'task:r1': 'Note de la séance.' }, demarreLe: `${j.seance}T17:30:00.000Z`, valideLe: `${j.seance}T20:00:00.000Z`, validePar: moi, version: 1, etats: { r1: etat('Point annoté après'), r2: etat('Point annoté avant') } };
    d.meetings.push({ id: 'm-rem', titre: 'Comité des remarques', date: j.seance, heure: '19:30', lieu: '', minutes: { ...minutes, derniereValidee: structuredClone(minutes) } });
    const t = (id: string, titre: string, remarque: string, maj: string) => ({ id, sectionId: d.sections[0].id, sousSection: '', titre, responsables: [moi], statusId: aFaire, delai: j.seance, meetingId: 'm-rem', remarque, checklist: [], createdBy: moi, updatedAt: `${maj}T12:00:00.000Z` });
    d.tasks.push(t('r1', 'Point annoté après', 'Écrite après la séance', j.hier), t('r2', 'Point annoté avant', 'Remarque d’avant la séance', j.avant));
    localStorage.setItem(k, JSON.stringify(d));
    const creee = { le: `${j.avant}T09:00:00.000Z`, par: 'x', nom: 'Julien Moreau', quoi: 'creee', champs: {} };
    localStorage.setItem('taches-gsa-demo-historique', JSON.stringify({ 'u-central': {
      r1: [{ le: `${j.hier}T12:00:00.000Z`, par: 'lea', nom: 'Léa', champs: { remarque: [null, 'Écrite après la séance'] } }, creee],
      r2: [creee],
    } }));
  }, { k: cle, j: { seance: dansJours(-5), avant: dansJours(-8), hier: dansJours(-1), auj: dansJours(0) } });
  await page.reload();
  await allerA(page, '/pv?seance=m-rem');
  await page.getByRole('button', { name: 'Corriger le PV' }).first().click();
  const ligne = (titre: string) => page.locator(`.min-task[data-point="${titre}"]`);
  // Prise de notes : pas la remarque écrite après la séance ; celle d'avant, en gris.
  await expect(ligne('Point annoté avant').locator('.odj-rem')).toContainText('Remarque d’avant la séance');
  await expect(ligne('Point annoté après')).toBeVisible();
  await expect(ligne('Point annoté après').locator('.odj-rem')).toHaveCount(0);
  // Retrouvée une fois, gardée dans le PV.
  await expect
    .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).meetings.find((m: { id: string }) => m.id === 'm-rem').minutes.etats, cle))
    .toMatchObject({ r1: { remarque: '' }, r2: { remarque: 'Remarque d’avant la séance' } });

  // Document du PV : la remarque sous le point, en gris ; les notes de la séance en noir. Option pour la retirer.
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await page.getByLabel('Inclure tous les points de l’ordre du jour').check();
  const rem = page.locator('.pv-sheet .min-pv-rem');
  await expect(rem).toHaveText(['Remarque d’avant la séance']);
  const couleur = (l: typeof rem) => l.evaluate((e) => getComputedStyle(e).color);
  expect(await couleur(rem)).toBe('rgb(107, 114, 128)');
  expect(await couleur(page.locator('.pv-sheet .min-pv-note').first())).toBe('rgb(17, 17, 17)');
  await expect(page.locator('.pv-sheet')).not.toContainText('Écrite après la séance');
  await page.getByRole('checkbox', { name: 'Remarques des points' }).uncheck();
  await expect(rem).toHaveCount(0);
});

test('fiche du PV : onglets Checklist, Rattachements, Étiquettes et Documents, enregistrés en passant au point suivant', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('./?demo#/taches');
  for (const titre of ['Point aux onglets', 'Point voisin']) {
    const f = await nouvelleTache(page, titre);
    await f.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await allerA(page, '/pv');
  await page.locator('.min-task[data-point="Point aux onglets"]').getByRole('button', { name: 'Point aux onglets' }).click();
  const fiche = page.getByRole('dialog', { name: 'Fiche du PV : Point aux onglets' });
  const onglet = (nom: string) => fiche.getByRole('tab', { name: new RegExp(`^${nom}`) });
  // Premier onglet : le point, sa remarque juste sous l'intitulé.
  await expect(onglet('Point')).toHaveAttribute('aria-selected', 'true');
  await expect(fiche.getByRole('tabpanel').locator('label').nth(1)).toContainText('Remarque');

  // Checklist : une étape ajoutée (le nombre suit sur l'onglet).
  await onglet('Checklist').click();
  await fiche.getByPlaceholder('Ajouter une étape…').fill('Relancer le fournisseur');
  await fiche.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(onglet('Checklist')).toContainText('0/1');
  // Étiquettes : une étiquette mise à la main.
  await onglet('Étiquettes').click();
  await fiche.getByRole('button', { name: 'Groupe compétition' }).click();
  await expect(fiche.getByRole('button', { name: 'Groupe compétition' })).toHaveAttribute('aria-pressed', 'true');
  await expect(onglet('Étiquettes')).toContainText('1');
  // Documents : une photo jointe.
  await onglet('Documents').click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await fiche.locator('fieldset.docs input[type=file]').first().setInputFiles([{ name: 'devis.png', mimeType: 'image/png', buffer: png }]);
  await expect(fiche.locator('.doc-list li')).toHaveCount(1);
  await expect(onglet('Documents')).toContainText('1');

  // Rattachements : un nouveau point rattaché, inscrit au PV comme décidé en séance, sous son point.
  await onglet('Rattachements').click();
  // Le nombre de l'onglet : séance ou événement liés, point principal et points rattachés.
  const liens = async () => {
    const nb = onglet('Rattachements').locator('.pv-fiche-nb');
    return (await nb.count()) ? Number(await nb.textContent()) : 0;
  };
  const avant = await liens();
  await fiche.getByRole('button', { name: '+ Nouveau point rattaché' }).click();
  const enfant = page.locator('.modal').last();
  await enfant.getByPlaceholder('Que faut-il faire ou savoir ?').fill('Sous-point de la fiche');
  await enfant.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(fiche.locator('.linked-row', { hasText: 'Sous-point de la fiche' })).toBeVisible();
  await expect.poll(liens).toBe(avant + 1);
  // Toujours le brouillon du point (pas encore enregistré) : checklist et étiquette encore là.
  await expect(onglet('Checklist')).toContainText('0/1');

  const lire = () =>
    page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!);
      const t = d.tasks.find((x: { titre: string }) => x.titre === 'Point aux onglets');
      const enfant = d.tasks.find((x: { titre: string }) => x.titre === 'Sous-point de la fiche');
      const etiquette = d.etiquettes.find((e: { nom: string }) => e.nom === 'Groupe compétition').id;
      const pv = d.meetings.map((m: { minutes?: { nouvelles?: string[]; journal?: { taskId: string; changes: string[] }[] } }) => m.minutes).find((m: { nouvelles?: string[] } | undefined) => m?.nouvelles?.includes(enfant?.id));
      return {
        etapes: t.checklist.map((c: { label: string }) => c.label),
        etiquette: (t.etiquettes ?? []).includes(etiquette),
        documents: (t.documents ?? []).map((x: { nom: string }) => x.nom),
        enfant: enfant?.parentId === t.id,
        auPv: !!pv,
        journal: (pv?.journal ?? []).filter((j: { taskId: string }) => j.taskId === t.id).flatMap((j: { changes: string[] }) => j.changes),
      };
    });
  expect((await lire()).etapes).toEqual([]);

  // Point suivant : le point quitté est enregistré ; l'onglet reste le même d'un point à l'autre.
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  await pilule.getByRole('button', { name: /^Point suivant/ }).click();
  await expect(page.getByRole('dialog', { name: /^Fiche du PV : / })).not.toHaveAccessibleName('Fiche du PV : Point aux onglets');
  await expect(page.getByRole('dialog', { name: /^Fiche du PV : / }).getByRole('tab', { name: /^Rattachements/ })).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(lire)
    .toEqual({ etapes: ['Relancer le fournisseur'], etiquette: true, documents: ['devis.png'], enfant: true, auPv: true, journal: ['sous-point ajouté : Relancer le fournisseur'] });

  // Dans la prise de notes : le sous-point sous son point, nouveau.
  await page.keyboard.press('Escape');
  await expect(page.locator('.min-task.child[data-point="Sous-point de la fiche"]')).toContainText('nouvelle');
});

test('PV au clavier : ↑ ↓ d’un point à l’autre, dans la fiche du PV et dans la prise de notes', async ({ page }) => {
  await page.goto('./?demo#/taches');
  for (const titre of ['Point clavier 1', 'Point clavier 2']) {
    const f = await nouvelleTache(page, titre);
    await f.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  await allerA(page, '/pv');
  await page.locator('.min-task[data-point="Point clavier 1"]').getByRole('button', { name: 'Point clavier 1' }).click();
  const fiche = page.getByRole('dialog', { name: /^Fiche du PV : / });
  await expect(fiche).toHaveAccessibleName('Fiche du PV : Point clavier 1');
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  const nom = async (sens: 'suivant' | 'précédent') =>
    (await pilule.getByRole('button', { name: new RegExp(`^Point ${sens}`) }).getAttribute('title'))!.replace(/^Point (suivant|précédent) : /, '');

  // Fiche : le curseur dans les notes (vides) ; ↓ au point suivant, ↑ revient.
  const notes = fiche.getByRole('region', { name: 'Notes de la séance' }).getByRole('textbox');
  await expect(notes).toBeFocused();
  const suivant = await nom('suivant');
  await page.keyboard.press('ArrowDown');
  await expect(fiche).toHaveAccessibleName(`Fiche du PV : ${suivant}`);
  await expect(notes).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(fiche).toHaveAccessibleName('Fiche du PV : Point clavier 1');

  // Dans un texte, seulement au bord : la remarque, curseur au début, ↓ y descend d'abord (pas de point suivant).
  const remarque = fiche.getByPlaceholder('Détails utiles (facultatif)');
  await remarque.fill('Une remarque');
  await remarque.evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(0, 0));
  await page.keyboard.press('ArrowDown');
  await expect(fiche).toHaveAccessibleName('Fiche du PV : Point clavier 1');
  await expect.poll(() => remarque.evaluate((e: HTMLTextAreaElement) => e.selectionStart)).toBe('Une remarque'.length);
  // À la fin : point suivant, le point quitté enregistré.
  await page.keyboard.press('ArrowDown');
  await expect(fiche).toHaveAccessibleName(`Fiche du PV : ${suivant}`);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('taches-gsa-demo-v7')!).tasks.find((x: { titre: string }) => x.titre === 'Point clavier 1').remarque))
    .toBe('Une remarque');
  // La liste déroulante du statut garde ses flèches.
  await page.keyboard.press('ArrowUp');
  await expect(fiche).toHaveAccessibleName('Fiche du PV : Point clavier 1');
  await fiche.getByRole('combobox', { name: 'Statut' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(fiche).toHaveAccessibleName('Fiche du PV : Point clavier 1');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(fiche).toHaveCount(0);

  // Prise de notes (projection : le point en cours) : ↓ au point suivant, ↑ au précédent.
  await page.getByRole('button', { name: 'Projection', exact: true }).click();
  const panneau = page.getByRole('region', { name: 'Pièces jointes du point en cours' });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const premier = await nom('suivant');
  await page.keyboard.press('ArrowDown');
  await expect(panneau.locator('h2')).toHaveText(premier);
  const second = await nom('suivant');
  await page.keyboard.press('ArrowDown');
  await expect(panneau.locator('h2')).toHaveText(second);
  await page.keyboard.press('ArrowUp');
  await expect(panneau.locator('h2')).toHaveText(premier);
});

test('fiche du PV : onglet « Séances précédentes », ce que les PV d’avant disent du point (pas celui de la séance)', async ({ page }) => {
  await page.goto('./?demo#/taches');
  for (const titre of ['Point suivi de séance en séance', 'Point dont on n’a jamais parlé']) {
    const f = await nouvelleTache(page, titre);
    await f.getByRole('button', { name: /^Créer$/ }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }
  // Une séance passée (PV validé) en parle ; une séance d'après aussi (pas « précédente »).
  await page.evaluate((j) => {
    const k = 'taches-gsa-demo-v7';
    const d = JSON.parse(localStorage.getItem(k)!);
    const t = d.tasks.find((x: { titre: string }) => x.titre === 'Point suivi de séance en séance');
    const pv = (note: string) => ({ presents: [], excuses: [], notes: { [`task:${t.id}`]: note }, valideLe: `${j.avant}T20:00:00.000Z`, version: 1 });
    d.meetings.push(
      { id: 'm-avant', titre: 'Comité d’il y a un mois', date: j.avant, heure: '19:30', lieu: '', minutes: pv('Devis demandé à deux fournisseurs.') },
      { id: 'm-apres', titre: 'Comité lointain', date: j.loin, heure: '19:30', lieu: '', minutes: pv('Note d’une séance d’après.') },
    );
    localStorage.setItem(k, JSON.stringify(d));
  }, { avant: dansJours(-30), loin: dansJours(400) });
  await page.reload();
  await allerA(page, '/pv');
  await page.locator('.min-task[data-point="Point suivi de séance en séance"]').getByRole('button', { name: 'Point suivi de séance en séance' }).click();
  const fiche = page.getByRole('dialog', { name: 'Fiche du PV : Point suivi de séance en séance' });
  // La note de cette séance-ci : dans le rectangle des notes, pas dans l'onglet.
  await fiche.getByRole('region', { name: 'Notes de la séance' }).getByRole('textbox').click();
  await page.keyboard.type('Note de la séance en cours.');
  const onglet = fiche.getByRole('tab', { name: /^Séances précédentes/ });
  await expect(onglet).toContainText('1');
  await onglet.click();
  const notes = fiche.getByRole('tabpanel').locator('.notes-seances');
  await expect(notes.locator('legend')).toContainText('Notes des séances précédentes');
  await expect(notes.locator('li')).toHaveCount(1);
  await expect(notes.locator('li')).toContainText('Comité d’il y a un mois');
  await expect(notes.locator('li')).toContainText('Devis demandé à deux fournisseurs.');
  await expect(notes).not.toContainText('Note de la séance en cours.');
  await expect(notes).not.toContainText('Note d’une séance d’après.');

  // Un point dont aucun PV d'avant ne parle : un mot, pas de nombre ; l'onglet reste choisi d'un point à l'autre.
  const pilule = page.getByRole('toolbar', { name: 'Outils de la prise de notes' });
  const autre = page.getByRole('dialog', { name: /^Fiche du PV : / });
  for (const sens of ['suivant', 'précédent']) {
    const bouton = pilule.getByRole('button', { name: new RegExp(`^Point ${sens}`) });
    for (let i = 0; i < 30 && (await autre.getAttribute('aria-label')) !== 'Fiche du PV : Point dont on n’a jamais parlé' && (await bouton.isEnabled()); i++) {
      const vers = (await bouton.getAttribute('title'))!.replace(/^Point (suivant|précédent) : /, '');
      await bouton.click();
      await expect(autre).toHaveAccessibleName(`Fiche du PV : ${vers}`);
    }
  }
  await expect(autre).toHaveAccessibleName('Fiche du PV : Point dont on n’a jamais parlé');
  await expect(autre.getByRole('tab', { name: /^Séances précédentes/ })).toHaveAttribute('aria-selected', 'true');
  await expect(autre.getByRole('tab', { name: /^Séances précédentes/ }).locator('.pv-fiche-nb')).toHaveCount(0);
  await expect(autre.getByRole('tabpanel')).toContainText('Le PV des séances précédentes ne dit rien de ce point.');
});

test('fiche du PV : bandeau de la séance en haut ; onglet « Vote » des membres présents, le résultat dans le PV', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./?demo#/taches');
  const f = await nouvelleTache(page, 'Acheter une remorque');
  await f.getByRole('button', { name: /^Créer$/ }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await allerA(page, '/pv');
  const seance = (await page.locator('.minutes-page .page-head select').first().locator('option:checked').textContent())!.split(' – ')[0];
  const ouvrir = async () => {
    await page.locator('.min-task[data-point="Acheter une remorque"]').getByRole('button', { name: 'Acheter une remorque' }).click();
    return page.getByRole('dialog', { name: 'Fiche du PV : Acheter une remorque' });
  };
  let fiche = await ouvrir();
  // Bandeau : le comité, la séance, sa date et son lieu.
  const bandeau = fiche.locator('.pv-fiche-entete');
  await expect(bandeau).toContainText(seance);
  await expect(bandeau).toContainText('Lieu :');
  await expect(bandeau).toContainText(/\d{4}/);
  // Personne de présent : rien à voter.
  await fiche.getByRole('tab', { name: /^Vote/ }).click();
  await expect(fiche.getByRole('tabpanel')).toContainText('Personne n’est noté présent');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Tous présents/ }).click();

  fiche = await ouvrir();
  await fiche.getByRole('tab', { name: /^Vote/ }).click();
  const voix = fiche.getByRole('group', { name: /^Voix de / });
  const n = await voix.count();
  expect(n).toBeGreaterThan(2);
  await fiche.getByRole('button', { name: 'Tous pour' }).click();
  await expect(fiche.locator('.pv-vote-bilan strong')).toHaveText(`Accepté à l’unanimité (${n} pour)`);
  await expect(fiche.getByRole('tab', { name: /^Vote/ })).toContainText(`${n}/${n}`);
  await voix.nth(1).getByRole('button', { name: 'Contre' }).click();
  await voix.nth(2).getByRole('button', { name: 'Abstention' }).click();
  // Re-clic : la voix est retirée.
  await voix.nth(2).getByRole('button', { name: 'Abstention' }).click();
  await expect(voix.nth(2).getByRole('button', { name: 'Abstention' })).toHaveAttribute('aria-pressed', 'false');
  await expect(fiche.locator('.pv-vote-bilan')).toContainText('pas encore votés : 1');
  await voix.nth(2).getByRole('button', { name: 'Abstention' }).click();
  const attendu = `accepté – ${n - 2} pour, 1 contre, 1 abstention`;
  await expect(fiche.locator('.pv-vote-bilan')).toContainText(`Vote : ${attendu}`);
  await page.keyboard.press('Escape');

  // Prise de notes, document et texte du PV : le résultat sous le point (au PV même sans note).
  await expect(page.locator('.min-task[data-point="Acheter une remorque"] .min-vote')).toHaveText(`Vote : ${attendu}`);
  await page.getByRole('button', { name: 'PV', exact: true }).click();
  await expect(page.locator('.pv-sheet li', { hasText: /^Acheter une remorque/ }).locator('.min-pv-vote')).toHaveText(`Vote : ${attendu}`);
  await page.getByRole('button', { name: 'Copier le texte' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`Vote : ${attendu}`);

  // « Effacer » : plus de vote.
  await page.getByRole('button', { name: 'Prise de notes', exact: true }).click();
  fiche = await ouvrir();
  await fiche.getByRole('tab', { name: /^Vote/ }).click();
  await fiche.getByRole('button', { name: 'Effacer' }).click();
  await expect(fiche.locator('.pv-vote-bilan')).toContainText('Aucune voix');
  await page.keyboard.press('Escape');
  await expect(page.locator('.min-task[data-point="Acheter une remorque"] .min-vote')).toHaveCount(0);
});
