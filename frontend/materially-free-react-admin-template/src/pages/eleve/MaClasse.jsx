import { useEffect, useState } from 'react';
import api from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Avatar,
  Divider, Chip, Alert, CircularProgress, Table,
  TableHead, TableBody, TableRow, TableCell, TableContainer, Paper
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import ClassIcon from '@mui/icons-material/Class';

export default function MaClasse() {
  const [eleveInfo, setEleveInfo] = useState(null);
  const [camarades, setCamarades] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me/').then(res => {
      const eleveId = res.data.eleve;
      if (!eleveId) { setLoading(false); return; }

      api.get(`/eleves/${eleveId}/`).then(r => {
        const eleve = r.data;
        setEleveInfo(eleve);

        api.get(`/eleves/${eleveId}/inscriptions/`).then(ins => {
          if (ins.data.length > 0) {
            const classeId = ins.data[0].classe;
            // Camarades de la même classe
            api.get(`/eleves/?classe_id=${classeId}`).then(r2 => {
              setCamarades(r2.data.filter(c => c.id !== eleveId));
            });
            // Matières de la classe
            api.get(`/classe-matieres/?classe_id=${classeId}`).then(r3 => {
              setMatieres(r3.data);
            });
          }
        });
      }).finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  if (!eleveInfo) return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Ma Classe</Typography>
      <Alert severity="warning">
        Votre compte n'est pas encore lié à un profil élève. Contactez l'administrateur.
      </Alert>
    </Box>
  );

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Ma Classe</Typography>

      <Grid container spacing={3}>
        {/* Carte classe */}
        <Grid size={{ xs: 12, md: 3 }}>
          <Card elevation={3} sx={{ bgcolor: 'primary.main', color: 'white', textAlign: 'center' }}>
            <CardContent>
              <Avatar sx={{ width: 70, height: 70, mx: 'auto', mb: 2, bgcolor: 'white', color: 'primary.main' }}>
                <SchoolIcon fontSize="large" />
              </Avatar>
              <Typography variant="h5" fontWeight="bold">{eleveInfo.classe_actuelle || '—'}</Typography>
              <Chip
                label={eleveInfo.niveau_actuel || '—'}
                size="small"
                sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.3)', color: 'white' }}
              />
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.85 }}>
                {camarades.length + 1} élève(s) dans la classe
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Matières */}
        <Grid size={{ xs: 12, md: 9 }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <ClassIcon color="primary" />
                <Typography variant="h6" fontWeight="bold">Matières de ma classe</Typography>
              </Box>
              {matieres.length === 0 ? (
                <Typography color="text.secondary">Aucune matière affectée.</Typography>
              ) : (
                <TableContainer component={Paper} elevation={0} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell><strong>Matière</strong></TableCell>
                        <TableCell><strong>Enseignant</strong></TableCell>
                        <TableCell><strong>Coefficient</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matieres.map(cm => (
                        <TableRow key={cm.id} hover>
                          <TableCell><strong>{cm.matiere_nom}</strong></TableCell>
                          <TableCell>{cm.enseignant_nom || <Typography variant="caption" color="text.secondary">Non assigné</Typography>}</TableCell>
                          <TableCell>{cm.coef}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Camarades */}
        <Grid size={12}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <PersonIcon color="primary" />
                <Typography variant="h6" fontWeight="bold">Mes Camarades ({camarades.length})</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {camarades.length === 0 ? (
                <Typography color="text.secondary">Vous êtes seul dans cette classe.</Typography>
              ) : (
                <Grid container spacing={1}>
                  {camarades.map(c => (
                    <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={c.id}>
                      <Box display="flex" alignItems="center" gap={1.5} p={1}
                        sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                        <Avatar sx={{ bgcolor: 'secondary.main', width: 36, height: 36 }}>
                          {c.prenom?.[0]}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight="bold">{c.prenom} {c.nom}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.matricule}</Typography>
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
