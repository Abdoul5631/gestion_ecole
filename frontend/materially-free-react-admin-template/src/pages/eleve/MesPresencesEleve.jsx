import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, Alert, Grid
} from '@mui/material';
import EventNoteIcon from '@mui/icons-material/EventNote';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';

import { estEnLigne } from 'offline/reseau';
export default function MesPresencesEleve() {
  const [presences, setPresences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eleveInfo, setEleveInfo] = useState(null);
  const [eleveDirectId, setEleveDirectId] = useState(null);
  const [error, setError] = useState('');
  const role = authService.getRole();
  const { enfants, selectedId: enfantId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  const eleveId = role === 'PARENT' ? enfantId : eleveDirectId;

  useEffect(() => {
    if (role !== 'PARENT') {
      readThrough(CacheKeys.authMe(), async () => {
        const res = await api.get('/auth/me/');
        return res.data;
      }).then((r) => { if (r.data?.eleve) setEleveDirectId(r.data.eleve); });
    }
  }, [role]);

  useEffect(() => {
    if (role === 'PARENT' && loadingEnfants) return;
    if (!eleveId) { setLoading(false); setPresences([]); setEleveInfo(null); return; }
    setLoading(true);
    setError('');
    readThrough(CacheKeys.presencesEleve(eleveId), async () => {
      const [info, r] = await Promise.all([
        api.get(`/eleves/${eleveId}/`),
        api.get(`/eleves/${eleveId}/presences/`),
      ]);
      const cours = Array.isArray(r.data) ? r.data : r.data?.results || [];
      return {
        eleveInfo: info.data,
        presences: [...cours].sort((x, y) => String(y.date).localeCompare(String(x.date))),
      };
    })
      .then((res) => {
        if (res.neverCached) {
          setError(NEVER_CACHED_MSG);
          setPresences([]);
          setEleveInfo(null);
        } else {
          setEleveInfo(res.data?.eleveInfo || null);
          setPresences(res.data?.presences || []);
        }
      })
      .catch(() => setError(estEnLigne() ? 'Erreur de chargement' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, [eleveId, loadingEnfants, role]);

  const presents = presences.filter(p => p.statut === 'PRESENT').length;
  const absents = presences.filter(p => p.statut === 'ABSENT' && !p.justifiee).length;
  const retards = presences.filter(p => p.statut === 'RETARD').length;
  const justifiees = presences.filter(p => (p.statut === 'ABSENT' && p.justifiee) || p.statut === 'EXCUSE').length;
  const taux = presences.length > 0 ? Math.round((presents / presences.length) * 100) : 0;

  const statutColor = (s, justifiee) => {
    if (s === 'ABSENT' && justifiee) return 'info';
    if (s === 'PRESENT') return 'success';
    if (s === 'ABSENT') return 'error';
    if (s === 'RETARD') return 'warning';
    return 'info';
  };

  const statutLabel = (s, justifiee) => {
    if (s === 'ABSENT' && justifiee) return 'Absence justifiée';
    if (s === 'PRESENT') return 'Présent';
    if (s === 'ABSENT') return 'Absent';
    if (s === 'RETARD') return 'En retard';
    if (s === 'JUSTIFIE') return 'Justifié';
    return 'Excusé';
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={2} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        {role === 'PARENT' ? 'Présences de mes enfants' : 'Mes Présences'}
      </Typography>

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={enfantId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {role === 'PARENT' && !loadingEnfants && enfants.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Aucun enfant lié à votre compte. Contactez l&apos;administration pour lier vos enfants.
        </Alert>
      )}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {eleveInfo && (
        <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #2e7d32, #1b5e20)', color: 'white' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2}>
              <EventNoteIcon sx={{ fontSize: 48, color: 'white' }} />
              <Box>
                <Typography variant="h5" fontWeight="bold" color="white">
                  {eleveInfo.prenom} {eleveInfo.nom}
                </Typography>
                <Typography color="rgba(255,255,255,0.8)">
                  Matricule : {eleveInfo.matricule}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {[
            { label: 'Présences', value: presents, color: 'success' },
            { label: 'Absences non justifiées', value: absents, color: 'error' },
            { label: 'Absences justifiées', value: justifiees, color: 'info' },
            { label: 'Retards', value: retards, color: 'warning' },
          ].map(stat => (
            <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
              <Card sx={{ borderLeft: `5px solid ${stat.color}.main` }}>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h3" fontWeight="bold" color={`${stat.color}.main`}>
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!error && (
        <Alert severity={taux >= 80 ? 'success' : taux >= 60 ? 'warning' : 'error'} sx={{ mb: 2 }}>
          Taux de présence : <strong>{taux}%</strong> sur {presences.length} séances
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
                    <TableCell><strong>Cours</strong></TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                    <TableCell><strong>Motif</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {presences.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">Aucune présence enregistrée</TableCell>
                    </TableRow>
                  ) : (
                    presences.map(p => (
                      <TableRow key={p.id} hover>
                        <TableCell>{p.date}</TableCell>
                        <TableCell>{p.matiere_nom || '—'}</TableCell>
                        <TableCell>
                          <Chip label={statutLabel(p.statut, p.justifiee)} color={statutColor(p.statut, p.justifiee)} size="small" />
                        </TableCell>
                        <TableCell>{p.motif_justification || p.motif || '—'}</TableCell>
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
