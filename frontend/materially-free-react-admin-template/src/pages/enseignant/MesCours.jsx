import { useEffect, useState } from 'react';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Grid,
  CircularProgress, Divider, Button, Chip, Alert
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNavigate } from 'react-router-dom';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { getResults } from 'services/api';

export default function MesCours() {
  const [cours, setCours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await readThrough(CacheKeys.classeMatieres(), async () => {
          const res = await api.get('/classe-matieres/');
          const { items } = getResults(res);
          return items.length ? items : (Array.isArray(res.data) ? res.data : res.data.results || []);
        });
        if (cancelled) return;
        if (result.neverCached) {
          setError(NEVER_CACHED_MSG);
          setCours([]);
        } else {
          setCours(Array.isArray(result.data) ? result.data : []);
          setFromCache(result.fromCache);
        }
      } catch {
        if (!cancelled) setError('Erreur lors du chargement des cours.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>
        Mes Cours et Classes
      </Typography>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {fromCache && !error && (
        <Alert severity="info" sx={{ mb: 2 }}>Données en cache (hors ligne ou réseau indisponible).</Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : cours.length === 0 && !error ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" align="center">
              Aucun cours assigné pour le moment.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {cours.map((c) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={c.id}>
              <Card
                elevation={4}
                sx={{
                  borderRadius: 3,
                  transition: '0.3s',
                  '&:hover': { transform: 'translateY(-5px)', boxShadow: 6 },
                  borderTop: '5px solid #1976d2'
                }}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6" fontWeight="bold" color="primary">{c.matiere_nom}</Typography>
                    <Chip label={c.classe_nom} color="secondary" size="small" />
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    <strong>Coefficient :</strong> {c.coef}
                  </Typography>
                  <Box mt={3} display="flex" flexDirection="column" gap={1.5}>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<AssignmentIcon />}
                      onClick={() => navigate(`/enseignant/saisie-notes/${c.id}`)}
                      sx={{ py: 1.2, borderRadius: 2 }}
                    >
                      Saisir les Notes
                    </Button>
                    <Button
                      fullWidth
                      variant="outlined"
                      color="success"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => navigate(`/enseignant/marquer-presences/${c.id}`)}
                      sx={{ py: 1.2, borderRadius: 2 }}
                    >
                      Faire l&apos;appel
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
