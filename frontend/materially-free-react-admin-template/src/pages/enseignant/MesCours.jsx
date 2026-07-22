import { useEffect, useState } from 'react';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Grid,
  CircularProgress, Divider, Button, Chip
} from '@mui/material';
import ClassIcon from '@mui/icons-material/Class';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNavigate } from 'react-router-dom';

export default function MesCours() {
  const [cours, setCours] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/classe-matieres/')
      .then(res => setCours(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>
        Mes Cours et Classes
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : cours.length === 0 ? (
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
                      Faire l'appel
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