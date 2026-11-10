import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import ConstructionIcon from '@mui/icons-material/Construction';
import SchoolIcon from '@mui/icons-material/School';
import RefreshIcon from '@mui/icons-material/Refresh';
import axios from 'axios';
import authService from 'services/auth';

const tourne = keyframes`from { transform: rotate(-8deg); } to { transform: rotate(8deg); }`;
const INTERVALLE_NORMAL = 60000;
const INTERVALLE_MAINTENANCE = 20000;
const URL_ETAT = `${import.meta.env.VITE_API_URL || '/api'}/maintenance/`;

const heureFr = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/**
 * Enveloppe de toute l'application : pendant une maintenance, chaque adresse du site (connexion, site d'une école,
 * tableau de bord…) affiche la page de maintenance, sauf pour le super admin qui garde la main et voit un rappel.
 * L'état est relu toutes les minutes (20 s pendant la maintenance) : la page disparaît d'elle-même à la fin.
 */
export default function PorteMaintenance({ children }) {
  const [etat, setEtat] = useState(null);
  const [verif, setVerif] = useState(false);

  const lire = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // hors ligne : l'application garde son fonctionnement habituel
    try {
      const { data } = await axios.get(URL_ETAT, { timeout: 8000 });
      setEtat(data);
    } catch (e) {
      // 503 de maintenance renvoyé par le serveur lui-même
      if (e.response?.status === 503 && e.response.data?.maintenance) setEtat({ en_cours: true, ...e.response.data });
    }
  }, []);

  useEffect(() => {
    lire();
    const t = setInterval(lire, etat?.en_cours ? INTERVALLE_MAINTENANCE : INTERVALLE_NORMAL);
    const surMaintenance = (e) => setEtat({ en_cours: true, ...(e.detail || {}) });
    window.addEventListener('maintenance:detectee', surMaintenance);
    window.addEventListener('online', lire);
    return () => { clearInterval(t); window.removeEventListener('maintenance:detectee', surMaintenance); window.removeEventListener('online', lire); };
  }, [lire, etat?.en_cours]);

  const superAdmin = authService.isPlateforme();

  if (etat?.en_cours && !superAdmin) {
    return (
      <Box sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, textAlign: 'center', color: '#fff',
        background: 'linear-gradient(135deg, #081e46 0%, #0b3d91 55%, #1565c0 100%)',
      }}>
        <Box sx={{ maxWidth: 560 }}>
          <Box display="flex" alignItems="center" justifyContent="center" gap={1.25} mb={4}>
            <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: '#fff', color: '#0b3d91', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SchoolIcon /></Box>
            <Typography sx={{ fontWeight: 800, fontSize: 20 }} color="inherit">Gestion École</Typography>
          </Box>
          <Box sx={{ width: 110, height: 110, mx: 'auto', mb: 3, borderRadius: '50%', bgcolor: 'rgba(245,179,1,0.16)', border: '2px solid #f5b301',
            display: 'flex', alignItems: 'center', justifyContent: 'center', '@media (prefers-reduced-motion: no-preference)': { animation: `${tourne} 1.6s ease-in-out infinite alternate` } }}>
            <ConstructionIcon sx={{ fontSize: 56, color: '#f5b301' }} />
          </Box>
          <Typography component="h1" color="inherit" sx={{ fontWeight: 800, fontSize: { xs: 28, sm: 38 }, lineHeight: 1.15 }}>
            {etat.titre || 'Maintenance en cours'}
          </Typography>
          <Typography color="inherit" sx={{ mt: 2, opacity: 0.92, fontSize: { xs: 16, sm: 18 } }}>
            {etat.message || "Nous améliorons l'application. Elle sera de nouveau disponible très bientôt."}
          </Typography>
          {etat.fin && (
            <Box sx={{ display: 'inline-block', mt: 3, px: 2, py: 1, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Typography color="inherit" sx={{ fontSize: 14, opacity: 0.8 }}>Retour prévu</Typography>
              <Typography color="inherit" sx={{ fontWeight: 800, textTransform: 'capitalize' }}>{heureFr(etat.fin)}</Typography>
            </Box>
          )}
          <Typography color="inherit" sx={{ mt: 3, opacity: 0.8, fontSize: 14 }}>
            Vos données sont en sécurité. Cette page se met à jour toute seule : inutile de la recharger.
          </Typography>
          <Button onClick={async () => { setVerif(true); await lire(); setVerif(false); }} startIcon={<RefreshIcon />} disabled={verif}
            sx={{ mt: 3, color: '#fff', borderColor: 'rgba(255,255,255,0.5)', textTransform: 'none', fontWeight: 700 }} variant="outlined">
            {verif ? 'Vérification…' : 'Vérifier maintenant'}
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <>
      {etat?.en_cours && superAdmin && (
        <Box sx={{ position: 'sticky', top: 0, zIndex: 3000, bgcolor: '#c62828', color: '#fff', px: 2, py: 0.75, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>
          Mode maintenance actif : les écoles voient la page de maintenance, vous seul avez accès à l&apos;application.
        </Box>
      )}
      {children}
    </>
  );
}
