import { useEffect, useState } from 'react';
import { presenceService, eleveService, getResults } from '../../services/api';
import api from '../../services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Chip, CircularProgress, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, MenuItem, Alert
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';

const initForm = {
  eleve: '', classe_matiere: '',
  date: '', statut: 'PRESENT', motif: ''
};

export default function ListePresences() {
  const [presences, setPresences] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      presenceService.getAll(),
      eleveService.getAll(),
      api.get('/classe-matieres/')
    ])
      .then(([presRes, elevRes, cmRes]) => {
        setPresences(presRes.data);
        setEleves(getResults(elevRes).items);
        setClasseMatieres(cmRes.data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = presences.filter(p =>
    `${p.eleve_nom} ${p.eleve_prenom} ${p.statut}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    setSaving(true);
    setError('');
    const payload = { ...form };
    if (!payload.classe_matiere) delete payload.classe_matiere;
    presenceService.create(payload)
      .then(() => {
        setSuccess('Présence enregistrée avec succès !');
        setForm(initForm);
        setOpen(false);
        fetchData();
        setTimeout(() => setSuccess(''), 3000);
      })
      .catch(() => {
        setError('Erreur lors de l\'enregistrement. Vérifiez les informations.');
      })
      .finally(() => setSaving(false));
  };

  const statutColor = (statut) => {
    if (statut === 'PRESENT') return 'success';
    if (statut === 'ABSENT') return 'error';
    if (statut === 'RETARD') return 'warning';
    if (statut === 'EXCUSE') return 'info';
    return 'default';
  };

  const statutLabel = (statut) => {
    if (statut === 'PRESENT') return 'Présent';
    if (statut === 'ABSENT') return 'Absent';
    if (statut === 'RETARD') return 'En retard';
    if (statut === 'EXCUSE') return 'Excusé';
    return statut;
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Présences</Typography>
        <Button variant="contained" startIcon={<AddIcon />} color="primary" onClick={() => setOpen(true)}>
          Nouvelle Présence
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Rechercher par élève ou statut..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>
            }}
          />
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell><strong>Élève</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                    <TableCell><strong>Motif</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">Aucune présence trouvée</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(p => (
                      <TableRow key={p.id} hover>
                        <TableCell>{p.eleve_nom} {p.eleve_prenom}</TableCell>
                        <TableCell>{p.date}</TableCell>
                        <TableCell>
                          <Chip
                            label={statutLabel(p.statut)}
                            color={statutColor(p.statut)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{p.motif || '—'}</TableCell>
                        <TableCell>
                          <Button size="small" variant="outlined">Voir</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Typography variant="body2" color="text.secondary" mt={2}>
            {filtered.length} présence(s) trouvée(s)
          </Typography>
        </CardContent>
      </Card>

      {/* Modal Ajout Présence */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h5" fontWeight="bold">Nouvelle Présence</Typography>
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
                fullWidth select label="Cours (optionnel)" name="classe_matiere"
                value={form.classe_matiere} onChange={handleChange}
              >
                <MenuItem value="">— Aucun cours spécifique —</MenuItem>
                {classeMatieres.map(cm => (
                  <MenuItem key={cm.id} value={cm.id}>
                    {cm.niveau_nom} — {cm.matiere_nom}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Date" name="date"
                type="date" value={form.date} onChange={handleChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth select label="Statut" name="statut"
                value={form.statut} onChange={handleChange}
              >
                <MenuItem value="PRESENT">Présent</MenuItem>
                <MenuItem value="ABSENT">Absent</MenuItem>
                <MenuItem value="RETARD">En retard</MenuItem>
                <MenuItem value="EXCUSE">Absent excusé</MenuItem>
              </TextField>
            </Grid>
            {(form.statut === 'ABSENT' || form.statut === 'EXCUSE' || form.statut === 'RETARD') && (
              <Grid item xs={12}>
                <TextField
                  fullWidth label="Motif" name="motif"
                  value={form.motif} onChange={handleChange}
                  multiline rows={3}
                  placeholder="Raison de l'absence ou du retard..."
                />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button
            variant="contained" onClick={handleSubmit}
            disabled={saving || !form.eleve || !form.date}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}