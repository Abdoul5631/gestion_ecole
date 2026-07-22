import { useState, useEffect } from 'react';
import api from 'services/api';

// Charge et persiste le choix de l'enfant sélectionné pour un parent
export default function useSelectedEnfant() {
  const [enfants, setEnfants]         = useState([]);
  const [selectedId, setSelectedIdRaw] = useState(null);
  const [loading, setLoading]          = useState(true);

  useEffect(() => {
    api.get('/auth/me/')
      .then(res => {
        const list = res.data.enfants_list || [];
        setEnfants(list);
        // Restaure le dernier enfant sélectionné (ou prend le premier)
        const saved = parseInt(localStorage.getItem('selected_enfant_id'), 10);
        const valid = list.find(e => e.id === saved);
        setSelectedIdRaw(valid ? saved : (list[0]?.id ?? null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setSelectedId = (id) => {
    setSelectedIdRaw(id);
    localStorage.setItem('selected_enfant_id', id);
  };

  const selectedEnfant = enfants.find(e => e.id === selectedId) || null;

  return { enfants, selectedId, selectedEnfant, setSelectedId, loading };
}
