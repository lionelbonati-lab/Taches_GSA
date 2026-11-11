import { useMemo, useState } from 'react';
import { PageIntro } from '../components/Nav';
import { Icone } from '../components/icones';
import { AjoutAutreJour, ReglagesCompteur, useMaintenant } from '../components/Compteur';
import { useCompteur } from '../data/compteurEtat';
import {
  DUREE_MAX_MS, LIBELLE_MAX, decalerJour, depuisChampHeure, dureeEntree, fmtDuree, fmtHeure, fmtJour, jourDe, jourEntree,
  lignesCsv, lundiDe, parJour, parLibelle, totalEntre, totaux, versChampHeure, type EntreeTemps, type Jour,
} from '../data/compteur';
import { downloadCsv } from '../data/csv';

// Page « Mon temps » (menu du compte) : le compteur de temps personnel en détail (PLAN_COMPTEUR_TEMPS.md). Pour soi
// seul : totaux, semaine / mois / année, chaque entrée (corriger, retirer), export CSV, tout effacer.

type Periode = 'semaine' | 'mois' | 'annee';

const MOIS = (j: string, o: Intl.DateTimeFormatOptions) => new Date(`${j}T12:00:00`).toLocaleDateString('fr-CH', o);
const finDuMois = (j: string) => decalerJour(`${decalerJour(`${j.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);

/** Bornes de la période qui contient `j`, son nom, et ses barres (jours, semaines ou mois). */
function bornes(p: Periode, j: string) {
  if (p === 'semaine') {
    const du = lundiDe(j);
    const au = decalerJour(du, 6);
    const memeMois = du.slice(0, 7) === au.slice(0, 7);
    const nom = `Semaine du ${MOIS(du, memeMois ? { day: 'numeric' } : { day: 'numeric', month: 'long' })} au ${MOIS(au, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const barres = Array.from({ length: 7 }, (_, i) => {
      const d = decalerJour(du, i);
      return { nom: MOIS(d, { weekday: 'short', day: 'numeric' }), du: d, au: d };
    });
    return { du, au, nom, barres, avant: decalerJour(du, -7), apres: decalerJour(du, 7) };
  }
  if (p === 'mois') {
    const du = `${j.slice(0, 7)}-01`;
    const au = finDuMois(du);
    const barres = [];
    for (let l = lundiDe(du); l <= au; l = decalerJour(l, 7)) {
      const a = l < du ? du : l;
      const b = decalerJour(l, 6) > au ? au : decalerJour(l, 6);
      barres.push({ nom: `${MOIS(a, { day: 'numeric' })}–${MOIS(b, { day: 'numeric', month: 'short' })}`, du: a, au: b });
    }
    const nom = MOIS(du, { month: 'long', year: 'numeric' });
    return { du, au, nom: nom.charAt(0).toUpperCase() + nom.slice(1), barres, avant: decalerJour(du, -1), apres: decalerJour(au, 1) };
  }
  const an = j.slice(0, 4);
  const barres = Array.from({ length: 12 }, (_, i) => {
    const d = `${an}-${String(i + 1).padStart(2, '0')}-01`;
    return { nom: MOIS(d, { month: 'short' }), du: d, au: finDuMois(d) };
  });
  return { du: `${an}-01-01`, au: `${an}-12-31`, nom: an, barres, avant: `${Number(an) - 1}-06-01`, apres: `${Number(an) + 1}-06-01` };
}

export function MonTemps() {
  const { entrees, reglages, enCours, magasin } = useCompteur();
  const now = useMaintenant(enCours ? 15_000 : 60_000);
  const auj = jourDe(now);
  const [periode, setPeriode] = useState<Periode>('semaine');
  const [jour, setJour] = useState(auj);
  const [ajout, setAjout] = useState(false);
  const jours = useMemo(() => parJour(entrees, now), [entrees, now]);
  const t = totaux(jours, now);
  const b = bornes(periode, jour);
  const totalPeriode = totalEntre(jours, b.du, b.au);
  const valeurs = b.barres.map((x) => totalEntre(jours, x.du, x.au));
  const max = Math.max(...valeurs, 1);
  const libelles = parLibelle(entrees, b.du, b.au, now);
  const avecLibelle = libelles.some(([l]) => l);
  const aujourdhuiDedans = auj >= b.du && auj <= b.au;
  const vide = entrees.length === 0;

  const exporter = () => downloadCsv(`mon-temps-${auj}.csv`, lignesCsv(entrees, now));
  const effacer = () => {
    if (confirm('Effacer tout l’historique de ton compteur, sur tous tes appareils ? Ce ne peut pas être annulé (télécharge d’abord le fichier CSV si tu veux le garder).')) magasin.toutEffacer();
  };

  return (
    <div className="narrow mon-temps">
      <h1><Icone n="chrono" /> Mon temps</h1>
      <PageIntro />
      <section className="panel">
        <h2>Mon compteur de temps</h2>
        <ReglagesCompteur />
      </section>

      {(!vide || reglages.actif) && (
        <>
          <section className="mon-temps-tuiles" aria-label="Totaux">
            {([['Aujourd’hui', t.jour], ['Cette semaine', t.semaine], ['Ce mois', t.mois], ['Cette année', t.annee]] as const).map(([n, v]) => (
              <div key={n} className="mon-temps-tuile"><small>{n}</small><strong>{fmtDuree(v)}</strong></div>
            ))}
          </section>

          <section className="panel">
            <div className="mon-temps-periode">
              <span className="mon-temps-onglets" role="group" aria-label="Période">
                {(['semaine', 'mois', 'annee'] as const).map((p) => (
                  <button key={p} className={`btn small ${periode === p ? 'on' : ''}`} aria-pressed={periode === p} onClick={() => setPeriode(p)}>
                    {p === 'semaine' ? 'Semaine' : p === 'mois' ? 'Mois' : 'Année'}
                  </button>
                ))}
              </span>
              <span className="mon-temps-nav">
                <button className="btn small" onClick={() => setJour(b.avant)} aria-label="Période précédente">‹</button>
                <strong>{b.nom}</strong>
                <button className="btn small" onClick={() => setJour(b.apres)} disabled={b.apres > auj} aria-label="Période suivante">›</button>
                {!aujourdhuiDedans && <button className="btn link small" onClick={() => setJour(auj)}>Aujourd’hui</button>}
              </span>
            </div>
            <p className="mon-temps-total">Total : <b>{fmtDuree(totalPeriode)}</b></p>
            <ul className="mon-temps-barres">
              {b.barres.map((x, i) => (
                <li key={x.du} className={auj >= x.du && auj <= x.au ? 'auj' : ''}>
                  <span className="mon-temps-barre-nom">{x.nom}</span>
                  <span className="mon-temps-barre"><span style={{ width: `${(valeurs[i] / max) * 100}%` }} /></span>
                  <span className="mon-temps-barre-val">{valeurs[i] ? fmtDuree(valeurs[i]) : '–'}</span>
                </li>
              ))}
            </ul>
            {avecLibelle && (
              <>
                <h3>Par libellé</h3>
                <ul className="mon-temps-libelles">
                  {libelles.map(([l, v]) => <li key={l || '-'}><span>{l || <i className="muted">Sans libellé</i>}</span><b>{fmtDuree(v)}</b></li>)}
                </ul>
                {reglages.auto && <small className="muted">Le temps automatique n’a pas de libellé : il n’est compté que dans les totaux.</small>}
              </>
            )}
          </section>

          <section className="panel">
            <div className="row wrap mon-temps-actions">
              <h2 className="grow">Détail</h2>
              <button className="btn small" onClick={() => setAjout(!ajout)}>+ Ajouter du temps</button>
            </div>
            {ajout && <AjoutAutreJour onDone={() => setAjout(false)} />}
            {periode === 'annee' ? (
              <p className="muted">Choisis une semaine ou un mois pour voir le détail.</p>
            ) : (
              <Detail entrees={entrees} jours={jours} du={b.du} au={b.au} now={now} />
            )}
          </section>

          <section className="panel">
            <h2>Mes données</h2>
            <p className="muted">Tout ton compteur, entrée par entrée, dans un fichier pour un tableur (CSV). Il n’est pas dans la sauvegarde du club : garde ce fichier si tu veux une copie.</p>
            <div className="row wrap">
              <button className="btn" onClick={exporter} disabled={vide}><Icone n="telecharger" /> Exporter (CSV)</button>
              <button className="btn danger" onClick={effacer} disabled={vide}><Icone n="supprimer" /> Tout effacer…</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Les jours de la période, du plus récent au plus ancien : leurs entrées (compteur, ajouts) et le temps automatique. */
function Detail({ entrees, jours, du, au, now }: { entrees: EntreeTemps[]; jours: Map<string, Jour>; du: string; au: string; now: number }) {
  const { magasin } = useCompteur();
  const [edition, setEdition] = useState<string | null>(null);
  const parJ = new Map<string, EntreeTemps[]>();
  for (const e of entrees) {
    const j = jourEntree(e);
    if (j >= du && j <= au) parJ.set(j, [...(parJ.get(j) ?? []), e]);
  }
  const liste = [...parJ.keys()].sort().reverse();
  if (!liste.length) return <p className="muted">Rien de compté sur cette période.</p>;
  const quand = (e: EntreeTemps) => e.debut ?? e.le ?? '';
  return (
    <div className="mon-temps-detail">
      {liste.map((j) => {
        const es = parJ.get(j)!.filter((e) => e.sorte !== 'auto').sort((a, b) => quand(b).localeCompare(quand(a)));
        const autos = parJ.get(j)!.filter((e) => e.sorte === 'auto');
        const x = jours.get(j);
        return (
          <div key={j} className="mon-temps-jour">
            <h3>{fmtJour(j)}<span className="muted"> · {fmtDuree(x?.total ?? 0)}</span></h3>
            <ul>
              {es.map((e) =>
                edition === e.id ? (
                  <li key={e.id}><EditionEntree e={e} onDone={() => setEdition(null)} /></li>
                ) : (
                  <li key={e.id} className="mon-temps-entree">
                    <span className="mon-temps-quoi">
                      <span>
                        {e.sorte === 'compteur' ? (
                          <><Icone n="chrono" /> {fmtHeure(e.debut!)} – {e.fin ? `${fmtHeure(e.fin)}${jourDe(Date.parse(e.fin)) !== j ? ` (${MOIS(jourDe(Date.parse(e.fin)), { day: 'numeric', month: 'short' })})` : ''}` : <b>en cours</b>}</>
                        ) : (
                          <>{(e.minutes ?? 0) < 0 ? '− Retrait' : '＋ Ajout'}</>
                        )}
                      </span>
                      {e.libelle && <small className="mon-temps-libelle">{e.libelle}</small>}
                    </span>
                    <b className="mon-temps-duree">{fmtDuree(dureeEntree(e, now))}</b>
                    <button className="icon-btn" onClick={() => setEdition(e.id)} aria-label="Corriger" title="Corriger"><Icone n="modifier" /></button>
                    <button className="icon-btn" onClick={() => confirm('Retirer cette entrée ?') && magasin.retirer([e.id])} aria-label="Retirer" title="Retirer"><Icone n="supprimer" /></button>
                  </li>
                ),
              )}
              {autos.length > 0 && (
                <li className="mon-temps-entree auto">
                  <span className="mon-temps-quoi"><span><Icone n="auto" /> Automatique</span><small className="mon-temps-libelle">Temps dans l’appli, hors compteur</small></span>
                  <b className="mon-temps-duree">{fmtDuree(x?.auto ?? 0)}</b>
                  <button
                    className="icon-btn"
                    onClick={() => confirm('Retirer le temps automatique de ce jour ?') && magasin.retirer(autos.map((a) => a.id))}
                    aria-label="Retirer le temps automatique"
                    title="Retirer le temps automatique de ce jour"
                  >
                    <Icone n="supprimer" />
                  </button>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Corriger une entrée : début et fin d'un compteur (début seul s'il tourne), jour et minutes d'un ajout ; libellé. */
function EditionEntree({ e, onDone }: { e: EntreeTemps; onDone: () => void }) {
  const { magasin } = useCompteur();
  const [debut, setDebut] = useState(e.debut ? versChampHeure(e.debut) : '');
  const [fin, setFin] = useState(e.fin ? versChampHeure(e.fin) : '');
  const [jour, setJour] = useState(e.jour ?? '');
  const [minutes, setMinutes] = useState(e.minutes ?? 0);
  const [libelle, setLibelle] = useState(e.libelle ?? '');
  const now = Date.now();
  let erreur = '';
  let suivante: EntreeTemps;
  if (e.sorte === 'ajout') {
    if (!jour || jour > jourDe(now)) erreur = 'Choisis un jour passé.';
    else if (!minutes || Math.abs(minutes) > 24 * 60) erreur = 'Entre 1 et 1440 minutes (négatif : temps retiré).';
    suivante = { ...e, jour, minutes, libelle };
  } else {
    const d = depuisChampHeure(debut);
    const f = e.fin ? depuisChampHeure(fin) : undefined;
    const finMs = f ? Date.parse(f) : now;
    if (!d || Date.parse(d) > now) erreur = 'Le début ne peut pas être dans le futur.';
    else if (f !== undefined && (!f || finMs <= Date.parse(d))) erreur = 'La fin doit venir après le début.';
    else if (f && finMs > now + 60_000) erreur = 'La fin ne peut pas être dans le futur.';
    else if (f && finMs - Date.parse(d) > DUREE_MAX_MS) erreur = 'Une plage dure 24 h au plus.';
    suivante = { ...e, debut: d, ...(f ? { fin: f } : {}), libelle };
  }
  const enregistrer = () => {
    if (erreur) return;
    if (!suivante.libelle?.trim()) delete suivante.libelle;
    magasin.ecrireEntree(suivante);
    onDone();
  };
  return (
    <div className="compteur-autre-jour mon-temps-edition">
      {e.sorte === 'ajout' ? (
        <>
          <label>Jour<input type="date" value={jour} max={jourDe(now)} onChange={(x) => setJour(x.target.value)} /></label>
          <label>Minutes<input type="number" value={minutes} min={-1440} max={1440} onChange={(x) => setMinutes(Math.round(Number(x.target.value) || 0))} /></label>
        </>
      ) : (
        <>
          <label>Début<input type="datetime-local" value={debut} onChange={(x) => setDebut(x.target.value)} /></label>
          {e.fin && <label>Fin<input type="datetime-local" value={fin} onChange={(x) => setFin(x.target.value)} /></label>}
        </>
      )}
      <label>Sur quoi ?<input value={libelle} maxLength={LIBELLE_MAX} placeholder="(facultatif)" onChange={(x) => setLibelle(x.target.value)} /></label>
      {erreur && <small className="compteur-alerte">{erreur}</small>}
      <span className="row">
        <button className="btn primary small" disabled={!!erreur} onClick={enregistrer}>Enregistrer</button>
        <button className="btn small" onClick={onDone}>Annuler</button>
      </span>
    </div>
  );
}
