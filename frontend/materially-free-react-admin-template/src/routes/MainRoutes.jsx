import { lazy } from 'react';
import Loadable from 'components/Loadable';
import MainLayout from 'layouts/MainLayout';

import RoleRoute from './RoleRoute';

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
const GestionClasseMatieres = Loadable(lazy(() => import('pages/admin/GestionClasseMatieres')));
const GestionAnneeScolaire = Loadable(lazy(() => import('pages/admin/GestionAnneeScolaire')));
const NotesParClasse = Loadable(lazy(() => import('pages/admin/NotesParClasse')));
const Devoirs = Loadable(lazy(() => import('pages/admin/Devoirs')));
const PresencesClasse = Loadable(lazy(() => import('pages/admin/PresencesClasse')));
const GestionUtilisateurs = Loadable(lazy(() => import('pages/admin/GestionUtilisateurs')));
const GestionNiveaux = Loadable(lazy(() => import('pages/admin/GestionNiveaux')));
const ListeClasses = Loadable(lazy(() => import('pages/admin/ListeClasses')));
const ParametresEcole = Loadable(lazy(() => import('pages/admin/ParametresEcole')));
const GestionCompositions = Loadable(lazy(() => import('pages/admin/GestionCompositions')));
const EmploiDuTempsAdmin = Loadable(lazy(() => import('pages/admin/EmploiDuTemps')));
const BulletinExamenBlanc = Loadable(lazy(() => import('pages/admin/BulletinExamenBlanc')));
const ProgrammeExamenBlanc = Loadable(lazy(() => import('pages/admin/ProgrammeExamenBlanc')));
const ProgrammeExamenBlancView = Loadable(lazy(() => import('pages/evaluations/ProgrammeExamenBlancView')));
const MonEmploiDuTemps = Loadable(lazy(() => import('pages/enseignant/MonEmploiDuTemps')));
const EmploiEleve = Loadable(lazy(() => import('pages/enseignant/MonEmploiDuTemps')));

// Pages Enseignant
const MesCours = Loadable(lazy(() => import('pages/enseignant/MesCours')));
const MesNotes = Loadable(lazy(() => import('pages/enseignant/MesNotes')));
const MesPresencesEnseignant = Loadable(lazy(() => import('pages/enseignant/MesPresencesEnseignant')));
const SaisieNotesParClasse = Loadable(lazy(() => import('pages/enseignant/SaisieNotesParClasse')));
const MarquerPresences = Loadable(lazy(() => import('pages/enseignant/MarquerPresences')));
const MesDevoirs = Loadable(lazy(() => import('pages/enseignant/MesDevoirs')));
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
    { path: '/eleves', element: <RoleRoute roles={['ADMIN']}><ListeEleves /></RoleRoute> },
    { path: '/enseignants', element: <RoleRoute roles={['ADMIN']}><ListeEnseignants /></RoleRoute> },
    { path: '/cours', element: <RoleRoute roles={['ADMIN']}><ListeCours /></RoleRoute> },
    { path: '/evaluations', element: <RoleRoute roles={['ADMIN']}><ListeEvaluations /></RoleRoute> },
    { path: '/presences', element: <RoleRoute roles={['ADMIN']}><ListePresences /></RoleRoute> },
    { path: '/notes', element: <RoleRoute roles={['ADMIN']}><SaisieNotes /></RoleRoute> },
    { path: '/bulletin', element: <RoleRoute roles={['ADMIN']}><Bulletin /></RoleRoute> },
    { path: '/admin/bulletin-examen-blanc', element: <RoleRoute roles={['ADMIN']}><BulletinExamenBlanc /></RoleRoute> },
    { path: '/admin/programme-examen-blanc', element: <RoleRoute roles={['ADMIN']}><ProgrammeExamenBlanc /></RoleRoute> },
    { path: '/admin/notes-par-classe', element: <RoleRoute roles={['ADMIN']}><NotesParClasse /></RoleRoute> },
    { path: '/admin/devoirs', element: <RoleRoute roles={['ADMIN']}><Devoirs /></RoleRoute> },
    { path: '/admin/presences-classe', element: <RoleRoute roles={['ADMIN']}><PresencesClasse /></RoleRoute> },
    { path: '/admin/inscriptions', element: <RoleRoute roles={['ADMIN']}><GestionInscriptions /></RoleRoute> },
    { path: '/admin/classe-matieres', element: <RoleRoute roles={['ADMIN']}><GestionClasseMatieres /></RoleRoute> },
    { path: '/admin/annee-scolaire', element: <RoleRoute roles={['ADMIN']}><GestionAnneeScolaire /></RoleRoute> },
    { path: '/admin/utilisateurs', element: <RoleRoute roles={['ADMIN']}><GestionUtilisateurs /></RoleRoute> },
    { path: '/admin/niveaux', element: <RoleRoute roles={['ADMIN']}><GestionNiveaux /></RoleRoute> },
    { path: '/admin/classes', element: <RoleRoute roles={['ADMIN']}><ListeClasses /></RoleRoute> },
    { path: '/admin/parametres', element: <RoleRoute roles={['ADMIN']}><ParametresEcole /></RoleRoute> },
    { path: '/admin/emploi-du-temps', element: <RoleRoute roles={['ADMIN']}><EmploiDuTempsAdmin /></RoleRoute> },
    { path: '/admin/compositions', element: <RoleRoute roles={['ADMIN']}><GestionCompositions /></RoleRoute> },

    // Emploi du temps Enseignant
    { path: '/enseignant/emploi-du-temps', element: <RoleRoute roles={['ENSEIGNANT']}><MonEmploiDuTemps /></RoleRoute> },

    // Emploi du temps Élève / Parent
    { path: '/mon-emploi-du-temps', element: <RoleRoute roles={['ELEVE', 'PARENT']}><EmploiEleve /></RoleRoute> },
    
    // Enseignant
    { path: '/enseignant/cours', element: <RoleRoute roles={['ENSEIGNANT']}><MesCours /></RoleRoute> },
    { path: '/enseignant/notes', element: <RoleRoute roles={['ENSEIGNANT']}><MesNotes /></RoleRoute> },
    { path: '/enseignant/presences', element: <RoleRoute roles={['ENSEIGNANT']}><MesPresencesEnseignant /></RoleRoute> },
    { path: '/enseignant/saisie-notes/:classeMatiereId', element: <RoleRoute roles={['ENSEIGNANT']}><SaisieNotesParClasse /></RoleRoute> },
    { path: '/enseignant/marquer-presences/:classeMatiereId', element: <RoleRoute roles={['ENSEIGNANT']}><MarquerPresences /></RoleRoute> },
    { path: '/enseignant/mes-devoirs', element: <RoleRoute roles={['ENSEIGNANT']}><MesDevoirs /></RoleRoute> },
    { path: '/enseignant/mon-profil', element: <RoleRoute roles={['ENSEIGNANT']}><MonProfil /></RoleRoute> },

    // Programme Examen Blanc — lecture seule, partagé Enseignant/Élève/Parent (filtré par rôle côté API)
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