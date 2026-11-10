import { estEnLigne } from './reseau';
/**
 * Précharge les chunks des routes principales pour la navigation hors ligne.
 * À appeler après un login réussi (en ligne).
 */
export function prefetchMainLazyRoutes() {
  if (typeof navigator !== 'undefined' && !estEnLigne()) return;

  const loaders = [
    () => import('pages/eleves/ListeEleves'),
    () => import('pages/evaluations/SaisieNotes'),
    () => import('pages/admin/CaisseScolarite'),
    () => import('pages/parent/MesMessages'),
    () => import('views/dashboard/default')
  ];

  // Fire-and-forget : ne bloque pas la navigation post-login
  for (const load of loaders) {
    try {
      load().catch(() => {});
    } catch {
      // ignore
    }
  }
}
