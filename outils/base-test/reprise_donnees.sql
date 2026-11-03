-- Données fictives pour essayer la reprise des entités (059), après donnees.sql : les cas trouvés par le rapport D2.
-- Club …c0 ; entités : Fête d'été (…e1, équipe datée), Sortie de St-Pierre (…e2), Ancienne soirée (…e3, archivée),
-- Course (…f1, groupe : section « Groupe course »), Hiver (…f2, groupe : sous-section « Événements › Hiver »), Vide (…f3).
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a7', 'bob@test.example'),
 ('00000000-0000-0000-0000-0000000000a9', 'zoe@test.example');
insert into public.committees (id, nom, name, type, parent_id, info) values
 ('00000000-0000-0000-0000-0000000000e1', 'Fête d''été', 'Fête d''été', 'equipe', '00000000-0000-0000-0000-0000000000c0', '{"date":"2027-06-20","dateFin":"2027-06-21","couleur":"#0891b2"}'),
 ('00000000-0000-0000-0000-0000000000e2', 'Sortie de St-Pierre', 'Sortie de St-Pierre', 'equipe', '00000000-0000-0000-0000-0000000000c0', '{"date":"2026-12-01"}'),
 ('00000000-0000-0000-0000-0000000000e3', 'Ancienne soirée', 'Ancienne soirée', 'equipe', '00000000-0000-0000-0000-0000000000c0', '{"date":"2026-01-10","archive":true}'),
 ('00000000-0000-0000-0000-0000000000f1', 'Course', 'Course', 'groupe', '00000000-0000-0000-0000-0000000000c0', '{"couleur":"#ea580c"}'),
 ('00000000-0000-0000-0000-0000000000f2', 'Hiver', 'Hiver', 'groupe', '00000000-0000-0000-0000-0000000000c0', '{}'),
 ('00000000-0000-0000-0000-0000000000f3', 'Vide', 'Vide', 'groupe', '00000000-0000-0000-0000-0000000000c0', '{}');
insert into public.gsa_club_membres (club_id, id, data) values
 ('00000000-0000-0000-0000-0000000000c0', 'm7', '{"prenom":"Bob","nom":"Bâton","email":"bob@test.example","telephone":""}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm8', '{"prenom":"Carl","nom":"Craie","email":"carl@test.example","telephone":""}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm9', '{"prenom":"Zoé","nom":"Zèbre","email":"zoe@test.example","telephone":""}');
insert into public.gsa_club_comptes (club_id, membre_id, user_id) values
 ('00000000-0000-0000-0000-0000000000c0', 'm7', '00000000-0000-0000-0000-0000000000a7'),
 ('00000000-0000-0000-0000-0000000000c0', 'm9', '00000000-0000-0000-0000-0000000000a9');

