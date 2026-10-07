import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../data/store';
import { useClub } from '../data/club';
import type { Proposition } from '../data/types';
import { libellePage } from '../data/navigation';
import { fmtDate, fullName } from '../data/utils';
import { PageIntro, useNavigation } from '../components/Nav';
import { Empty } from '../components/ui';

// Propositions d'amélioration de l'appli : tout membre du club en envoie au comité central et en suit la réponse ;
// les admins du comité central les reçoivent (données du comité central), les étudient et y répondent.

export const GENRES_PROPOSITION: Record<Proposition['genre'], { icon: string; label: string }> = {
  idee: { icon: '💡', label: 'Idée' },
  probleme: { icon: '🐞', label: 'Problème' },
  autre: { icon: '💬', label: 'Autre' },
};

export const STATUTS_PROPOSITION: Record<Proposition['statut'], { label: string; couleur: string }> = {
  nouvelle: { label: 'Nouvelle', couleur: '#2563eb' },
  etudiee: { label: 'À l’étude', couleur: '#d97706' },
  retenue: { label: 'Retenue', couleur: '#7c3aed' },
  faite: { label: 'Faite', couleur: '#16a34a' },
  refusee: { label: 'Pas retenue', couleur: '#64748b' },
};

const EN_COURS: Proposition['statut'][] = ['nouvelle', 'etudiee', 'retenue'];

/** Admin du comité central, dans le comité central : reçoit et traite les propositions. */
export function useGereLesPropositions() {
  const club = useClub();
  const { can, guest } = useStore();
  return club.current.type === 'central' && !guest && can('admin.access');
}

