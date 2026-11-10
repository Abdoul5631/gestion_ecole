import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import Loadable from 'components/Loadable';
import MainLayout from 'layouts/MainLayout';

import RoleRoute from './RoleRoute';
import RequireOnline from 'offline/RequireOnline';

// Pages Admin
const DashboardDefault = Loadable(lazy(() => import('views/dashboard/default')));
const ListeEleves = Loadable(lazy(() => import('pages/eleves/ListeEleves')));
const ListeEnseignants = Loadable(lazy(() => import('pages/enseignants/ListeEnseignants')));
const ListeCours = Loadable(lazy(() => import('pages/cours/ListeCours')));
const ListeEvaluations = Loadable(lazy(() => import('pages/evaluations/ListeEvaluations')));
const ListePresences = Loadable(lazy(() => import('pages/presences/ListePresences')));
const SaisieNotes = Loadable(lazy(() => import('pages/evaluations/SaisieNotes')));
const Bulletin = Loadable(lazy(() => import('pages/bulletin/Bulletin')));

// Nouvelles pages Admin
const GestionInscriptions = Loadable(lazy(() => import('pages/admin/GestionInscriptions')));
const DossiersRecus = Loadable(lazy(() => import('pages/admin/DossiersRecus')));
const GestionClasseMatieres = Loadable(lazy(() => import('pages/admin/GestionClasseMatieres')));
const GestionAnneeScolaire = Loadable(lazy(() => import('pages/admin/GestionAnneeScolaire')));
const NotesParClasse = Loadable(lazy(() => import('pages/admin/NotesParClasse')));
const Devoirs = Loadable(lazy(() => import('pages/admin/Devoirs')));
const PresencesClasse = Loadable(lazy(() => import('pages/admin/PresencesClasse')));
const AppelDuJour = Loadable(lazy(() => import('pages/admin/AppelDuJour')));
const ComptesParents = Loadable(lazy(() => import('pages/admin/ComptesParents')));
const GestionPersonnel = Loadable(lazy(() => import('pages/admin/GestionPersonnel')));
const JournalActivite = Loadable(lazy(() => import('pages/admin/JournalActivite')));
const DuplicataBulletin = Loadable(lazy(() => import('pages/admin/DuplicataBulletin')));
const ActualitesEcole = Loadable(lazy(() => import('pages/admin/ActualitesEcole')));
const AbsentsDuJour = Loadable(lazy(() => import('pages/admin/AbsentsDuJour')));
const GestionNiveaux = Loadable(lazy(() => import('pages/admin/GestionNiveaux')));
const ListeClasses = Loadable(lazy(() => import('pages/admin/ListeClasses')));
const CartesScolaires = Loadable(lazy(() => import('pages/admin/CartesScolaires')));
const ParametresEcole = Loadable(lazy(() => import('pages/admin/ParametresEcole')));
const SetupEcole = Loadable(lazy(() => import('pages/admin/SetupEcole')));
const AttenteValidation = Loadable(lazy(() => import('pages/auth/AttenteValidation')));
const ListeEcolesPlateforme = Loadable(lazy(() => import('pages/plateforme/ListeEcoles')));
const IncidentsPlateforme = Loadable(lazy(() => import('pages/plateforme/Incidents')));
const FicheEcolePlateforme = Loadable(lazy(() => import('pages/plateforme/FicheEcole')));
const AnnoncesPlateforme = Loadable(lazy(() => import('pages/plateforme/Annonces')));
const ComptesPlateforme = Loadable(lazy(() => import('pages/plateforme/Comptes')));
const PageAccueilPlateforme = Loadable(lazy(() => import('pages/plateforme/PageAccueil')));
const MonCompte = Loadable(lazy(() => import('pages/MonCompte')));
const MaintenancePlateforme = Loadable(lazy(() => import('pages/plateforme/Maintenance')));
const GestionCompositions = Loadable(lazy(() => import('pages/admin/GestionCompositions')));
const FinancesEcole = Loadable(lazy(() => import('pages/admin/FinancesEcole')));
const EmploiDuTempsAdmin = Loadable(lazy(() => import('pages/admin/EmploiDuTemps')));
const BulletinExamenBlanc = Loadable(lazy(() => import('pages/admin/BulletinExamenBlanc')));
const ProgrammeExamenBlanc = Loadable(lazy(() => import('pages/admin/ProgrammeExamenBlanc')));
const CaisseScolarite = Loadable(lazy(() => import('pages/admin/CaisseScolarite')));
const FileSms = Loadable(lazy(() => import('pages/admin/FileSms')));
const PassageAnnee = Loadable(lazy(() => import('pages/admin/PassageAnnee')));
const ResultatsExamen = Loadable(lazy(() => import('pages/admin/ResultatsExamen')));
const BilanPedagogique = Loadable(lazy(() => import('pages/admin/BilanPedagogique')));
const Sauvegarde = Loadable(lazy(() => import('pages/admin/Sauvegarde')));
const DossierEleve = Loadable(lazy(() => import('pages/eleves/DossierEleve')));
const MesFrais = Loadable(lazy(() => import('pages/parent/MesFrais')));
const Exercices = Loadable(lazy(() => import('pages/exercices/Exercices')));
const MesMessages = Loadable(lazy(() => import('pages/parent/MesMessages')));
const ProgrammeExamenBlancView = Loadable(lazy(() => import('pages/evaluations/ProgrammeExamenBlancView')));
const CalendrierCompositionsView = Loadable(lazy(() => import('pages/evaluations/CalendrierCompositionsView')));
const MonEmploiDuTemps = Loadable(lazy(() => import('pages/enseignant/MonEmploiDuTemps')));
const EmploiEleve = Loadable(lazy(() => import('pages/enseignant/MonEmploiDuTemps')));