insert into public.gsa_items (committee_id, kind, id, pos, data, deleted) values
 -- Club : sections, une fiche inactive, des tâches liées aux entités, une ancienne ligne (tâche déplacée), une tâche vivante.
 ('00000000-0000-0000-0000-0000000000c0', 'sections', 's-adm', 0, '{"id":"s-adm","nom":"Administration","sousSections":[]}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'sections', 's-grp', 1, '{"id":"s-grp","nom":"Groupe course","sousSections":[]}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'sections', 's-evt', 2, '{"id":"s-evt","nom":"Événements","sousSections":["Fête d''été","Sortie St-Pierre","Hiver"]}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'people', 'p9', 2, '{"id":"p9","prenom":"Zoé","nom":"Zèbre","email":"zoe@test.example","telephone":"","roles":["externe"],"actif":false,"membreId":"m9","poste":"Bénévole"}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 'tc1', 0, '{"id":"tc1","titre":"Informer les membres","sectionId":"s-adm","sousSection":"","responsables":["p1"],"statusId":"s1","delai":"2027-06-17","delaiRef":{"type":"event","joursAvant":3,"unite":"jours"},"evenementEntite":{"uniteId":"00000000-0000-0000-0000-0000000000e1","nom":"Fête d''été","date":"2027-06-20"},"remarque":"","checklist":[],"createdBy":"p1","updatedAt":"2026-10-01T10:00:00.000Z"}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 'tc2', 1, '{"id":"tc2","titre":"Habits","sectionId":"s-adm","sousSection":"","responsables":["p1"],"respPartage":{"00000000-0000-0000-0000-0000000000e1":["xb"]},"statusId":"s1","delai":"","remarque":"","checklist":[],"createdBy":"p1","updatedAt":"2026-10-01T10:00:00.000Z"}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 'tc3', 2, '{"id":"tc3","titre":"Flyers","sectionId":"s-adm","sousSection":"","responsables":["p1"],"partage":["00000000-0000-0000-0000-0000000000e2"],"statusId":"s1","delai":"","remarque":"","checklist":[],"createdBy":"p1","updatedAt":"2026-10-01T10:00:00.000Z"}', false),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 'tx1', 3, '{"id":"tx1","titre":"Ancien titre","sectionId":"s-adm","sousSection":"","responsables":["p1"],"statusId":"s1","delai":"","remarque":"","checklist":[],"createdBy":"p1"}', true),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 'ty1', 4, '{"id":"ty1","titre":"Autre tâche du club","sectionId":"s-adm","sousSection":"","responsables":["p1"],"statusId":"s1","delai":"","remarque":"","checklist":[],"createdBy":"p1"}', false),

 -- Fête d'été (…e1).
 ('00000000-0000-0000-0000-0000000000e1', 'statuses', 's1', 0, '{"id":"s1","label":"À faire","done":false}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'statuses', 'sx', 1, '{"id":"sx","label":"Bloqué","done":false}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'sections', 'se1', 0, '{"id":"se1","nom":"Préparation","sousSections":[]}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'people', 'xa', 0, '{"id":"xa","prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1","roles":["admin"],"actif":true,"membreId":"m1"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'people', 'xb', 1, '{"id":"xb","prenom":"Bob","nom":"Bâton","email":"bob@test.example","telephone":"","roles":["admin"],"actif":true,"membreId":"m7","poste":"Responsable","couleur":"#16a34a"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'people', 'xz', 2, '{"id":"xz","prenom":"Zoé","nom":"Zèbre","email":"zoe@test.example","telephone":"","roles":["membre"],"actif":true,"membreId":"m9"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'people', 'xv', 3, '{"id":"xv","prenom":"Eve","nom":"Externe","email":"externe@test.example","telephone":"3","roles":["membre"],"actif":false,"membreId":"m3","viaEntite":"00000000-0000-0000-0000-0000000000c0"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'events', 'ev1', 0, '{"id":"ev1","nom":"Montage","date":"2027-06-19"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'tasks', 'tx1', 0, '{"id":"tx1","titre":"Monter la tente","sectionId":"se1","sousSection":"","responsables":["xb"],"statusId":"s1","delai":"2027-06-19","remarque":"","checklist":[],"createdBy":"xa","partage":["00000000-0000-0000-0000-0000000000c0"],"commentaires":[{"id":"c1","par":"xb","nom":"Bob Bâton","le":"2026-10-02T09:00:00.000Z","texte":"Je prends la masse"},{"id":"c2","par":"p1","u":"00000000-0000-0000-0000-0000000000c0","nom":"Ada Admin","le":"2026-10-02T10:00:00.000Z","texte":"Merci"}],"pourInfo":{"personnes":["xz"],"autres":{"00000000-0000-0000-0000-0000000000c0":["p3"]}},"pourInfoVus":{"p:xz":{"le":"2026-10-03T08:00:00.000Z"}},"documents":[{"id":"d1","nom":"plan.pdf","kind":"fichier","mime":"application/pdf"}]}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'tasks', 'tx2', 1, '{"id":"tx2","titre":"Commander les boissons","sectionId":"se1","sousSection":"","responsables":["xa","xz"],"statusId":"sx","delai":"2027-06-01","meetingId":"m-e1","delaiRef":{"type":"meeting","joursAvant":0},"aPrendre":{"personnes":["xb"],"par":"xa"},"remarque":"","checklist":[],"createdBy":"xa"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'tasks', 'tx3', 2, '{"id":"tx3","titre":"Installer","sectionId":"se1","sousSection":"","responsables":["xb"],"statusId":"s1","delai":"2027-06-17","eventId":"ev1","delaiRef":{"type":"event","joursAvant":2},"remarque":"","checklist":[],"createdBy":"xa"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'discussionsLues', 'xb', 0, '{"tx1":"2026-10-02T11:00:00.000Z"}', false),
 ('00000000-0000-0000-0000-0000000000e1', 'prefs', 'xb', 0, '{"theme":"auto","affichage":"kanban"}', false),

 -- Sortie de St-Pierre (…e2) : même personne (Bob), tâche dont l'identifiant est pris par une tâche vivante du club.
 ('00000000-0000-0000-0000-0000000000e2', 'people', 'yb', 0, '{"id":"yb","prenom":"Bob","nom":"Bâton","email":"bob@test.example","telephone":"","roles":["membre"],"actif":true,"membreId":"m7"}', false),
 ('00000000-0000-0000-0000-0000000000e2', 'tasks', 'ty1', 0, '{"id":"ty1","titre":"Repérer le parcours","sectionId":"q","sousSection":"","responsables":["yb"],"statusId":"s4","delai":"2026-11-20","remarque":"","checklist":[],"createdBy":"yb"}', false),

 -- Ancienne soirée (…e3, archivée) : une personne sans compte ni fiche au club.
 ('00000000-0000-0000-0000-0000000000e3', 'people', 'zc', 0, '{"id":"zc","prenom":"Carl","nom":"Craie","email":"carl@test.example","telephone":"","roles":["admin"],"actif":true,"membreId":"m8"}', false),
 ('00000000-0000-0000-0000-0000000000e3', 'people', 'za', 1, '{"id":"za","prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1","roles":["membre"],"actif":false,"membreId":"m1"}', false),
 ('00000000-0000-0000-0000-0000000000e3', 'tasks', 'tz1', 0, '{"id":"tz1","titre":"Réserver la salle","sectionId":"q","sousSection":"","responsables":["zc"],"statusId":"s4","delai":"2026-01-01","remarque":"","checklist":[],"createdBy":"za"}', false),

 -- Groupes.
 ('00000000-0000-0000-0000-0000000000f1', 'people', 'ga', 0, '{"id":"ga","prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1","roles":["admin"],"actif":true,"membreId":"m1"}', false),
 ('00000000-0000-0000-0000-0000000000f1', 'tasks', 'tg1', 0, '{"id":"tg1","titre":"Entraînement","sectionId":"q","sousSection":"","responsables":["ga"],"statusId":"s1","delai":"","remarque":"","checklist":[],"createdBy":"ga"}', false),
 ('00000000-0000-0000-0000-0000000000f2', 'people', 'ha', 0, '{"id":"ha","prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1","roles":["admin"],"actif":true,"membreId":"m1"}', false),
 ('00000000-0000-0000-0000-0000000000f2', 'tasks', 'th1', 0, '{"id":"th1","titre":"Salle d''hiver","sectionId":"q","sousSection":"","responsables":["ha"],"statusId":"s1","delai":"","remarque":"","checklist":[],"createdBy":"ha"}', false),
 ('00000000-0000-0000-0000-0000000000f3', 'people', 'ia', 0, '{"id":"ia","prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1","roles":["admin"],"actif":true,"membreId":"m1"}', false);

insert into public.gsa_members (committee_id, user_id, person_id) values
 ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a7', 'xb'),
 ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a7', 'yb'),
 ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a9', 'xz')
on conflict do nothing;
insert into public.gsa_historique (committee_id, tache_id, le, par, nom, quoi, champs) values
 ('00000000-0000-0000-0000-0000000000e1', 'tx1', '2026-10-01T08:00:00Z', null, 'Bob Bâton', 'creee', '{}'),
 ('00000000-0000-0000-0000-0000000000e1', 'tx1', '2026-10-01T09:00:00Z', null, 'Bob Bâton', null, '{"titre":["Monter","Monter la tente"]}');
insert into storage.objects (bucket_id, name, metadata) values ('gsa-fichiers', '00000000-0000-0000-0000-0000000000e1/d1', '{"size":1000}');
