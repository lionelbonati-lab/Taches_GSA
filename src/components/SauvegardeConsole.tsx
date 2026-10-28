import { useRef, useState } from 'react';
import { useStore } from '../data/store';
import { useClubOptional } from '../data/club';
import { backupSummary, downloadSauvegardeClub, lastBackupAt, lireSauvegarde, partieDe, restaurerFichiers, resumeClub, setLastBackupAt } from '../data/backup';
import { copierMaintenant } from '../data/cloud';
import { fmtDateTime, fullName } from '../data/utils';
import { CopiesAuto } from './CopiesAuto';
import { Icone } from './icones';

type Message = { ok: boolean; text: string } | null;

/**
 * Console admin › Sauvegarde : celle de tout le club, dans un seul fichier (super-admins ; démo : admins du comité central),
 * la restauration de l'entité de la console (ses admins), depuis la sauvegarde du club ou celle de l'entité, et les copies
 * du serveur (version réelle).
 */
export function SauvegardeConsole() {
  const { user, restore, cloud } = useStore();
  const club = useClubOptional();
  const nom = club?.current.nom ?? 'l’entité';
  const [busy, setBusy] = useState(false);
  const [msgClub, setMsgClub] = useState<Message>(null);
  const [msg, setMsg] = useState<Message>(null);
  const [last, setLast] = useState(lastBackupAt());
  const fileRef = useRef<HTMLInputElement>(null);

  const telecharger = async () => {
    if (!club?.sauvegardeClub) return;
    setBusy(true);
    setMsgClub({ ok: true, text: 'Préparation de la sauvegarde du club (données et fichiers joints)…' });
    try {
      const s = await club.sauvegardeClub(fullName(user ?? undefined));
      downloadSauvegardeClub(s);
      setLastBackupAt(s.exportedAt);
      setLast(s.exportedAt);
      setMsgClub({ ok: true, text: `✅ Sauvegarde du club téléchargée : ${resumeClub(s)}.` });
    } catch (e) {
      setMsgClub({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const restaurer = async (file?: File) => {
    if (!file) return;
    setMsg(null);
    try {
      const s = await lireSauvegarde(file);
      const b = partieDe(s, club?.current.id ?? '', nom);
      if (!b) throw new Error(`Cette sauvegarde du club ne contient pas « ${nom} ».`);
      const quand = fmtDateTime(b.exportedAt);
      const ou = cloud ? 'pour tous ses membres' : 'dans ce navigateur';
      if (!confirm(`Remplacer toutes les données de « ${nom} » (${ou}) par celles de la sauvegarde du ${quand} ?\n${backupSummary(b)}\n\nLes autres entités ne changent pas.`)) return;
      setBusy(true);
      // Version réelle : l'état actuel est d'abord copié par le serveur (036), pour pouvoir revenir en arrière.
      if (cloud) await copierMaintenant(cloud.membership.committeeId).catch(() => null);
      const echecs = await restaurerFichiers(b.files, cloud?.membership.committeeId);
      restore(b.data, `la sauvegarde du ${quand}`);
      setMsg({ ok: true, text: `✅ « ${nom} » restaurée : ${backupSummary(b)}.${echecs ? ` ${echecs} fichier(s) joint(s) déjà là ou non remis.` : ''}` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <section className="panel backup sauvegarde-club">
        <h2>Sauvegarde du club</h2>
        {club?.sauvegardeClub ? (
          <>
            <p className="muted">
              Un seul fichier avec toutes les entités du club, archivées comprises : tâches, séances, PV, sondages, emails, personnes, rôles, réglages et
              fichiers joints, et « Personnes du club » (sans IBAN).{' '}
              {cloud
                ? 'Le serveur garde en plus une copie de chaque entité chaque nuit (30 jours).'
                : 'Dans la démo, les données ne sont que dans ce navigateur : la sauvegarde sert aussi à passer à un autre appareil, ou à reprendre les données dans la version réelle.'}
            </p>
            <div className="row wrap">
              <button className="btn primary" disabled={busy} onClick={telecharger}><Icone n="telecharger" /> Télécharger la sauvegarde du club</button>
            </div>
            <small className="muted">{last ? `Dernière sauvegarde depuis ce navigateur : ${fmtDateTime(last)}` : 'Aucune sauvegarde téléchargée depuis ce navigateur.'}</small>
            {msgClub && <p className={msgClub.ok ? 'backup-ok' : 'error'}>{msgClub.text}</p>}
          </>
        ) : (
          <p className="muted">La sauvegarde de tout le club se télécharge par un super-admin du club{cloud ? '' : ' (dans la démo : un admin du comité central)'}.</p>
        )}
      </section>
      <section className="panel backup">
        <h2>Restaurer « {nom} »</h2>
        <p className="muted">
          Depuis la sauvegarde du club (seule « {nom} » est remise, les autres entités ne changent pas), ou depuis une sauvegarde de l’entité seule.
          {cloud && ' L’état actuel est d’abord copié par le serveur : tu pourras revenir en arrière (copies automatiques, ci-dessous).'}
        </p>
        <div className="row wrap">
          <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}><Icone n="televerser" /> Restaurer depuis une sauvegarde…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Fichier de sauvegarde" onChange={(e) => restaurer(e.target.files?.[0])} />
        </div>
        {msg && <p className={msg.ok ? 'backup-ok' : 'error'}>{msg.text}</p>}
        {cloud && <CopiesAuto unite={cloud.membership.committeeId} nom={nom} restore={restore} />}
      </section>
    </>
  );
}