// Pages Enseignant
const MesCours = Loadable(lazy(() => import('pages/enseignant/MesCours')));
const MesNotes = Loadable(lazy(() => import('pages/enseignant/MesNotes')));
const SaisieNotesParClasse = Loadable(lazy(() => import('pages/enseignant/SaisieNotesParClasse')));
const MarquerPresences = Loadable(lazy(() => import('pages/enseignant/MarquerPresences')));
const MesDevoirs = Loadable(lazy(() => import('pages/enseignant/MesDevoirs')));
const MessageSecretariat = Loadable(lazy(() => import('pages/enseignant/MessageSecretariat')));
const MonProfil = Loadable(lazy(() => import('pages/enseignant/MonProfil')));

// Pages Élève & Parent
const MonBulletin = Loadable(lazy(() => import('pages/eleve/MonBulletin')));
const MesPresencesEleve = Loadable(lazy(() => import('pages/eleve/MesPresencesEleve')));
const MaClasse = Loadable(lazy(() => import('pages/eleve/MaClasse')));
const MesNotesEleve = Loadable(lazy(() => import('pages/eleve/MesNotes')));
const MonBulletinExamenBlanc = Loadable(lazy(() => import('pages/eleve/MonBulletinExamenBlanc')));

const MainRoutes = {
  path: '/',
  element: <MainLayout />,
  children: [
    { path: '/', element: <DashboardDefault /> },
    { path: '/dashboard/default', element: <DashboardDefault /> },
    
    // Admin
    { path: '/eleves', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><ListeEleves /></RoleRoute> },
    { path: '/eleves/:id/dossier', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE', 'ENSEIGNANT', 'PARENT', 'ELEVE']}><DossierEleve /></RoleRoute> },
    { path: '/enseignants', element: <RoleRoute roles={['ADMIN']}><ListeEnseignants /></RoleRoute> },
    { path: '/cours', element: <RoleRoute roles={['ADMIN']}><ListeCours /></RoleRoute> },
    { path: '/evaluations', element: <RoleRoute roles={['ADMIN']}><ListeEvaluations /></RoleRoute> },
    { path: '/presences', element: <RoleRoute roles={['ADMIN']}><ListePresences /></RoleRoute> },
    { path: '/notes', element: <RoleRoute roles={['ADMIN']}><SaisieNotes /></RoleRoute> },
    { path: '/bulletin', element: <RoleRoute roles={['ADMIN']}><Bulletin /></RoleRoute> },
    { path: '/admin/bulletin-examen-blanc', element: <RoleRoute roles={['ADMIN']}><BulletinExamenBlanc /></RoleRoute> },
    { path: '/admin/programme-examen-blanc', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><ProgrammeExamenBlanc /></RoleRoute> },
    { path: '/admin/notes-par-classe', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><NotesParClasse /></RoleRoute> },
    { path: '/admin/devoirs', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><Devoirs /></RoleRoute> },
    { path: '/admin/presences-classe', element: <RoleRoute roles={['ADMIN']}><PresencesClasse /></RoleRoute> },
    { path: '/appel-du-jour', element: <RoleRoute roles={['ADMIN']}><AppelDuJour /></RoleRoute> },
    { path: '/admin/inscriptions', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><GestionInscriptions /></RoleRoute> },
    { path: '/admin/dossiers', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><DossiersRecus /></RoleRoute> },
    { path: '/admin/classe-matieres', element: <RoleRoute roles={['ADMIN']}><GestionClasseMatieres /></RoleRoute> },
    { path: '/admin/annee-scolaire', element: <RoleRoute roles={['ADMIN']}><GestionAnneeScolaire /></RoleRoute> },
    { path: '/admin/parents', element: <RoleRoute roles={['ADMIN']}><ComptesParents /></RoleRoute> },
    { path: '/admin/utilisateurs', element: <Navigate to="/admin/parents" replace /> },
    { path: '/absents-du-jour', element: <RoleRoute roles={['ADMIN', 'SURVEILLANT']}><AbsentsDuJour /></RoleRoute> },
    { path: '/admin/personnel', element: <RoleRoute roles={['ADMIN']}><GestionPersonnel /></RoleRoute> },
    { path: '/admin/duplicata-bulletin', element: <RoleRoute roles={['ADMIN']}><DuplicataBulletin /></RoleRoute> },
    { path: '/admin/journal', element: <RoleRoute roles={['ADMIN']} plateformeOk><JournalActivite /></RoleRoute> },
    { path: '/admin/site-public', element: <RoleRoute roles={['COMMUNICATION']}><ParametresEcole seulementSite /></RoleRoute> },
    { path: '/admin/actualites', element: <RoleRoute roles={['ADMIN', 'COMMUNICATION']}><ActualitesEcole /></RoleRoute> },
    { path: '/admin/niveaux', element: <RoleRoute roles={['ADMIN']}><GestionNiveaux /></RoleRoute> },
    { path: '/admin/cartes-scolaires', element: <RoleRoute roles={['SECRETAIRE']} sansDirecteur><CartesScolaires /></RoleRoute> },
    { path: '/admin/classes', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT']}><ListeClasses /></RoleRoute> },
    { path: '/admin/parametres', element: <RoleRoute roles={['ADMIN']}><ParametresEcole /></RoleRoute> },
    { path: '/admin/setup-ecole', element: <RoleRoute roles={['ADMIN']}><RequireOnline message="Connexion requise"><SetupEcole /></RequireOnline></RoleRoute> },
    { path: '/attente-validation', element: <AttenteValidation /> },
    { path: '/plateforme/incidents', element: <RoleRoute plateformeOnly><IncidentsPlateforme /></RoleRoute> },
    { path: '/plateforme/ecoles/:id', element: <RoleRoute plateformeOnly><FicheEcolePlateforme /></RoleRoute> },
    { path: '/plateforme/annonces', element: <RoleRoute plateformeOnly><AnnoncesPlateforme /></RoleRoute> },
    { path: '/plateforme/comptes', element: <RoleRoute plateformeOnly><ComptesPlateforme /></RoleRoute> },
    { path: '/plateforme/accueil', element: <RoleRoute plateformeOnly><PageAccueilPlateforme /></RoleRoute> },
    { path: '/mon-compte', element: <MonCompte /> },
    { path: '/plateforme/maintenance', element: <RoleRoute plateformeOnly><MaintenancePlateforme /></RoleRoute> },
    { path: '/plateforme/ecoles', element: <RoleRoute plateformeOnly><ListeEcolesPlateforme /></RoleRoute> },
    { path: '/admin/emploi-du-temps', element: <RoleRoute roles={['ADMIN']}><EmploiDuTempsAdmin /></RoleRoute> },
    // consultation de l'emploi du temps de toutes les classes : l'équipe de l'école et les enseignants
    { path: '/emploi-du-temps-classes', element: <RoleRoute roles={['ENSEIGNANT', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT']}><EmploiDuTempsAdmin /></RoleRoute> },
    { path: '/admin/compositions', element: <RoleRoute roles={['ADMIN', 'SECRETAIRE']}><GestionCompositions /></RoleRoute> },
    { path: '/admin/caisse', element: <RoleRoute roles={['COMPTABLE']}><CaisseScolarite /></RoleRoute> },
    { path: '/admin/finances', element: <RoleRoute roles={['COMPTABLE']}><FinancesEcole /></RoleRoute> },
    { path: '/admin/sms', element: <RoleRoute roles={['ADMIN']}><FileSms /></RoleRoute> },
    { path: '/admin/passage-annee', element: <RoleRoute roles={['ADMIN']}><PassageAnnee /></RoleRoute> },
    { path: '/admin/bilan', element: <RoleRoute roles={['ADMIN']}><BilanPedagogique /></RoleRoute> },
    { path: '/admin/resultats-examen', element: <RoleRoute roles={['ADMIN']}><ResultatsExamen /></RoleRoute> },
    { path: '/admin/sauvegarde', element: <RoleRoute roles={['ADMIN']} plateformeOk><RequireOnline message="Connexion requise"><Sauvegarde /></RequireOnline></RoleRoute> },
    { path: '/exercices', element: <RoleRoute roles={['ADMIN', 'ENSEIGNANT', 'ELEVE', 'PARENT']}><Exercices /></RoleRoute> },
    { path: '/mes-frais', element: <RoleRoute roles={['PARENT', 'ELEVE']}><MesFrais /></RoleRoute> },
    { path: '/messages', element: <RoleRoute roles={['PARENT', 'ELEVE', 'ENSEIGNANT', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT', 'COMMUNICATION', 'ADMIN']}><MesMessages /></RoleRoute> },

    // Emploi du temps Enseignant
    { path: '/enseignant/emploi-du-temps', element: <RoleRoute roles={['ENSEIGNANT']}><MonEmploiDuTemps /></RoleRoute> },

    // Emploi du temps Élève / Parent
    { path: '/mon-emploi-du-temps', element: <RoleRoute roles={['ELEVE', 'PARENT']}><EmploiEleve /></RoleRoute> },
    
    // Enseignant
    { path: '/enseignant/cours', element: <RoleRoute roles={['ENSEIGNANT']}><MesCours /></RoleRoute> },
    { path: '/enseignant/notes', element: <RoleRoute roles={['ENSEIGNANT']}><MesNotes /></RoleRoute> },
    { path: '/enseignant/presences', element: <Navigate to="/enseignant/cours" replace /> },
    { path: '/enseignant/saisie-notes/:classeMatiereId', element: <RoleRoute roles={['ENSEIGNANT']}><SaisieNotesParClasse /></RoleRoute> },
    { path: '/enseignant/marquer-presences/:classeMatiereId', element: <RoleRoute roles={['ENSEIGNANT']}><MarquerPresences /></RoleRoute> },
    { path: '/enseignant/mes-devoirs', element: <RoleRoute roles={['ENSEIGNANT']}><MesDevoirs /></RoleRoute> },
    { path: '/enseignant/message-secretariat', element: <RoleRoute roles={['ENSEIGNANT']}><MessageSecretariat /></RoleRoute> },
    { path: '/enseignant/mon-profil', element: <RoleRoute roles={['ENSEIGNANT']}><MonProfil /></RoleRoute> },

    // Programme Examen Blanc — lecture seule, partagé Enseignant/Élève/Parent (filtré par rôle côté API)
    { path: '/calendrier-compositions', element: <RoleRoute roles={['ENSEIGNANT', 'ELEVE', 'PARENT']}><CalendrierCompositionsView /></RoleRoute> },
    { path: '/programme-examen-blanc', element: <RoleRoute roles={['ENSEIGNANT', 'ELEVE', 'PARENT']}><ProgrammeExamenBlancView /></RoleRoute> },

    // Élève & Parent
    { path: '/mon-bulletin', element: <RoleRoute roles={['ELEVE', 'PARENT']}><MonBulletin /></RoleRoute> },
    { path: '/mon-examen-blanc', element: <RoleRoute roles={['ELEVE', 'PARENT']}><MonBulletinExamenBlanc /></RoleRoute> },
    { path: '/mes-presences', element: <RoleRoute roles={['ELEVE', 'PARENT']}><MesPresencesEleve /></RoleRoute> },
    { path: '/ma-classe', element: <RoleRoute roles={['ELEVE', 'PARENT']}><MaClasse /></RoleRoute> },
    { path: '/mes-notes', element: <RoleRoute roles={['ELEVE', 'PARENT']}><MesNotesEleve /></RoleRoute> },
  ]
};

export default MainRoutes;