-- Après reprise_donnees.sql, avant 059 : ce qu'a fait la période D1 sur le serveur (060). La copie de nuit d'avant D1
-- garde le délai de « Informer les membres » calé sur la date de l'entité ; l'appli de D1 a ensuite retiré ce lien.
insert into public.gsa_copies (committee_id, faite_le, manuelle, lignes, taille, empreinte, donnees)
select committee_id, '2026-11-02T01:17:00Z', false, 1, 1, 'essai', jsonb_build_array(jsonb_build_object('kind', kind, 'id', id, 'pos', pos, 'data', data))
from public.gsa_items where committee_id = '00000000-0000-0000-0000-0000000000c0' and kind = 'tasks' and id = 'tc1';
update public.gsa_items set data = data - 'delaiRef' where committee_id = '00000000-0000-0000-0000-0000000000c0' and kind = 'tasks' and id = 'tc1';
