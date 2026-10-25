import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PointGeo } from '../data/types';
import { arrondir } from '../data/lieux';
import { Icone } from './icones';

// Carte du lieu d'une séance (Leaflet, licence BSD-2 ; fond de carte OpenStreetMap) : un clic place l'épingle, on la
// glisse pour l'ajuster. Recherche d'adresse (Nominatim d'OpenStreetMap), seulement sur demande. Chargée à l'ouverture.

/** Sans lieu placé jusqu'ici : l'Ajoie. */
const DEPART: PointGeo = { lat: 47.415, lng: 7.075 };

// Épingle dessinée au trait comme les icônes de l'appli (Lucide « map-pin »), de sa couleur, détourée de blanc pour
// rester lisible sur le fond de carte.
const PIN = 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';
const epingle = L.divIcon({
  className: 'carte-epingle',
  html:
    '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    `<path d="${PIN}" stroke="#fff" stroke-width="4.5"/><path d="${PIN}" fill="#fff" stroke="currentColor" stroke-width="2"/>` +
    '<circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/></svg>',
  iconSize: [40, 40],
  iconAnchor: [20, 37],
});

interface Resultat {
  nom: string;
  p: PointGeo;
}

export default function CarteLieu({ point, centre, recherche, onChange }: {
  point?: PointGeo;
  /** Centre sans épingle (dernier lieu placé). */
  centre?: PointGeo;
  /** Texte proposé pour la recherche (le lieu saisi). */
  recherche?: string;
  onChange: (p?: PointGeo) => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const marqueur = useRef<L.Marker | null>(null);
  const changer = useRef(onChange);
  changer.current = onChange;
  const [q, setQ] = useState(recherche && !/^à définir$/i.test(recherche.trim()) ? recherche.trim() : '');
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [etat, setEtat] = useState('');

  useEffect(() => {
    const depart = point ?? centre ?? DEPART;
    const m = L.map(boite.current!).setView([depart.lat, depart.lng], point ? 17 : centre ? 14 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => changer.current(arrondir({ lat: e.latlng.lat, lng: e.latlng.lng })));
    carte.current = m;
    // La carte apparaît dans une fenêtre qui s'ouvre : sa taille est relue quand elle change.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(boite.current!);
    return () => {
      ro.disconnect();
      m.remove();
      carte.current = null;
      marqueur.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L'épingle suit le point (clic, glisser, recherche, lieu déjà connu choisi dans la fiche).
  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    if (!point) {
      marqueur.current?.remove();
      marqueur.current = null;
      return;
    }
    const ll = L.latLng(point.lat, point.lng);
    if (!marqueur.current) {
      const mk = L.marker(ll, { icon: epingle, draggable: true, title: 'Lieu de la séance : glisse l’épingle pour l’ajuster' }).addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLatLng();
        changer.current(arrondir({ lat: p.lat, lng: p.lng }));
      });
      marqueur.current = mk;
    } else marqueur.current.setLatLng(ll);
    if (!m.getBounds().contains(ll)) m.setView(ll, Math.max(m.getZoom(), 16));
  }, [point?.lat, point?.lng]);

  const choisir = (r: Resultat) => {
    changer.current(r.p);
    carte.current?.setView([r.p.lat, r.p.lng], 17);
    setResultats([]);
    setEtat('');
  };
  const chercher = async () => {
    const texte = q.trim();
    if (!texte) return;
    setEtat('Recherche…');
    setResultats([]);
    try {
      // Résultats proches de la vue actuelle en premier.
      const b = carte.current?.getBounds();
      const params = new URLSearchParams({ format: 'jsonv2', limit: '5', 'accept-language': 'fr', q: texte });
      if (b) params.set('viewbox', [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].map((x) => x.toFixed(4)).join(','));
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      if (!r.ok) throw new Error(String(r.status));
      const liste = ((await r.json()) as { display_name: string; lat: string; lon: string }[]).map((x) => ({ nom: x.display_name, p: arrondir({ lat: Number(x.lat), lng: Number(x.lon) }) }));
      if (liste.length === 1) choisir(liste[0]);
      else {
        setResultats(liste);
        setEtat(liste.length ? 'Choisis le bon résultat :' : 'Aucun résultat : place l’épingle d’un clic sur la carte.');
      }
    } catch {
      setEtat('Recherche impossible (hors ligne ?) : place l’épingle d’un clic sur la carte.');
    }
  };
  const maPosition = () => {
    setEtat('Recherche de ta position…');
    navigator.geolocation.getCurrentPosition(
      (pos) => choisir({ nom: '', p: arrondir({ lat: pos.coords.latitude, lng: pos.coords.longitude }) }),
      () => setEtat('Position indisponible (autorisation refusée ?).'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="carte-lieu">
      <div className="carte-recherche">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              chercher();
            }
          }}
          placeholder="Adresse ou nom du lieu"
          aria-label="Adresse ou nom du lieu à chercher"
        />
        <button type="button" className="btn small" onClick={chercher} disabled={!q.trim()}><Icone n="rechercher" /> Chercher</button>
        {'geolocation' in navigator && <button type="button" className="btn small" onClick={maPosition} title="Placer l’épingle là où je suis"><Icone n="position" /> Ma position</button>}
      </div>
      {etat && <p className="muted small" aria-live="polite">{etat}</p>}
      {resultats.length > 0 && (
        <ul className="carte-resultats">
          {resultats.map((r) => (
            <li key={`${r.p.lat},${r.p.lng}`}><button type="button" className="btn link" onClick={() => choisir(r)}>{r.nom}</button></li>
          ))}
        </ul>
      )}
      <div ref={boite} className="carte-boite" />
      <p className="muted small">Un clic sur la carte place l’épingle ; glisse-la pour l’ajuster.</p>
    </div>
  );
}
