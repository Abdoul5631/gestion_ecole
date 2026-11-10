import { useEffect, useState } from 'react';
import api, { classeMatiereService, getResults } from 'services/api';
import authService from 'services/auth';

// Détermine si l'utilisateur courant (ENSEIGNANT/ELEVE/PARENT) est concerné par
// l'Examen Blanc — c'est-à-dire rattaché à une classe d'examen (3ème, Terminale).
// Sert à masquer les menus Examen Blanc pour les profs/élèves/parents non concernés.
export default function useHasExamenBlancAccess() {
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const role = authService.getRole();

  useEffect(() => {
    if (role === 'SUPER_ADMIN' || authService.isPlateforme()) { setHasAccess(false); setLoading(false); return; }
    if (role === 'ADMIN') { setHasAccess(true); setLoading(false); return; }

    const classeEstExamen = async (classeId) => {
      try {
        const res = await api.get(`/classes/${classeId}/`);
        return !!res.data.niveau_is_classe_examen;
      } catch {
        return false;
      }
    };

    const run = async () => {
      try {
        if (role === 'ENSEIGNANT') {
          const res = await classeMatiereService.getAll();
          const items = getResults(res).items;
          setHasAccess(items.some(cm => cm.niveau_is_classe_examen));
        } else if (role === 'ELEVE') {
          const me = await api.get('/auth/me/');
          if (!me.data.eleve) { setHasAccess(false); return; }
          const ins = await api.get(`/eleves/${me.data.eleve}/inscriptions/`);
          if (!ins.data.length) { setHasAccess(false); return; }
          setHasAccess(await classeEstExamen(ins.data[0].classe));
        } else if (role === 'PARENT') {
          const me = await api.get('/auth/me/');
          const enfants = me.data.enfants_list || [];
          for (const enfant of enfants) {
            const ins = await api.get(`/eleves/${enfant.id}/inscriptions/`);
            if (ins.data.length && await classeEstExamen(ins.data[0].classe)) {
              setHasAccess(true);
              return;
            }
          }
          setHasAccess(false);
        } else {
          setHasAccess(false);
        }
      } catch {
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [role]);

  return { hasAccess, loading };
}
