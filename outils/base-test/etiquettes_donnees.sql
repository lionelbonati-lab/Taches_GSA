-- Essai de la migration 062 (étiquettes, discussions) : données fictives à charger AVANT 062 (voir LISEZMOI.md).
-- Messages écrits dans les tâches, comme avant 062 (le serveur seul les y écrivait).
select set_config('gsa.commentaires', 'oui', false);
-- Scénario 062 (données fictives), dans le club c0 :
--   p1 Ada (a1) admin, non membre de l'étiquette ; p3 Eve (a3) externe, membre de l'étiquette « Course » ;
--   p6 Sam (a6) rôle « Comité » (voir toutes les tâches), non membre ; p7 Pia (a5) externe, responsable de t1, non membre.
insert into public.gsa_items (committee_id, kind, id, pos, data) values
 ('00000000-0000-0000-0000-0000000000c0', 'roles', 'comite', 2, '{"id":"comite","label":"Comité","permissions":["tasks.viewAll","tab.meetings"],"sections":[]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'people', 'p6', 2, '{"id":"p6","prenom":"Sam","nom":"Sansplace","roles":["comite"],"actif":true}'),
 ('00000000-0000-0000-0000-0000000000c0', 'people', 'p7', 3, '{"id":"p7","prenom":"Pia","nom":"Dehors","roles":["externe"],"actif":true}'),
 ('00000000-0000-0000-0000-0000000000c0', 'etiquettes', 'et1', 0, '{"id":"et1","nom":"Course","type":"evenement","membres":["p3"]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'etiquettes', 'et-sup', 1, '{"id":"et-sup","nom":"Ancienne","type":"groupe","membres":["p7"]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 't1', 0, '{"id":"t1","titre":"Préparer la course","sectionId":"s","statusId":"s1","responsables":["p7"],"createdBy":"p1","etiquettes":["et1"],"checklist":[],"commentaires":[{"id":"c1","par":"p1","nom":"Ada Admin","le":"2026-11-01T10:00:00.000Z","texte":"Message secret de la course"}]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 't2', 1, '{"id":"t2","titre":"Point ordinaire","sectionId":"s","statusId":"s1","responsables":["p3"],"createdBy":"p1","checklist":[],"commentaires":[{"id":"c2","par":"p3","nom":"Eve Externe","le":"2026-11-01T11:00:00.000Z","texte":"Message ordinaire"}]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'tasks', 't3', 2, '{"id":"t3","titre":"Étiquette supprimée","sectionId":"s","statusId":"s1","responsables":["p1"],"createdBy":"p1","etiquettes":["et-sup"],"checklist":[]}');
update public.gsa_items set deleted = true where kind = 'etiquettes' and id = 'et-sup';
insert into public.gsa_members (committee_id, user_id, person_id) values
 ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000a6', 'p6'),
 ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000a5', 'p7');
select set_config('gsa.commentaires', '', false);
