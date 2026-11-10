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
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import DrawIcon from '@mui/icons-material/Draw';
import LayersIcon from '@mui/icons-material/Layers';
import SettingsIcon from '@mui/icons-material/Settings';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PaymentsIcon from '@mui/icons-material/Payments';
import SmsIcon from '@mui/icons-material/Sms';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import BackupIcon from '@mui/icons-material/Backup';
import QuizIcon from '@mui/icons-material/Quiz';
import HomeWorkIcon from '@mui/icons-material/HomeWork';
import BadgeIcon from '@mui/icons-material/Badge';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import CampaignIcon from '@mui/icons-material/Campaign';
import InsightsIcon from '@mui/icons-material/Insights';
import LanguageIcon from '@mui/icons-material/Language';
import WallpaperIcon from '@mui/icons-material/Wallpaper';
import ConstructionIcon from '@mui/icons-material/Construction';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import HistoryIcon from '@mui/icons-material/History';
import FileCopyIcon from '@mui/icons-material/FileCopy';

const item = (id, title, url, icon) => ({ id, title, type: 'item', url, icon, breadcrumbs: false });
const groupe = (id, title, children) => ({ id, title, type: 'group', children });

export default function getEcoleMenu(role, hasExamenBlanc = false, cumuls = []) {
  // Petites écoles : la même personne secrétaire + comptable voit les deux menus, chaque page une seule fois
  const autres = cumuls.filter((r) => r !== role);
  if (autres.length) {
    const vues = new Set();
    return [role, ...autres]
      .flatMap((r) => getEcoleMenu(r, hasExamenBlanc))
      .map((g) => ({ ...g, children: g.children.filter((c) => !vues.has(c.url) && vues.add(c.url)) }))
      .filter((g) => g.children.length > 0);
  }

  if (role === 'SUPER_ADMIN') {
    return [{
      id: 'etablissements-groupe',
      title: 'Établissements',
      type: 'group',
      children: [
        { id: 'etablissements', title: 'Établissements', type: 'item', url: '/plateforme/ecoles', icon: SchoolIcon, breadcrumbs: false },
        { id: 'comptes-plateforme', title: 'Comptes utilisateurs', type: 'item', url: '/plateforme/comptes', icon: ManageAccountsIcon, breadcrumbs: false },
        { id: 'incidents-plateforme', title: 'Incidents', type: 'item', url: '/plateforme/incidents', icon: ReportProblemIcon, breadcrumbs: false },
        { id: 'maintenance-plateforme', title: 'Maintenance', type: 'item', url: '/plateforme/maintenance', icon: ConstructionIcon, breadcrumbs: false },
        { id: 'accueil-plateforme', title: "Page d'accueil", type: 'item', url: '/plateforme/accueil', icon: WallpaperIcon, breadcrumbs: false },
        { id: 'annonces-plateforme', title: 'Annonces aux écoles', type: 'item', url: '/plateforme/annonces', icon: CampaignIcon, breadcrumbs: false },
        { id: 'journal-plateforme', title: "Historique des actions", type: 'item', url: '/admin/journal', icon: HistoryIcon, breadcrumbs: false },
        { id: 'sauvegarde-plateforme', title: 'Sauvegarde', type: 'item', url: '/admin/sauvegarde', icon: BackupIcon, breadcrumbs: false },
      ],
    }];
  }

  // Chaque menu est rangé par fréquence d'usage pour ce rôle : le travail de tous les jours en haut,
  // la configuration (rare) en bas.
  if (role === 'ADMIN') {
    return [
      groupe('quotidien', 'Au quotidien', [
        item('appel-du-jour', 'Appel du jour', '/appel-du-jour', EventNoteIcon),
        item('absents-du-jour', 'Absences', '/absents-du-jour', EventBusyIcon),
        item('messages-admin', 'Messages', '/admin/sms', SmsIcon),
        item('eleves', 'Élèves', '/eleves', PeopleIcon),
        item('classes', 'Classes', '/admin/classes', LayersIcon),
        item('emploi-du-temps', 'Emploi du temps', '/admin/emploi-du-temps', CalendarMonthIcon),
      ]),
      groupe('notes', 'Notes et examens', [
        item('notes-par-classe', 'Notes par classe', '/admin/notes-par-classe', GradeIcon),
        item('bulletin', 'Bulletins', '/bulletin', ArticleIcon),
        item('bilan', 'Bilan pédagogique', '/admin/bilan', InsightsIcon),
        item('duplicata-bulletin', 'Duplicata de bulletin', '/admin/duplicata-bulletin', FileCopyIcon),
        item('devoirs-admin', 'Devoirs', '/admin/devoirs', AssignmentIcon),
        item('compositions', 'Compositions', '/admin/compositions', QuizIcon),
        item('programme-examen-blanc', 'Programme examen blanc', '/admin/programme-examen-blanc', EventNoteIcon),
        item('bulletin-examen-blanc', 'Bulletin examen blanc', '/admin/bulletin-examen-blanc', WorkspacePremiumIcon),
        item('exercices-admin', 'Exercices', '/exercices', HomeWorkIcon),
      ]),
      groupe('inscriptions', 'Inscriptions', [
        item('dossiers-recus', 'Inscriptions en ligne', '/admin/dossiers', MailOutlineIcon),
        item('inscriptions', 'Affectation en classe', '/admin/inscriptions', AssignmentIcon),
      ]),
      groupe('equipe', 'Équipe', [
        item('enseignants', 'Enseignants', '/enseignants', GroupsIcon),
        item('personnel', "Équipe de l'école", '/admin/personnel', SupervisorAccountIcon),
        item('journal', "Historique des actions", '/admin/journal', HistoryIcon),
        item('comptes-parents', 'Comptes des parents', '/admin/parents', ManageAccountsIcon),
      ]),
      groupe('ecole-config', 'Configuration', [
        item('parametres', "Paramètres de l'école", '/admin/parametres', SettingsIcon),
        item('actualites', 'Actualités du site', '/admin/actualites', CampaignIcon),
        item('cours', 'Matières', '/cours', ClassIcon),
        item('niveaux', 'Niveaux', '/admin/niveaux', SchoolIcon),
        item('annee-scolaire', 'Année scolaire', '/admin/annee-scolaire', CalendarMonthIcon),
        item('resultats-examen', 'Résultats BEPC / BAC', '/admin/resultats-examen', WorkspacePremiumIcon),
        item('passage-annee', "Passage d'année", '/admin/passage-annee', SchoolIcon),
        item('sauvegarde', 'Sauvegarde', '/admin/sauvegarde', BackupIcon),
      ]),
    ];
  }

  if (role === 'SECRETAIRE') {
    return [
      groupe('secretariat', 'Secrétariat', [
        item('sec-eleves', 'Élèves', '/eleves', PeopleIcon),
        item('sec-en-ligne', 'Inscriptions en ligne', '/admin/dossiers', MailOutlineIcon),
        item('sec-inscriptions', 'Affectation en classe', '/admin/inscriptions', AssignmentIcon),
        item('sec-notes', 'Notes par classe', '/admin/notes-par-classe', GradeIcon),
        item('sec-devoirs', 'Devoirs', '/admin/devoirs', AssignmentIcon),
        item('sec-compositions', 'Compositions', '/admin/compositions', QuizIcon),
        item('sec-programme-eb', 'Programme examen blanc', '/admin/programme-examen-blanc', EventNoteIcon),
        item('sec-messages', 'Messages', '/messages', MailOutlineIcon),
      ]),
      groupe('sec-consulter', 'Consulter et imprimer', [
        item('sec-classes', 'Classes', '/admin/classes', LayersIcon),
        item('sec-emploi', 'Emploi du temps', '/emploi-du-temps-classes', CalendarMonthIcon),
        item('sec-cartes', 'Cartes scolaires', '/admin/cartes-scolaires', BadgeIcon),
      ]),
    ];
  }

  if (role === 'COMPTABLE') {
    return [
      groupe('comptabilite', 'Caisse', [
        item('compta-caisse', 'Frais / Reçus', '/admin/caisse', AccountBalanceWalletIcon),
        item('compta-finances', 'Dépenses et bilan', '/admin/finances', PaymentsIcon),
        item('compta-messages', 'Messages', '/messages', MailOutlineIcon),
      ]),
      groupe('compta-consulter', 'Consulter', [
        item('compta-classes', 'Classes', '/admin/classes', LayersIcon),
        item('compta-emploi', 'Emploi du temps', '/emploi-du-temps-classes', CalendarMonthIcon),
      ]),
    ];
  }

  if (role === 'COMMUNICATION') {
    return [
      groupe('site-public', 'Site public', [
        item('site-public', 'Site public', '/admin/site-public', LanguageIcon),
        item('site-actualites', 'Actualités du site', '/admin/actualites', CampaignIcon),
        item('site-messages', 'Messages', '/messages', MailOutlineIcon),
      ]),
    ];
  }

  if (role === 'SURVEILLANT') {
    return [
      groupe('surveillance', 'Vie scolaire', [
        item('surv-absents', 'Absences', '/absents-du-jour', EventBusyIcon),
        item('surv-messages', 'Messages', '/messages', MailOutlineIcon),
        item('surv-classes', 'Classes', '/admin/classes', LayersIcon),
        item('surv-emploi', 'Emploi du temps', '/emploi-du-temps-classes', CalendarMonthIcon),
      ]),
    ];
  }

  if (role === 'ENSEIGNANT') {
    return [
      groupe('quotidien-ens', 'Au quotidien', [
        item('mes-cours', "Mes cours et l'appel", '/enseignant/cours', MenuBookIcon),
        item('mes-notes', 'Carnet de notes', '/enseignant/notes', GradeIcon),
        item('mon-emploi-ens', 'Mon emploi du temps', '/enseignant/emploi-du-temps', CalendarMonthIcon),
        item('messages-enseignant', 'Messages', '/messages', MailOutlineIcon),
      ]),
      groupe('classes-ens', 'Mes classes', [
        item('mes-devoirs', 'Mes devoirs', '/enseignant/mes-devoirs', AssignmentIcon),
        item('mes-exercices', 'Mes exercices', '/exercices', HomeWorkIcon),
        item('compos-ens', 'Calendrier des compositions', '/calendrier-compositions', QuizIcon),
        ...(hasExamenBlanc ? [item('programme-eb-ens', 'Programme examen blanc', '/programme-examen-blanc', WorkspacePremiumIcon)] : []),
        item('emploi-classes-ens', 'Emploi du temps des classes', '/emploi-du-temps-classes', CalendarMonthIcon),
      ]),
      groupe('profil-ens', 'Compte', [
        item('ecrire-secretaire', 'Écrire à la secrétaire', '/enseignant/message-secretariat', MailOutlineIcon),
        item('mon-profil', 'Mon profil & signature', '/enseignant/mon-profil', DrawIcon),
      ]),
    ];
  }

  if (role === 'ELEVE') {
    return [
      groupe('quotidien-el', 'Au quotidien', [
        item('mon-emploi-eleve', 'Emploi du temps', '/mon-emploi-du-temps', CalendarMonthIcon),
        item('exercices-eleve', 'Exercices', '/exercices', HomeWorkIcon),
        item('mes-notes-el', 'Mes notes', '/mes-notes', GradeIcon),
        item('mes-messages-el', 'Messages', '/messages', MailOutlineIcon),
      ]),
      groupe('suivi-el', 'Mon suivi', [
        item('mon-bulletin', 'Mon bulletin', '/mon-bulletin', ArticleIcon),
        item('compos-el', 'Calendrier des compositions', '/calendrier-compositions', QuizIcon),
        ...(hasExamenBlanc ? [
          item('mon-examen-blanc-el', 'Examen blanc', '/mon-examen-blanc', WorkspacePremiumIcon),
          item('programme-eb-el', 'Programme examen blanc', '/programme-examen-blanc', EventNoteIcon),
        ] : []),
        item('mes-presences-el', 'Mes présences', '/mes-presences', EventNoteIcon),
        item('mes-frais-el', 'Ma scolarité', '/mes-frais', AccountBalanceWalletIcon),
        item('ma-classe', 'Ma classe', '/ma-classe', SchoolIcon),
      ]),
    ];
  }

  if (role === 'PARENT') {
    return [
      groupe('quotidien-parent', 'Au quotidien', [
        item('notes-enfant', 'Notes', '/mes-notes', GradeIcon),
        item('presences-enfant', 'Présences', '/mes-presences', EventNoteIcon),
        item('messages-parent', 'Messages', '/messages', MailOutlineIcon),
      ]),
      groupe('suivi-parent', 'Suivi de la scolarité', [
        item('bulletin-enfant', 'Bulletin', '/mon-bulletin', ArticleIcon),
        item('compos-parent', 'Calendrier des compositions', '/calendrier-compositions', QuizIcon),
        item('frais-parent', 'Frais de scolarité', '/mes-frais', AccountBalanceWalletIcon),
        item('emploi-parent', 'Emploi du temps', '/mon-emploi-du-temps', CalendarMonthIcon),
        item('exercices-parent', 'Exercices', '/exercices', HomeWorkIcon),
        ...(hasExamenBlanc ? [
          item('examen-blanc-enfant', 'Examen blanc', '/mon-examen-blanc', WorkspacePremiumIcon),
          item('programme-eb-parent', 'Programme examen blanc', '/programme-examen-blanc', EventNoteIcon),
        ] : []),
      ]),
    ];
  }

  return [];
}
