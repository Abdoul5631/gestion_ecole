import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { presenceService, eleveService, getResults } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, TextField, Alert, CircularProgress, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { readThrough, cacheSet, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';

import { estEnLigne } from 'offline/reseau';
export default function MarquerPresences() {
  const { classeMatiereId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [classeMatiere, setClasseMatiere] = useState(null);
  const [eleves, setEleves] = useState([]);
  // seule la date du jour est permise (date locale, pas UTC)
  const [date] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });
  const [presences, setPresences] = useState({});

  const loadPresences = async (d) => {
    try {
      const result = await readThrough(CacheKeys.presences(classeMatiereId, d), async () => {
        const res = await presenceService.getAll(`/presences/?classe_matiere_id=${classeMatiereId}&date=${d}`);
        const { items } = getResults(res);
        return items;
      });
      if (result.neverCached) return;
      const items = result.data || [];
      setPresences((prev) => {
        const updated = { ...prev };
        items.forEach((p) => {
          // anciens appels (retard, excusé) : seul « absent » reste une absence
          if (updated[p.eleve] !== undefined) updated[p.eleve] = p.statut === 'ABSENT' ? 'ABSENT' : 'PRESENT';
        });
        return updated;
      });
    } catch { /* pas de présences pour ce jour */ }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const cmResult = await readThrough(CacheKeys.classeMatiere(classeMatiereId), async () => {
          const resCM = await api.get(`/classe-matieres/${classeMatiereId}/`);
          return resCM.data;
        });
        if (cmResult.neverCached || !cmResult.data) {
          setError(NEVER_CACHED_MSG);
          return;
        }
        setClasseMatiere(cmResult.data);

        const elResult = await readThrough(CacheKeys.elevesClasse(cmResult.data.classe), async () => {
          const resEl = await eleveService.getAll(`/eleves/?classe_id=${cmResult.data.classe}`);
          const { items } = getResults(resEl);
          return items;
        });
        if (elResult.neverCached || !elResult.data) {
          setError(NEVER_CACHED_MSG);
          return;
        }
        const elevesItems = elResult.data;
        setEleves(elevesItems);

        const init = {};
        elevesItems.forEach((el) => { init[el.id] = 'PRESENT'; });
        setPresences(init);

        await loadPresences(date);
      } catch {
        setError(estEnLigne() ? 'Erreur lors du chargement des données.' : NEVER_CACHED_MSG);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [classeMatiereId]);

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const presencesToSubmit = Object.entries(presences).map(([eleveId, statut]) => ({
        eleve_id: parseInt(eleveId, 10),
        statut,
      }));
      const payload = {
        classe_matiere_id: parseInt(classeMatiereId, 10),
        date,
        presences: presencesToSubmit,
      };
      const result = await sendOrQueue({
        kind: 'presences_masse',
        payload,
        label: `Appel ${date}`,
      });
      // Mettre à jour le cache local immédiatement
      await cacheSet(
        CacheKeys.presences(classeMatiereId, date),
        presencesToSubmit.map((p) => ({
          eleve: p.eleve_id,
          statut: p.statut,
          classe_matiere: payload.classe_matiere_id,
          date,
        }))
      );
      setSuccess(result.queued ? QUEUED_MSG : 'Présences enregistrées !');
      setTimeout(() => setSuccess(''), 5000);
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/enseignant/cours')}>Retour</Button>
        <Box>
          <Typography variant="h4" fontWeight="bold">Appel / Présences</Typography>
          {classeMatiere && (
            <Typography variant="subtitle1" color="text.secondary">
              {classeMatiere.matiere_nom} — {classeMatiere.classe_nom}
            </Typography>
          )}
        </Box>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      <Alert severity="info" sx={{ mb: 2 }}>
        Chaque professeur fait l&apos;appel le jour même, pendant son heure de cours : on ne peut pas le faire à l&apos;avance ni après coup.
      </Alert>

      {!error && (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField label="Date de l'appel" type="date" fullWidth size="small" disabled
                    InputLabelProps={{ shrink: true }} value={date}
                    helperText="Seul l'appel du jour est possible." />
                </Grid>
                <Grid size={{ xs: 12, md: 8 }}>
                  <Typography variant="body2" color="text.secondary">
                    P = Présent · A = Absent. La direction justifie ensuite les absences si besoin.
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
                <Typography variant="h6">{eleves.length} élève(s)</Typography>
                <Button size="small" variant="contained" color="success" startIcon={<SaveIcon />}
                  onClick={handleSubmit} disabled={saving || eleves.length === 0}>
                  {saving ? 'Enregistrement...' : "Valider l'appel"}
                </Button>
              </Box>

              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'success.main' }}>
                    <TableRow>
                      <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                      <TableCell sx={{ color: 'white' }}><strong>Nom Prénom</strong></TableCell>
                      <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {eleves.map((el) => (
                      <TableRow key={el.id} hover>
                        <TableCell>{el.matricule}</TableCell>
                        <TableCell>{el.nom} {el.prenom}</TableCell>
                        <TableCell>
                          <ToggleButtonGroup
                            value={presences[el.id] || 'PRESENT'}
                            exclusive
                            onChange={(e, val) => { if (val) setPresences((prev) => ({ ...prev, [el.id]: val })); }}
                            size="small">
                            <ToggleButton value="PRESENT" sx={{ px: 1.5 }}>P</ToggleButton>
                            <ToggleButton value="ABSENT" color="error" sx={{ px: 1.5 }}>A</ToggleButton>
                          </ToggleButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
