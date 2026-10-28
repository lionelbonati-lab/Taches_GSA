-- Jeu de données fictif (base de test jetable) : un club, un comité d'organisation, cinq comptes.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1', 'admin@test.example'),
 ('00000000-0000-0000-0000-0000000000a2', 'lecteur@test.example'),
 ('00000000-0000-0000-0000-0000000000a3', 'externe@test.example'),
 ('00000000-0000-0000-0000-0000000000a4', 'gestion@test.example'),
 ('00000000-0000-0000-0000-0000000000a5', 'dehors@test.example'),
 ('00000000-0000-0000-0000-0000000000a6', 'sansplace@test.example');
insert into public.committees (id, nom, name, type, parent_id, info) values
 ('00000000-0000-0000-0000-0000000000c0', 'Comité central', 'Comité central', 'central', null, '{}'),
 ('00000000-0000-0000-0000-0000000000c1', 'CO', 'CO', 'sous-comite', '00000000-0000-0000-0000-0000000000c0', '{}');
insert into public.gsa_club_membres (club_id, id, data) values
 ('00000000-0000-0000-0000-0000000000c0', 'm1', '{"prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm2', '{"prenom":"Léa","nom":"Lecteur","email":"lecteur@test.example","telephone":"2"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm3', '{"prenom":"Eve","nom":"Externe","email":"externe@test.example","telephone":"3"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm4', '{"prenom":"Gil","nom":"Gestion","email":"gestion@test.example","telephone":"4"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm5', '{"prenom":"Pia","nom":"Privée","email":"prive@test.example","telephone":"5"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'm6', '{"prenom":"Sam","nom":"Sansplace","email":"sansplace@test.example","telephone":"6"}');
update public.gsa_club_membres set data = data || '{"prive": true}' where id = 'm5';
insert into public.gsa_items (committee_id, kind, id, pos, data) values
 ('00000000-0000-0000-0000-0000000000c0', 'roles', 'admin', 0, '{"id":"admin","label":"Admin","locked":true,"permissions":[]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'roles', 'externe', 1, '{"id":"externe","label":"Externe","permissions":["tasks.editOwn"]}'),
 ('00000000-0000-0000-0000-0000000000c1', 'roles', 'admin', 0, '{"id":"admin","label":"Admin","locked":true,"permissions":[]}'),
 ('00000000-0000-0000-0000-0000000000c1', 'roles', 'lecteur', 1, '{"id":"lecteur","label":"Lecteur","permissions":["tab.people"]}'),
 ('00000000-0000-0000-0000-0000000000c1', 'roles', 'gestion', 2, '{"id":"gestion","label":"Gestion","permissions":["people.manage"]}'),
 ('00000000-0000-0000-0000-0000000000c0', 'statuses', 's1', 0, '{"id":"s1","label":"À faire","couleur":"#64748b","done":false}'),
 ('00000000-0000-0000-0000-0000000000c0', 'statuses', 's4', 1, '{"id":"s4","label":"Terminé","couleur":"#16a34a","done":true}'),
 ('00000000-0000-0000-0000-0000000000c0', 'people', 'p1', 0, '{"id":"p1","prenom":"Ada","nom":"Admin","email":"admin@test.example","telephone":"1","roles":["admin"],"actif":true,"membreId":"m1"}'),
 ('00000000-0000-0000-0000-0000000000c0', 'people', 'p3', 1, '{"id":"p3","prenom":"Eve","nom":"Externe","email":"externe@test.example","telephone":"3","roles":["externe"],"actif":true,"membreId":"m3"}'),
 ('00000000-0000-0000-0000-0000000000c1', 'people', 'p2', 0, '{"id":"p2","prenom":"Léa","nom":"Lecteur","email":"lecteur@test.example","telephone":"2","roles":["lecteur"],"actif":true,"membreId":"m2"}'),
 ('00000000-0000-0000-0000-0000000000c1', 'people', 'p4', 1, '{"id":"p4","prenom":"Gil","nom":"Gestion","email":"gestion@test.example","telephone":"4","roles":["gestion"],"actif":true,"membreId":"m4"}'),
 ('00000000-0000-0000-0000-0000000000c1', 'people', 'p5', 2, '{"id":"p5","prenom":"Pia","nom":"Privée","email":"prive@test.example","telephone":"5","roles":["lecteur"],"actif":true,"membreId":"m5"}');
insert into public.gsa_members (committee_id, user_id, person_id) values
 ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000a1', 'p1'),
 ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-0000000000a3', 'p3'),
 ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a2', 'p2'),
 ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', 'p4');
