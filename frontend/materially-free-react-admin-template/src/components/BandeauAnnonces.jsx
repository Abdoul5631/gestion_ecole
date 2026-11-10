import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box } from '@mui/material';
import api from 'services/api';

const INTERVALLE = 5 * 60 * 1000;
const cleMasquees = 'annonces_masquees';

const lireMasquees = () => {
  try { return JSON.parse(sessionStorage.getItem(cleMasquees) || '[]'); } catch { return []; }
};

/** Annonces de la plateforme (maintenance, incident en cours…) : un bandeau en haut de chaque page. */
export default function BandeauAnnonces() {
  const [annonces, setAnnonces] = useState([]);
  const [masquees, setMasquees] = useState(lireMasquees);

  useEffect(() => {
    const charger = () => {
      if (!localStorage.getItem('access_token') || !navigator.onLine) return;
      Promise.all([
        api.get('/annonces-actives/').then((r) => r.data?.results || []).catch(() => []),
        api.get('/maintenance/').then((r) => r.data).catch(() => null),
      ]).then(([liste, maint]) => {
        const dans24h = maint?.programmee && maint.debut && new Date(maint.debut) - new Date() < 24 * 3600 * 1000;
        const quand = dans24h ? new Date(maint.debut).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : '';
        setAnnonces(dans24h
          ? [{ id: `maintenance-${maint.debut}`, titre: 'Maintenance prévue', niveau: 'warning',
            message: `L’application sera indisponible à partir de ${quand}${maint.fin ? `, retour prévu ${new Date(maint.fin).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}. Pensez à enregistrer votre travail avant.` }, ...liste]
          : liste);
      });
    };
    charger();
    const t = setInterval(charger, INTERVALLE);
    return () => clearInterval(t);
  }, []);

  const masquer = (id) => {
    const n = [...masquees, id];
    setMasquees(n);
    try { sessionStorage.setItem(cleMasquees, JSON.stringify(n)); } catch { /* ignore */ }
  };

  const visibles = annonces.filter((a) => !masquees.includes(a.id));
  if (!visibles.length) return null;
  return (
    <Box sx={{ mb: 2 }}>
      {visibles.map((a) => (
        <Alert key={a.id} severity={a.niveau} sx={{ mb: 1 }} onClose={() => masquer(a.id)}>
          <AlertTitle sx={{ fontWeight: 800 }}>{a.titre}</AlertTitle>
          {a.message}
        </Alert>
      ))}
    </Box>
  );
}
