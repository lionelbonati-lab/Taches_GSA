import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { ADMIN_ROLE_ID } from '../data/permissions';
import { COLS_EVENEMENTS, COLS_PERSONNES, COLS_TACHES, analyserEvenements, analyserPersonnes, analyserTaches, derniers } from '../data/imports';
import type { ClubMembre } from '../data/types';
import { ImportCsv } from './ImportCsv';

// Console admin › Import CSV : personnes de l'entité (poste, rôles), tâches et événements, en masse.

type Sorte = 'personnes' | 'taches' | 'evenements';
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export function ImportsEntite() {
  const { data, update, user } = useStore();
  const club = useClubOptional();
  const [sorte, setSorte] = useState<Sorte>('personnes');
  const [registre, setRegistre] = useState<ClubMembre[] | undefined>();
  const acces = !!club?.membresAcces;
  const membres = club?.membres;
  useEffect(() => {
    if (acces && membres) membres().then(setRegistre).catch(() => setRegistre(undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acces]);
  const central = !club || club.current.type === 'central';
  const admin = !!user?.roles.includes(ADMIN_ROLE_ID);

  return (
    <div className="panel">
      <div className="seg wrap">
        <button className={sorte === 'personnes' ? 'on' : ''} onClick={() => setSorte('personnes')}>{central ? 'Responsables' : 'Membres'}</button>
        <button className={sorte === 'taches' ? 'on' : ''} onClick={() => setSorte('taches')}>Tâches</button>
        <button className={sorte === 'evenements' ? 'on' : ''} onClick={() => setSorte('evenements')}>Événements</button>
      </div>
      {sorte === 'personnes' && (
        <ImportCsv
          key="personnes"
          colonnes={COLS_PERSONNES}
          modele="modele-membres-entite.csv"
          aide={
            <p className="muted">
              Une ligne par personne, avec son poste et son rôle dans cette entité. Une personne déjà présente (même email, sinon même prénom et nom)
              est mise à jour : cellules remplies, rôles ajoutés à ceux qu’elle a déjà ; une personne retirée est réactivée.
              {club && ' Ses coordonnées sont celles du registre « Membres du club » (communes à tout le club).'} L’accès à l’appli se crée ensuite
              dans Personnes › {central ? 'Responsables' : 'Membres'}.
            </p>
          }
          analyser={(lignes) => analyserPersonnes(lignes, data, { admin, registre })}
          appliquer={(vals) => {
            const list = derniers(vals);
            update((d) => {
              for (const p of list) {
                const i = d.people.findIndex((x) => x.id === p.id);
                if (i >= 0) d.people[i] = p;
                else d.people.push(p);
              }
            }, `Import CSV : ${pluriel(list.length, 'personne')}`);
            return `${pluriel(list.length, 'personne')} ajoutée(s) ou mise(s) à jour.`;
          }}
        />
      )}
      {sorte === 'taches' && (
        <ImportCsv
          key="taches"
          colonnes={COLS_TACHES}
          modele="modele-taches.csv"
          aide={<p className="muted">Une ligne par tâche. Section, statut et responsables doivent exister dans l’entité (sinon : valeur par défaut, signalée dans l’aperçu). Une tâche de même titre dans la même section n’est pas reprise.</p>}
          analyser={(lignes) => analyserTaches(lignes, data, user?.id ?? '')}
          appliquer={(vals) => {
            update((d) => {
              d.tasks = [...vals, ...d.tasks];
            }, `Import CSV : ${pluriel(vals.length, 'tâche')}`);
            return `${pluriel(vals.length, 'tâche')} ajoutée(s).`;
          }}
        />
      )}
      {sorte === 'evenements' && (
        <ImportCsv
          key="evenements"
          colonnes={COLS_EVENEMENTS}
          modele="modele-evenements.csv"
          aide={<p className="muted">Une ligne par événement. Un événement de même nom à la même date est mis à jour (lieu, description, date de fin).</p>}
          analyser={(lignes) => analyserEvenements(lignes, data)}
          appliquer={(vals) => {
            const list = derniers(vals);
            update((d) => {
              for (const e of list) {
                const i = d.events.findIndex((x) => x.id === e.id);
                if (i >= 0) d.events[i] = e;
                else d.events.push(e);
              }
            }, `Import CSV : ${pluriel(list.length, 'événement')}`);
            return `${pluriel(list.length, 'événement')} ajouté(s) ou mis à jour.`;
          }}
        />
      )}
    </div>
  );
}
