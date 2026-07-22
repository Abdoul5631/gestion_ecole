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

export default function MarquerPresences() {
  const { classeMatiereId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [classeMatiere, setClasseMatiere] = useState(null);
  const [eleves, setEleves] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [presences, setPresences] = useState({});

  const loadPresences = async (cmData, d) => {
    try {
      const res = await presenceService.getAll(`/presences/?classe_matiere_id=${classeMatiereId}&date=${d}`);
      setPresences(prev => {
        const updated = { ...prev };
        res.data.forEach(p => { if (updated[p.eleve] !== undefined) updated[p.eleve] = p.statut; });
        return updated;
      });
    } catch { /* pas de présences pour ce jour */ }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const resCM = await api.get(`/classe-matieres/${classeMatiereId}/`);
        setClasseMatiere(resCM.data);

        const resEl = await eleveService.getAll(`/eleves/?classe_id=${resCM.data.classe}`);
        const { items: elevesItems } = getResults(resEl);
        setEleves(elevesItems);

        const init = {};
        elevesItems.forEach(el => { init[el.id] = 'PRESENT'; });
        setPresences(init);

        await loadPresences(resCM.data, date);
      } catch {
        setError('Erreur lors du chargement des données.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [classeMatiereId]);

  const handleDateChange = async (e) => {
    setDate(e.target.value);
    await loadPresences(classeMatiere, e.target.value);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const presencesToSubmit = Object.entries(presences).map(([eleveId, statut]) => ({
        eleve_id: parseInt(eleveId),
        statut,
      }));
      await presenceService.saisieMasse({
        classe_matiere_id: classeMatiereId,
        date,
        presences: presencesToSubmit,
      });
      setSuccess('Présences enregistrées !');
      setTimeout(() => setSuccess(''), 4000);
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Date de l'appel" type="date" fullWidth size="small"
                InputLabelProps={{ shrink: true }} value={date} onChange={handleDateChange} />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Typography variant="body2" color="text.secondary">
                P = Présent · A = Absent · R = Retard · E = Excusé
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
              onClick={handleSubmit} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Valider l\'appel'}
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
                {eleves.map(el => (
                  <TableRow key={el.id} hover>
                    <TableCell>{el.matricule}</TableCell>
                    <TableCell>{el.nom} {el.prenom}</TableCell>
                    <TableCell>
                      <ToggleButtonGroup
                        value={presences[el.id] || 'PRESENT'}
                        exclusive
                        onChange={(e, val) => { if (val) setPresences(prev => ({ ...prev, [el.id]: val })); }}
                        size="small">
                        <ToggleButton value="PRESENT" sx={{ px: 1.5 }}>P</ToggleButton>
                        <ToggleButton value="ABSENT" color="error" sx={{ px: 1.5 }}>A</ToggleButton>
                        <ToggleButton value="RETARD" color="warning" sx={{ px: 1.5 }}>R</ToggleButton>
                        <ToggleButton value="EXCUSE" color="info" sx={{ px: 1.5 }}>E</ToggleButton>
                      </ToggleButtonGroup>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