export function Propositions() {
  const club = useClub();
  const gere = useGereLesPropositions();
  const { setToast } = useStore();
  const { mesPropositions, proposerAmelioration } = club;
  const [mes, setMes] = useState<Proposition[] | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const charger = useCallback(() => {
    mesPropositions()
      .then((l) => {
        setMes(l);
        setErr('');
      })
      .catch((e: Error) => setErr(e.message));
  }, [mesPropositions]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(charger, [club.current.id]);

  return (
    <div className="narrow propositions">
      <h1>Proposer une amélioration</h1>
      <PageIntro />
      {mes === null ? (
        <p className="panel muted">
          La version réelle ne reçoit pas encore les propositions : le comité central doit d’abord mettre le serveur à jour (migration 022).
        </p>
      ) : (
        <Formulaire
          envoyer={async (p) => {
            await proposerAmelioration(p);
            setToast('💡 Merci ! Ta proposition est envoyée au comité central.');
            charger();
          }}
        />
      )}

      {mes !== null && (
        <section>
          <h2>Mes propositions</h2>
          {err && <p className="error">{err}</p>}
          {mes === undefined && !err ? (
            <p className="muted">Chargement…</p>
          ) : mes?.length ? (
            mes.map((p) => <Carte key={p.id} p={p} />)
          ) : (
            <Empty>Tu n’as encore rien proposé. Le comité central te répond ici.</Empty>
          )}
        </section>
      )}

      {gere ? (
        <Recues />
      ) : (
        club.canManage &&
        club.central &&
        club.current.id !== club.central.id && (
          <p className="panel muted">
            Les propositions de tout le club arrivent au comité central.{' '}
            <button className="btn small" onClick={() => club.switchUnit(club.central!.id, '#/propositions')}>
              Les voir au {club.central.nom}
            </button>
          </p>
        )
      )}
    </div>
  );
}

function Formulaire({ envoyer }: { envoyer: (p: { genre: Proposition['genre']; texte: string; page?: string }) => Promise<void> }) {
  const club = useClub();
  const loc = useLocation();
  const { rubriques } = useNavigation();
  // Pages de l'appli, à choisir ; la page d'où l'on vient (menu du compte) est proposée d'office.
  const pages = [...new Set([...rubriques.flatMap((r) => r.pages.map((p) => p.to)), '/organigramme'])];
  const depuis = (loc.state as { depuis?: string } | null)?.depuis;
  const [genre, setGenre] = useState<Proposition['genre']>('idee');
  const [texte, setTexte] = useState('');
  const [page, setPage] = useState(depuis && pages.includes(depuis) ? depuis : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    if (!texte.trim()) return setErr(genre === 'probleme' ? 'Décris le problème.' : 'Écris ta proposition.');
    setBusy(true);
    setErr('');
    try {
      await envoyer({ genre, texte: texte.trim(), page: page || undefined });
      setTexte('');
      setGenre('idee');
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <section className="panel form">
      <fieldset className="full genres-proposition">
        <legend>C’est…</legend>
        {(Object.keys(GENRES_PROPOSITION) as Proposition['genre'][]).map((g) => (
          <label key={g} className={`chip ${genre === g ? 'on' : ''}`}>
            <input type="radio" name="genre" checked={genre === g} onChange={() => setGenre(g)} />
            {GENRES_PROPOSITION[g].icon} {GENRES_PROPOSITION[g].label}
          </label>
        ))}
      </fieldset>
      <label className="full">
        {genre === 'probleme' ? 'Qu’est-ce qui ne marche pas ?' : 'Ta proposition'}
        <textarea
          rows={5}
          maxLength={4000}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={
            genre === 'probleme'
              ? 'Ce que tu faisais, ce qui s’est passé, ce que tu attendais… (sur téléphone ou ordinateur ?)'
              : 'Ce qui te simplifierait la vie, ce qui manque, ce qui pourrait être plus clair…'
          }
        />
      </label>
      <label>
        Page concernée
        <select value={page} onChange={(e) => setPage(e.target.value)}>
          <option value="">Toute l’appli</option>
          {pages.map((to) => <option key={to} value={to}>{libellePage(to)}</option>)}
        </select>
      </label>
      <p className="muted small-note full">
        Envoyée au comité central, avec ton nom et ton entité ({club.current.nom}). Tu en suis la réponse ci-dessous.
      </p>
      {err && <p className="error full">{err}</p>}
      <div className="full row">
        <span className="grow" />
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? 'Envoi…' : 'Envoyer'}</button>
      </div>
    </section>
  );
}

const Statut = ({ p }: { p: Proposition }) =>
  p.supprimee ? (
    <span className="badge" style={{ background: '#64748b' }}>Retirée</span>
  ) : (
    <span className="badge" style={{ background: STATUTS_PROPOSITION[p.statut]?.couleur ?? '#64748b' }}>{STATUTS_PROPOSITION[p.statut]?.label ?? p.statut}</span>
  );

/** Une proposition et la réponse du comité central (suivi de l'auteur). */
function Carte({ p }: { p: Proposition }) {
  const g = GENRES_PROPOSITION[p.genre] ?? GENRES_PROPOSITION.autre;
  return (
    <div className={`panel request proposition ${p.supprimee || p.statut === 'faite' || p.statut === 'refusee' ? 'done' : ''}`}>
      <span className="request-top">
        <span className="proposition-texte">{g.icon} {p.texte}</span>
        <Statut p={p} />
      </span>
      <small className="muted">
        {g.label} · envoyée le {fmtDate(p.le.slice(0, 10))}
        {p.page && ` · ${libellePage(p.page)}`}
      </small>
      {p.reponse && (
        <blockquote className="proposition-reponse">
          <small className="muted">Réponse du comité central{p.reponduPar && ` (${p.reponduPar}`}{p.reponduLe && `${p.reponduPar ? ', ' : ' ('}${fmtDate(p.reponduLe.slice(0, 10))}`}{(p.reponduPar || p.reponduLe) && ')'} :</small>
          <span>{p.reponse}</span>
        </blockquote>
      )}
    </div>
  );
}

/** Comité central : propositions reçues de tout le club, à étudier et à traiter. */
function Recues() {
  const { data } = useStore();
  const [filtre, setFiltre] = useState<'encours' | 'toutes' | Proposition['statut']>('encours');
  const toutes = [...(data.propositions ?? [])].sort((a, b) => b.le.localeCompare(a.le));
  const liste = toutes.filter((p) => (filtre === 'toutes' ? true : filtre === 'encours' ? EN_COURS.includes(p.statut) : p.statut === filtre));
  const nouvelles = toutes.filter((p) => p.statut === 'nouvelle').length;
  return (
    <section className="propositions-recues">
      <h2 className="with-action">
        <span>📥 Propositions reçues {nouvelles > 0 && <span className="badge" style={{ background: STATUTS_PROPOSITION.nouvelle.couleur }}>{nouvelles} nouvelle{nouvelles > 1 ? 's' : ''}</span>}</span>
        <select value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} aria-label="Propositions à afficher">
          <option value="encours">En cours</option>
          <option value="toutes">Toutes ({toutes.length})</option>
          {(Object.keys(STATUTS_PROPOSITION) as Proposition['statut'][]).map((s) => (
            <option key={s} value={s}>{STATUTS_PROPOSITION[s].label} ({toutes.filter((p) => p.statut === s).length})</option>
          ))}
        </select>
      </h2>
      <p className="muted small-note">De tous les membres du club. Le statut et la réponse s’affichent chez l’auteur, dans « Mes propositions ».</p>
      {liste.length ? liste.map((p) => <Traiter key={p.id} p={p} />) : <Empty>{toutes.length ? 'Rien dans cette liste.' : 'Aucune proposition pour l’instant.'}</Empty>}
    </section>
  );
}

