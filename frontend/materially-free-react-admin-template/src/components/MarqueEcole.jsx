import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import authService from 'services/auth';

// Logo + nom de l'école dans la barre du haut et le menu (à la place du logo du modèle d'origine)
export default function MarqueEcole({ largeurMax = 200 }) {
  const lire = () => authService.getIdentiteEcole();
  const [ecole, setEcole] = useState(lire);
  const [logoCasse, setLogoCasse] = useState(false);

  useEffect(() => {
    const maj = () => { setEcole(lire()); setLogoCasse(false); };
    window.addEventListener('ecole-identite', maj);
    return () => window.removeEventListener('ecole-identite', maj);
  }, []);

  const nom = authService.isPlateforme() ? 'Plateforme écoles' : (ecole.nom || 'Gestion École');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, maxWidth: largeurMax }}>
      <Box sx={{
        width: 36, height: 36, borderRadius: 1.5, bgcolor: '#fff', flexShrink: 0, p: ecole.logo && !logoCasse ? 0.4 : 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {ecole.logo && !logoCasse
          ? <Box component="img" src={ecole.logo} alt="" onError={() => setLogoCasse(true)} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <SchoolIcon sx={{ color: 'primary.main', fontSize: 22 }} />}
      </Box>
      <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: 15, lineHeight: 1.2, minWidth: 0 }}
        title={nom}
        // deux lignes au plus pour les noms longs (« Complexe Scolaire Wend-Panga »)
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {nom}
      </Typography>
    </Box>
  );
}
