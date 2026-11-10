import authService from 'services/auth';

// Le directeur supervise : il voit tout mais ne saisit pas à la place de son équipe.
// À garder aligné avec SAISIE_* dans config/droits.py (le backend reste l'autorité : 403 sinon).
const SAISIE = {
  secretariat: ['SECRETAIRE'], // élèves, inscriptions, dossiers en ligne
  caisse: ['COMPTABLE'], // paiements, dépenses, relances : le directeur n'y a pas accès
  pedagogie: ['ENSEIGNANT', 'SECRETAIRE'], // notes et devoirs : enseignant (ses cours), secrétaire (toutes les classes)
  vieScolaire: ['SURVEILLANT'], // appel du jour
};

export const peutSaisir = (domaine) => SAISIE[domaine]?.some((r) => authService.getRoles().includes(r)) ?? false;