function Traiter({ p }: { p: Proposition }) {
  const { update, user } = useStore();
  const [reponse, setReponse] = useState(p.reponse ?? '');
  useEffect(() => setReponse(p.reponse ?? ''), [p.reponse]);
  const g = GENRES_PROPOSITION[p.genre] ?? GENRES_PROPOSITION.autre;
  const court = p.texte.length > 60 ? `${p.texte.slice(0, 57)}…` : p.texte;
  const modifier = (patch: Partial<Proposition>, action: string) =>
    update((d) => {
      d.propositions = (d.propositions ?? []).map((x) => (x.id === p.id ? { ...x, ...patch } : x));
    }, action);
  return (
    <div className={`panel request proposition ${p.statut === 'faite' || p.statut === 'refusee' ? 'done' : ''}`}>
      <span className="request-top">
        <span className="proposition-texte">{g.icon} {p.texte}</span>
        <Statut p={p} />
      </span>
      <small className="muted">
        {g.label} · {p.par}{p.unite && ` (${p.unite})`} · le {fmtDate(p.le.slice(0, 10))}
        {p.page && ` · ${libellePage(p.page)}`}
      </small>
      <div className="proposition-actions">
        <label>
          Statut
          <select
            value={p.statut}
            onChange={(e) => {
              const s = e.target.value as Proposition['statut'];
              modifier({ statut: s }, `Proposition « ${court} » (${p.par}) : ${STATUTS_PROPOSITION[s].label.toLowerCase()}`);
            }}
          >
            {(Object.keys(STATUTS_PROPOSITION) as Proposition['statut'][]).map((s) => <option key={s} value={s}>{STATUTS_PROPOSITION[s].label}</option>)}
          </select>
        </label>
        <label className="grow">
          Réponse à {p.par}
          <textarea rows={2} maxLength={4000} value={reponse} onChange={(e) => setReponse(e.target.value)} placeholder="Merci ! On regarde ça pour… (facultatif)" />
        </label>
      </div>
      <div className="row">
        <button
          className="btn small danger"
          onClick={() => {
            if (!window.confirm(`Supprimer la proposition « ${court} » ? ${p.par} la verra comme retirée.`)) return;
            update((d) => {
              d.propositions = (d.propositions ?? []).filter((x) => x.id !== p.id);
            }, `Proposition « ${court} » (${p.par}) supprimée`);
          }}
        >
          Supprimer
        </button>
        <span className="grow" />
        <button
          className="btn small primary"
          disabled={reponse.trim() === (p.reponse ?? '')}
          onClick={() =>
            modifier(
              reponse.trim()
                ? { reponse: reponse.trim(), reponduLe: new Date().toISOString(), reponduPar: fullName(user ?? undefined), statut: p.statut === 'nouvelle' ? 'etudiee' : p.statut }
                : { reponse: undefined, reponduLe: undefined, reponduPar: undefined },
              `Réponse à la proposition « ${court} » (${p.par})`,
            )
          }
        >
          Enregistrer la réponse
        </button>
      </div>
    </div>
  );
}
