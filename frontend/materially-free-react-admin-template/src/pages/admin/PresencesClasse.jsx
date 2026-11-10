import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, MenuItem, CircularProgress, Alert, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { classeMatiereService, presenceService, eleveService, classeService, getResults } from 'services/api';
import { peutSaisir } from 'utils/droits';

const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Présent' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'RETARD', label: 'Retard' },
  { value: 'EXCUSE', label: 'Excusé' }
];

export default function PresencesClasse() {
  const saisie = peutSaisir('pedagogie'); // le directeur consulte, l'enseignant saisit
  const [classes, setClasses] = useState([]);
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [selectedClasse, setSelectedClasse] = useState('');
  const [selectedCM, setSelectedCM] = useState('');

  const lastSchoolDay = () => {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };
  const [selectedDate, setSelectedDate] = useState(lastSchoolDay);

  const [eleves, setEleves] = useState([]);
  const [presencesData, setPresencesData] = useState({});

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([classeService.getAll(), classeMatiereService.getAll()])
      .then(([resC, resCM]) => {
        setClasses(resC.data);
        setClasseMatieres(resCM.data);
      });
  }, []);

  const filteredCMs = selectedClasse
    ? classeMatieres.filter(cm => String(cm.classe) === String(selectedClasse))
    : [];

  const handleClasseChange = (e) => {
    setSelectedClasse(e.target.value);
    setSelectedCM('');
    setEleves([]);
    setPresencesData({});
  };

  const loadData = (cmId, date) => {
    if (!cmId || !date || !selectedClasse) return;
    setLoading(true);
    Promise.all([
      eleveService.getAll(`/eleves/?classe_id=${selectedClasse}`),
      presenceService.getAll(`/presences/?classe_matiere_id=${cmId}&date=${date}`)
    ]).then(([resEl, resPr]) => {
      const { items: elevesItems } = getResults(resEl);
      setEleves(elevesItems);
      const { items: presencesItems } = getResults(resPr);
      const init = {};
      elevesItems.forEach(el => {
        const existing = presencesItems.find(p => p.eleve === el.id);
        init[el.id] = existing ? existing.statut : 'PRESENT';
      });
      setPresencesData(init);
    }).finally(() => setLoading(false));
  };

  const handleCMChange = (e) => {
    const cmId = e.target.value;
    setSelectedCM(cmId);
    loadData(cmId, selectedDate);
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    loadData(selectedCM, e.target.value);
  };

  const handleStatusChange = (eleveId, newStatut) => {
    if (newStatut !== null) {
      setPresencesData(prev => ({ ...prev, [eleveId]: newStatut }));
    }
  };

  const handleSave = async () => {
    if (!selectedCM || !selectedDate) return;
    setSaving(true);
    setError('');
    try {
      const presences = Object.entries(presencesData).map(([eleveId, statut]) => ({
        eleve_id: parseInt(eleveId),
        statut
      }));
      await presenceService.saisieMasse({
        classe_matiere_id: selectedCM,
        date: selectedDate,
        presences
      });
      setSuccess(`Présences enregistrées pour ${presences.length} élève(s) !`);
      setTimeout(() => setSuccess(''), 4000);
    } catch {
      setError("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Gestion des Présences par Classe</Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>1. Classe</Typography>
              <TextField select fullWidth size="small" value={selectedClasse} onChange={handleClasseChange}>
                <MenuItem value=""><em>Sélectionner une classe</em></MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>2. Matière</Typography>
              <TextField select fullWidth size="small" value={selectedCM} onChange={handleCMChange}
                disabled={!selectedClasse}>
                <MenuItem value=""><em>Sélectionner une matière</em></MenuItem>
                {filteredCMs.map(cm => (
                  <MenuItem key={cm.id} value={cm.id}>
                    {cm.matiere_nom}{cm.enseignant_nom ? ` (${cm.enseignant_nom})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>3. Date</Typography>
              <TextField type="date" fullWidth size="small"
                value={selectedDate} onChange={handleDateChange}
                InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {selectedCM && selectedDate && eleves.length > 0 && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
              <Typography variant="h6">{eleves.length} élève(s) — {selectedDate}</Typography>
              {saisie && (
                <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              )}
            </Box>

            {loading ? (
              <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
            ) : (
              <TableContainer component={Paper} elevation={0} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'primary.main' }}>
                    <TableRow>
                      <TableCell sx={{ color: 'white', width: '15%' }}><strong>Matricule</strong></TableCell>
                      <TableCell sx={{ color: 'white', width: '30%' }}><strong>Nom Prénom</strong></TableCell>
                      <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {eleves.map(eleve => (
                      <TableRow key={eleve.id} hover>
                        <TableCell>{eleve.matricule}</TableCell>
                        <TableCell>{eleve.nom} {eleve.prenom}</TableCell>
                        <TableCell>
                          <ToggleButtonGroup
                            value={presencesData[eleve.id] || 'PRESENT'}
                            exclusive
                            disabled={!saisie}
                            onChange={(e, val) => handleStatusChange(eleve.id, val)}
                            size="small"
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <ToggleButton key={opt.value} value={opt.value}
                                sx={{ py: 0.5, px: 1, fontSize: '0.75rem' }}>
                                {opt.label}
                              </ToggleButton>
                            ))}
                          </ToggleButtonGroup>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
