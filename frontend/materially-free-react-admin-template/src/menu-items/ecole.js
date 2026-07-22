import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import ClassIcon from '@mui/icons-material/Class';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GradeIcon from '@mui/icons-material/Grade';
import ArticleIcon from '@mui/icons-material/Article';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import GroupsIcon from '@mui/icons-material/Groups';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import DrawIcon from '@mui/icons-material/Draw';
import LinkIcon from '@mui/icons-material/Link';
import LayersIcon from '@mui/icons-material/Layers';
import SettingsIcon from '@mui/icons-material/Settings';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';

export default function getEcoleMenu(role, hasExamenBlanc = false) {
  if (role === 'ADMIN') {
    return [
      // ─── GROUPE PRINCIPAL (9 pages spec) ──────────────────────
      {
        id: 'ecole-principal',
        title: 'Gestion École',
        type: 'group',
        children: [
          { id: 'classes',          title: 'Classes',          type: 'item', url: '/admin/classes',         icon: LayersIcon,        breadcrumbs: false },
          { id: 'eleves',           title: 'Élèves',           type: 'item', url: '/eleves',                 icon: PeopleIcon,        breadcrumbs: false },
          { id: 'enseignants',      title: 'Enseignants',      type: 'item', url: '/enseignants',            icon: GroupsIcon,        breadcrumbs: false },
          { id: 'cours',            title: 'Matières',         type: 'item', url: '/cours',                  icon: ClassIcon,         breadcrumbs: false },
          { id: 'affectation-cours',title: 'Affectations',     type: 'item', url: '/admin/classe-matieres',  icon: LinkIcon,          breadcrumbs: false },
          { id: 'notes-par-classe', title: 'Notes par Classe', type: 'item', url: '/admin/notes-par-classe', icon: GradeIcon,         breadcrumbs: false },
          { id: 'devoirs-admin',    title: 'Devoirs',          type: 'item', url: '/admin/devoirs',          icon: AssignmentIcon,    breadcrumbs: false },
          { id: 'presences-classe',   title: 'Présences',        type: 'item', url: '/admin/presences-classe',   icon: EventNoteIcon,     breadcrumbs: false },
          { id: 'bulletin',           title: 'Bulletins',        type: 'item', url: '/bulletin',                icon: ArticleIcon,       breadcrumbs: false },
          { id: 'programme-examen-blanc', title: 'Programme Examen Blanc', type: 'item', url: '/admin/programme-examen-blanc', icon: EventNoteIcon, breadcrumbs: false },
          { id: 'bulletin-examen-blanc', title: 'Bulletin Examen Blanc', type: 'item', url: '/admin/bulletin-examen-blanc', icon: WorkspacePremiumIcon, breadcrumbs: false },
          { id: 'emploi-du-temps',    title: 'Emploi du Temps',  type: 'item', url: '/admin/emploi-du-temps',   icon: CalendarMonthIcon, breadcrumbs: false },
        ]
      },
      // ─── GROUPE CONFIGURATION (outils de structure) ────────────
      {
        id: 'ecole-config',
        title: 'Configuration',
        type: 'group',
        children: [
          { id: 'niveaux',        title: 'Niveaux',            type: 'item', url: '/admin/niveaux',        icon: SchoolIcon,        breadcrumbs: false },
          { id: 'annee-scolaire', title: 'Année Scolaire',     type: 'item', url: '/admin/annee-scolaire',  icon: CalendarMonthIcon, breadcrumbs: false },
          { id: 'inscriptions',   title: 'Inscriptions',       type: 'item', url: '/admin/inscriptions',    icon: AssignmentIcon,    breadcrumbs: false },
          { id: 'utilisateurs',   title: 'Comptes',            type: 'item', url: '/admin/utilisateurs',    icon: ManageAccountsIcon,breadcrumbs: false },
          { id: 'parametres',     title: 'Paramètres École',   type: 'item', url: '/admin/parametres',       icon: SettingsIcon,      breadcrumbs: false },
        ]
      }
    ];
  }

  // ─── ENSEIGNANT ───────────────────────────────────────────────
  if (role === 'ENSEIGNANT') {
    return [{
      id: 'ecole-enseignant',
      title: 'Mon Espace',
      type: 'group',
      children: [
        { id: 'mes-cours',          title: 'Mes Cours',           type: 'item', url: '/enseignant/cours',             icon: MenuBookIcon,      breadcrumbs: false },
        { id: 'mes-devoirs',        title: 'Mes Devoirs',         type: 'item', url: '/enseignant/mes-devoirs',       icon: AssignmentIcon,    breadcrumbs: false },
        { id: 'mes-notes',          title: 'Notes',               type: 'item', url: '/enseignant/notes',             icon: GradeIcon,         breadcrumbs: false },
        { id: 'mes-presences',      title: 'Présences',           type: 'item', url: '/enseignant/presences',         icon: EventNoteIcon,     breadcrumbs: false },
        { id: 'mon-emploi-ens',     title: 'Emploi du Temps',     type: 'item', url: '/enseignant/emploi-du-temps',   icon: CalendarMonthIcon, breadcrumbs: false },
        ...(hasExamenBlanc ? [
          { id: 'programme-eb-ens', title: 'Programme Examen Blanc', type: 'item', url: '/programme-examen-blanc', icon: WorkspacePremiumIcon, breadcrumbs: false },
        ] : []),
        { id: 'mon-profil',         title: 'Mon Profil & Signature', type: 'item', url: '/enseignant/mon-profil',      icon: DrawIcon,          breadcrumbs: false },
      ]
    }];
  }

  // ─── ELEVE ────────────────────────────────────────────────────
  if (role === 'ELEVE') {
    return [{
      id: 'ecole-eleve',
      title: 'Mon Espace',
      type: 'group',
      children: [
        { id: 'ma-classe',         title: 'Ma Classe',       type: 'item', url: '/ma-classe',             icon: SchoolIcon,        breadcrumbs: false },
        { id: 'mes-notes-el',      title: 'Mes Notes',       type: 'item', url: '/mes-notes',             icon: GradeIcon,         breadcrumbs: false },
        { id: 'mon-bulletin',      title: 'Mon Bulletin',    type: 'item', url: '/mon-bulletin',          icon: ArticleIcon,       breadcrumbs: false },
        ...(hasExamenBlanc ? [
          { id: 'mon-examen-blanc-el', title: 'Examen Blanc', type: 'item', url: '/mon-examen-blanc', icon: WorkspacePremiumIcon, breadcrumbs: false },
          { id: 'programme-eb-el',     title: 'Programme Examen Blanc', type: 'item', url: '/programme-examen-blanc', icon: EventNoteIcon, breadcrumbs: false },
        ] : []),
        { id: 'mes-presences-el',  title: 'Mes Présences',   type: 'item', url: '/mes-presences',         icon: EventNoteIcon,     breadcrumbs: false },
        { id: 'mon-emploi-eleve',  title: 'Emploi du Temps', type: 'item', url: '/mon-emploi-du-temps',   icon: CalendarMonthIcon, breadcrumbs: false },
      ]
    }];
  }

  // ─── PARENT ───────────────────────────────────────────────────
  if (role === 'PARENT') {
    return [{
      id: 'ecole-parent',
      title: 'Mon Enfant',
      type: 'group',
      children: [
        { id: 'bulletin-enfant',    title: 'Bulletin',        type: 'item', url: '/mon-bulletin',          icon: ArticleIcon,       breadcrumbs: false },
        ...(hasExamenBlanc ? [
          { id: 'examen-blanc-enfant', title: 'Examen Blanc', type: 'item', url: '/mon-examen-blanc', icon: WorkspacePremiumIcon, breadcrumbs: false },
          { id: 'programme-eb-parent', title: 'Programme Examen Blanc', type: 'item', url: '/programme-examen-blanc', icon: EventNoteIcon, breadcrumbs: false },
        ] : []),
        { id: 'notes-enfant',       title: 'Notes',           type: 'item', url: '/mes-notes',             icon: GradeIcon,         breadcrumbs: false },
        { id: 'presences-enfant',   title: 'Présences',       type: 'item', url: '/mes-presences',         icon: EventNoteIcon,     breadcrumbs: false },
        { id: 'emploi-parent',      title: 'Emploi du Temps', type: 'item', url: '/mon-emploi-du-temps',   icon: CalendarMonthIcon, breadcrumbs: false },
      ]
    }];
  }

  return [];
}
