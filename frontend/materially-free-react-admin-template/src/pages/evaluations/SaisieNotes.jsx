import { useEffect, useState } from 'react';
import { noteService, evaluationService, eleveService, getResults } from '../../services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, CircularProgress, TextField, Alert, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

const initForm = {
  eleve: '', evaluation: '', valeur: '', est_absent: false, observation: ''
};

export default function SaisieNotes() {
  const [notes, setNotes] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      noteService.getAll(),
      evaluationService.getAll(),
      eleveService.getAll()
    ])
      .then(([notesRes, evalsRes, elevesRes]) => {
        setNotes(getResults(notesRes).items.slice(0, 100));
        setEvaluations(getResults(evalsRes).items);
        setEleves(getResults(elevesRes).items);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    setSaving(true);
    setError('');
    noteService.create(form)
      .then(() => {
        setSuccess('Note enregistrée avec succès !');
        setForm(initForm);
        setOpen(false);
        fetchData();
        setTimeout(() => setSuccess(''), 3000);
      })
      .catch(() => {
        setError('Erreur. Vérifiez que la note n\'existe pas déjà pour cet élève.');
      })
      .finally(() => setSaving(false));
  };

  // Trouver l'évaluation sélectionnée pour afficher note_sur
  const evalSelected = evaluations.find(e => e.id === parseInt(form.evaluation));

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Saisie des Notes</Typography>
        <Button variant="contained" startIcon={<AddIcon />} color="primary" onClick={() => setOpen(true)}>
          Nouvelle Note
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell><strong>Élève</strong></TableCell>
                    <TableCell><strong>Évaluation</strong></TableCell>
                    <TableCell><strong>Matière</strong></TableCell>
                    <TableCell><strong>Trimestre</strong></TableCell>
                    <TableCell><strong>Note</strong></TableCell>
                    <TableCell><strong>Absent</strong></TableCell>
                    <TableCell><strong>Observation</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">Aucune note trouvée</TableCell>
                    </TableRow>
                  ) : (
                    notes.map(n => (
                      <TableRow key={n.id} hover>
                        <TableCell>{n.eleve_nom} {n.eleve_prenom}</TableCell>
                        <TableCell>{n.evaluation_type}</TableCell>
                        <TableCell>{n.matiere_nom}</TableCell>
                        <TableCell>{n.trimestre_nom}</TableCell>
                        <TableCell>
                          <strong>{n.valeur}</strong>/{n.evaluation_note_sur}
                        </TableCell>
                        <TableCell>{n.est_absent ? '✅ Oui' : '—'}</TableCell>
                        <TableCell>{n.observation || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Typography variant="body2" color="text.secondary" mt={2}>
            {notes.length} note(s) enregistrée(s)
          </Typography>
        </CardContent>
      </Card>

      {/* Modal Saisie Note */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h5" fontWeight="bold">Nouvelle Note</Typography>
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth select label="Élève" name="eleve"
                value={form.eleve} onChange={handleChange}
              >
                {eleves.map(e => (
                  <MenuItem key={e.id} value={e.id}>
                    {e.matricule} — {e.nom} {e.prenom}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth select label="Évaluation" name="evaluation"
                value={form.evaluation} onChange={handleChange}
              >
                {evaluations.map(e => (
                  <MenuItem key={e.id} value={e.id}>
                    {e.type} — {e.matiere_nom} — {e.niveau_nom} ({e.date})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth label={`Note ${evalSelected ? `(sur ${evalSelected.note_sur})` : ''}`}
                name="valeur" type="number"
                value={form.valeur} onChange={handleChange}
                inputProps={{ min: 0, max: evalSelected ? evalSelected.note_sur : 20, step: 0.25 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth label="Observation (optionnel)" name="observation"
                value={form.observation} onChange={handleChange}
                multiline rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button
            variant="contained" onClick={handleSubmit}
            disabled={saving || !form.eleve || !form.evaluation || form.valeur === ''}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}