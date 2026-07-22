import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import {
  Box, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Chip, Alert
} from '@mui/material';

export default function MesNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const role = authService.getRole();
  const { enfants, selectedId: enfantId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  useEffect(() => {
    // Attendre que le hook enfant soit résolu pour éviter un fetch prématuré
    if (role === 'PARENT' && loadingEnfants) return;
    if (role === 'PARENT' && !enfantId) { setLoading(false); setNotes([]); return; }

    setLoading(true);
    const url = role === 'PARENT' ? `/notes/?eleve_id=${enfantId}` : '/notes/';
    api.get(url).then(res => {
      const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];
      setNotes(data);
    }).finally(() => setLoading(false));
  }, [enfantId, loadingEnfants]);

  // Grouper par matière
  const grouped = notes.reduce((acc, n) => {
    const key = n.matiere || 'Inconnu';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={2}>
        {role === 'PARENT' ? 'Notes de mes enfants' : 'Mes Notes par Matière'}
      </Typography>

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={enfantId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {role === 'PARENT' && !loadingEnfants && enfants.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Aucun enfant lié à votre compte. Contactez l'administration pour lier vos enfants.
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : notes.length === 0 ? (
        <Alert severity="info">Aucune note enregistrée pour le moment.</Alert>
      ) : (
        <Grid container spacing={3}>
          {Object.entries(grouped).map(([matiere, mNotes]) => {
            const avg = mNotes.reduce((sum, n) => sum + parseFloat(n.valeur), 0) / mNotes.length;
            return (
              <Grid size={{ xs: 12, md: 6 }} key={matiere}>
                <Card elevation={2}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography variant="h6" fontWeight="bold">{matiere}</Typography>
                      <Chip label={`Moyenne: ${avg.toFixed(2)}`} color={avg >= 10 ? 'success' : 'error'} />
                    </Box>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead sx={{ bgcolor: 'grey.50' }}>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell align="right">Note</TableCell>
                            <TableCell align="right">Sur</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {mNotes.map((n) => (
                            <TableRow key={n.id}>
                              <TableCell>{n.evaluation_type}</TableCell>
                              <TableCell align="right"><strong>{n.valeur}</strong></TableCell>
                              <TableCell align="right">{n.evaluation_note_sur}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
