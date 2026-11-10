import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Button, Alert, CircularProgress
} from '@mui/material';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import api from 'services/api';
import authService, { homeForUser } from 'services/auth';

export default function AttenteValidation() {
  const navigate = useNavigate();
  const [nom, setNom] = useState('');
  const [checking, setChecking] = useState(false);

  const applyMe = (data) => {
    authService.saveSession({
      ...data,
      access: localStorage.getItem('access_token'),
      refresh: localStorage.getItem('refresh_token'),
    });
    setNom(data.ecole_nom || '');
    if (data.is_plateforme || data.ecole_statut === 'VALIDEE') {
      navigate(homeForUser(data), { replace: true });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { data } = await api.get('/auth/me/');
        if (!cancelled) applyMe(data);
      } catch {
        /* reste sur l'écran d'attente */
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [navigate]);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      const { data } = await api.get('/auth/me/');
      applyMe(data);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
      <Card sx={{ borderRadius: 3, boxShadow: 4 }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <HourglassEmptyIcon sx={{ fontSize: 56, color: 'warning.main', mb: 2 }} />
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            En attente de validation
          </Typography>
          {nom && (
            <Typography variant="subtitle1" color="text.secondary" mb={2}>
              {nom}
            </Typography>
          )}
          <Alert severity="warning" sx={{ textAlign: 'left', mb: 3 }}>
            Votre école est en attente de validation.
            Un super administrateur de la plateforme doit l’approuver avant
            que vous puissiez utiliser la pédagogie et la caisse.
          </Alert>
          <Button
            variant="contained"
            onClick={handleRefresh}
            disabled={checking}
            sx={{ mr: 1 }}
          >
            {checking ? <CircularProgress size={22} color="inherit" /> : 'Vérifier maintenant'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => {
              authService.logout();
              navigate('/login');
            }}
          >
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
