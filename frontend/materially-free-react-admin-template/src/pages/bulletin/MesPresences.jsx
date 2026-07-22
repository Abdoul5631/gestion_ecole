import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert
} from '@mui/material';

export default function MesPresences() {
  const [presences, setPresences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eleveInfo, setEleveInfo] = useState(null);
  const role = authService.getRole();

  useEffect(() => {
    api.get('/auth/me/').then(res => {
      const eleveId = res.data.eleve;
      if (eleveId) {
        api.get(`/eleves/${eleveId}/`).then(r => setEleveInfo(r.data));
        api.get(`/eleves/${eleveId}/presences/`)
          .then(r => setPresences(r.data))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const presents = presences.filter(p => p.statut === 'PRESENT').length;
  const absents = presences.filter(p => p.statut === 'ABSENT').length;
  const taux = presences.length > 0
    ? Math.round((presents / presences.length) * 100) : 0;

  const statutColor = (s) => {
    if (s === 'PRESENT') return 'success';
    if (s === 'ABSENT') return 'error';
    if (s === 'RETARD') return 'warning';
    return 'info';
  };

  const statutLabel = (s) => {
    if (s === 'PRESENT') return 'Présent';
    if (s === 'ABSENT') return 'Absent';
    if (s === 'RETARD') return 'En retard';
    return 'Excusé';
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>
        {role === 'PARENT' ? 'Présences de mon enfant' : 'Mes Présences'}
      </Typography>

      {eleveInfo && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Élève : <strong>{eleveInfo.prenom} {eleveInfo.nom}</strong> — {eleveInfo.matricule}
        </Alert>
      )}

      {!loading && (
        <Alert
          severity={taux >= 80 ? 'success' : taux >= 60 ? 'warning' : 'error'}
          sx={{ mb: 2 }}
        >
          Taux de présence : <strong>{taux}%</strong> —
          {presents} présence(s), {absents} absence(s)
        </Alert>
      )}

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                    <TableCell><strong>Motif</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {presences.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">Aucune présence trouvée</TableCell>
                    </TableRow>
                  ) : (
                    presences.map(p => (
                      <TableRow key={p.id} hover>
                        <TableCell>{p.date}</TableCell>
                        <TableCell>
                          <Chip
                            label={statutLabel(p.statut)}
                            color={statutColor(p.statut)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{p.motif || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}