import { useState, type ReactNode } from 'react';
import { decode, downloadCsv, lireTableau, parseCsv, type Colonne } from '../data/csv';

// Import en masse : fichier CSV (Excel, LibreOffice, Google Sheets) ou lignes copiées-collées depuis un tableur,
// avec un modèle à télécharger et un aperçu ligne par ligne avant de valider.

export type Statut = 'nouveau' | 'maj' | 'ignore' | 'erreur';

export interface LigneImport<R> {
  statut: Statut;
  /** Ce que la ligne donne (nom, titre…). */
  texte: string;
  /** Précision : ce qui change, pourquoi elle est ignorée ou refusée. */
  detail?: string;
  avertissements?: string[];
  valeur?: R;
}

const STATUTS: Record<Statut, { label: string; cls: string }> = {
  nouveau: { label: 'Nouveau', cls: 'imp-nouveau' },
  maj: { label: 'Mise à jour', cls: 'imp-maj' },
  ignore: { label: 'Ignoré', cls: 'imp-ignore' },
  erreur: { label: 'Erreur', cls: 'imp-erreur' },
};

export function ImportCsv<K extends string, R>({
  colonnes,
  modele,
  analyser,
  appliquer,
  aide,
}: {
  colonnes: Colonne<K>[];
  /** Nom du fichier modèle (ex. « modele-membres.csv »). */
  modele: string;
  /** Lignes lues → ce que l'import fera de chacune. */
  analyser: (lignes: Record<K, string>[]) => LigneImport<R>[] | Promise<LigneImport<R>[]>;
  /** Enregistre les lignes retenues ; renvoie le message de fin. */
  appliquer: (valeurs: R[]) => Promise<string> | string;
  aide?: ReactNode;
}) {
  const [texte, setTexte] = useState('');
  const [apercu, setApercu] = useState<{ lignes: LigneImport<R>[]; inconnues: string[] } | null>(null);
  const [erreur, setErreur] = useState('');
  const [fini, setFini] = useState('');
  const [busy, setBusy] = useState(false);

  const lire = async (t: string) => {
    setErreur('');
    setFini('');
    const r = lireTableau(parseCsv(t), colonnes);
    if (r.erreur) return setErreur(r.erreur);
    if (!r.lignes.length) return setErreur('Aucune ligne à importer sous la ligne d’en-tête.');
    setBusy(true);
    try {
      setApercu({ lignes: await analyser(r.lignes), inconnues: r.inconnues });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fichier = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5_000_000) return setErreur('Fichier trop lourd (5 Mo au plus).');
    if (/\.xlsx?$/i.test(f.name)) return setErreur('Fichier Excel : enregistre-le d’abord en « CSV » (Fichier › Enregistrer sous), ou copie-colle les lignes ci-dessous.');
    const t = decode(await f.arrayBuffer());
    setTexte(t);
    void lire(t);
  };

  const retenues = apercu?.lignes.filter((l) => (l.statut === 'nouveau' || l.statut === 'maj') && l.valeur !== undefined) ?? [];
  const compte = (s: Statut) => apercu?.lignes.filter((l) => l.statut === s).length ?? 0;

  const valider = async () => {
    setBusy(true);
    setErreur('');
    try {
      setFini(await appliquer(retenues.map((l) => l.valeur as R)));
      setApercu(null);
      setTexte('');
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (fini)
    return (
      <div className="import-csv">
        <p className="import-fini">✅ {fini}</p>
        <button className="btn" onClick={() => setFini('')}>Nouvel import</button>
      </div>
    );

  if (apercu)
    return (
      <div className="import-csv">
        <p className="row wrap import-compte">
          {(['nouveau', 'maj', 'ignore', 'erreur'] as Statut[]).filter(compte).map((s) => (
            <span key={s} className={`imp-badge ${STATUTS[s].cls}`}>{compte(s)} {STATUTS[s].label.toLowerCase()}{compte(s) > 1 && s !== 'maj' ? 's' : ''}</span>
          ))}
        </p>
        {apercu.inconnues.length > 0 && <p className="muted">Colonnes ignorées : {apercu.inconnues.map((c) => `« ${c} »`).join(', ')}.</p>}
        <div className="table-scroll">
          <table className="table import-table">
            <thead><tr><th>Ligne</th><th>Résultat</th><th>Données</th><th>Détail</th></tr></thead>
            <tbody>
              {apercu.lignes.map((l, i) => (
                <tr key={i} className={STATUTS[l.statut].cls}>
                  <td>{i + 2}</td>
                  <td><span className={`imp-badge ${STATUTS[l.statut].cls}`}>{STATUTS[l.statut].label}</span></td>
                  <td>{l.texte}</td>
                  <td>
                    {l.detail}
                    {l.avertissements?.map((a, j) => <small key={j} className="imp-avert">⚠️ {a}</small>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {erreur && <p className="error">{erreur}</p>}
        <div className="row wrap">
          <button className="btn primary" disabled={busy || !retenues.length} onClick={valider}>
            {busy ? 'Import…' : retenues.length ? `Importer ${retenues.length} ligne${retenues.length > 1 ? 's' : ''}` : 'Rien à importer'}
          </button>
          <button className="btn" disabled={busy} onClick={() => setApercu(null)}>← Modifier les données</button>
        </div>
      </div>
    );

  return (
    <div className="import-csv">
      {aide}
      <ul className="import-colonnes">
        {colonnes.map((c) => (
          <li key={c.key}>
            <strong>{c.label}</strong>
            {c.required && <span className="error"> *</span>}
            {c.aide && <small className="muted"> — {c.aide}</small>}
          </li>
        ))}
      </ul>
      <div className="row wrap">
        <button className="btn" onClick={() => downloadCsv(modele, [colonnes.map((c) => c.label), colonnes.map((c) => c.exemple ?? '')])}>⬇️ Télécharger le modèle</button>
        <label className="btn primary">
          📂 Choisir un fichier CSV
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => { void fichier(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      </div>
      <label className="import-coller">
        <span>Ou colle ici les lignes copiées depuis Excel ou Google Sheets (avec la ligne d’en-tête)</span>
        <textarea rows={6} value={texte} placeholder={colonnes.map((c) => c.label).join('\t')} onChange={(e) => setTexte(e.target.value)} />
      </label>
      {erreur && <p className="error">{erreur}</p>}
      <button className="btn primary" disabled={busy || !texte.trim()} onClick={() => lire(texte)}>{busy ? 'Analyse…' : 'Aperçu avant import'}</button>
    </div>
  );
}
