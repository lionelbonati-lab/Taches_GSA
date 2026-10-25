import type { ComponentType, SVGProps } from 'react';
import {
  Archive, ArrowDown, ArrowLeftRight, ArrowUp, Ban, Bell, BookUser, CalendarDays, CalendarPlus, CalendarRange, ChartColumn, Check,
  CircleCheck, CircleHelp, CircleStop, CircleUser, ClipboardCopy, ClipboardList, Columns3, Copy, DatabaseBackup, Download, Eye, FileDown, FileText,
  FileUp, FlaskConical, FolderInput, FolderOpen, Hand, Handshake, House, KeyRound, Lightbulb, Link, ListChecks, LoaderCircle, Lock, LogOut, Mail,
  MailPlus, Maximize2, Menu, Merge, MessageCircle, MessageSquarePlus, Minimize2, Move, Network, NotebookPen, Palette, PartyPopper, Paperclip, Pencil, Pin,
  Play, Printer, Puzzle, RefreshCw, Repeat, RotateCcw, Save, ScrollText, Send, Settings, Share2, ShieldCheck, ShieldHalf, Signature,
  Smartphone, Sparkles, SquareCheckBig, Stamp, Undo2, Upload, UserLock, UserX, Users, Calendar, Camera, CreditCard, Receipt, FolderTree, PanelTop, History,
  MapPin, Search, LocateFixed, Redo2, GripVertical,
} from 'lucide-react';

// Icônes des boutons, dessinées au trait (bibliothèque Lucide, licence ISC), de la couleur du texte et à sa taille.
// Les repères de contenu (types d'entités, 🔁 🤝 📌 dans les listes, états des paiements…) restent des émojis.

type Svg = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean }>;

/** Poubelle (couvercle à poignée, trois rainures) : dessinée ici, d'après le modèle choisi par le club. */
const Poubelle: Svg = ({ size = 24, strokeWidth = 2, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9.2 4.6 10.6 2.6h2.8l1.4 2" />
    <path d="M3.4 8.2V6.6a2 2 0 0 1 2-2h13.2a2 2 0 0 1 2 2v1.6Z" />
    <path d="M5 8.2 6.3 21.4h11.4L19 8.2" />
    <path d="M8.8 11.2 9.3 18.4M12 11.2v7.2M15.2 11.2l-.5 7.2" />
  </svg>
);

export const ICONES = {
  // Navigation
  accueil: House,
  taches: SquareCheckBig,
  calendrier: Calendar,
  evenements: PartyPopper,
  seances: CalendarRange,
  odj: ClipboardList,
  pv: NotebookPen,
  sondage: ChartColumn,
  membres: BookUser,
  reglages: Settings,
  admin: ShieldHalf,
  cle: KeyRound,
  comptes: UserLock,
  idee: Lightbulb,
  aide: CircleHelp,
  menu: Menu,
  compte: CircleUser,
  sortir: LogOut,
  changer: RefreshCw,
  cloche: Bell,
  installer: Smartphone,
  organigramme: Network,
  remboursement: Receipt,
  facture: CreditCard,
  rangement: FolderTree,
  entete: PanelTop,
  historique: History,
  // Actions
  supprimer: Poubelle,
  modifier: Pencil,
  enregistrer: Save,
  monter: ArrowUp,
  descendre: ArrowDown,
  partager: Share2,
  dupliquer: Copy,
  copier: ClipboardCopy,
  valider: CircleCheck,
  ok: Check,
  signer: Signature,
  notes: NotebookPen,
  note: MessageSquarePlus,
  telecharger: Download,
  televerser: Upload,
  importer: FileUp,
  exporter: FileDown,
  imprimer: Printer,
  pdf: FileText,
  attente: LoaderCircle,
  email: Mail,
  programmer: MailPlus,
  envoyer: Send,
  message: MessageCircle,
  lien: Link,
  fusionner: Merge,
  personnes: Users,
  main: Hand,
  refuser: Ban,
  absent: UserX,
  verrou: Lock,
  archives: Archive,
  archiver: FolderInput,
  demo: FlaskConical,
  recharger: RefreshCw,
  revenir: RotateCcw,
  annuler: Undo2,
  refaire: Redo2,
  poignee: GripVertical,
  sauvegarde: DatabaseBackup,
  fichier: Paperclip,
  dossier: FolderOpen,
  photo: Camera,
  pleinEcran: Maximize2,
  quitterPleinEcran: Minimize2,
  deplacer: Move,
  echanger: ArrowLeftRight,
  rattacher: Puzzle,
  epingle: Pin,
  date: Calendar,
  ajouterSeance: CalendarPlus,
  agendaClub: CalendarDays,
  sceau: Stamp,
  verifier: ShieldCheck,
  colonnes: Columns3,
  demarrer: Play,
  terminer: CircleStop,
  miseEnForme: Palette,
  voir: Eye,
  anciennes: ScrollText,
  nouveau: Sparkles,
  checklist: ListChecks,
  repetition: Repeat,
  partage: Handshake,
  lieu: MapPin,
  rechercher: Search,
  position: LocateFixed,
} satisfies Record<string, Svg>;

export type IconeNom = keyof typeof ICONES;

/** Icône d'un bouton, alignée sur le texte qui la suit. */
export function Icone({ n, className = '' }: { n: IconeNom; className?: string }) {
  const I: Svg = ICONES[n];
  return <I className={`icone-trait ${n === 'attente' ? 'tourne' : ''} ${className}`} size="1.2em" strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
