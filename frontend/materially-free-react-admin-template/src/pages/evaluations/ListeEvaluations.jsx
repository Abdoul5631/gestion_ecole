import { idTrimestreParDefaut, trimestresEnCours } from 'utils/anneeDefaut';
import { useEffect, useState } from 'react';
import { evaluationService, anneeService, getResults } from '../../services/api';
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
import { peutSaisir } from 'utils/droits';

const initForm = {
  classe_matiere: '', trimestre: '',
  type: 'DEVOIR1', libelle: '',
  date: '', coefficient: 1, note_sur: 20
};

export default function ListeEvaluations() {
  const saisie = peutSaisir('pedagogie'); // le directeur consulte, l'enseignant saisit
  const [evaluations, setEvaluations] = useState([]);
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
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
      evaluationService.getAll(),
      api.get('/classe-matieres/'),
      api.get('/trimestres/')
    ])
      .then(([evalsRes, cmRes, trimRes]) => {
        setEvaluations(getResults(evalsRes).items);
        setClasseMatieres(getResults(cmRes).items);
        setTrimestres(trimestresEnCours(getResults(trimRes).items));
        setForm(f => ({ ...f, trimestre: f.trimestre || idTrimestreParDefaut(getResults(trimRes).items) }));
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = evaluations.filter(e =>
    `${e.type} ${e.matiere_nom} ${e.niveau_nom}`.toLowerCase().includes(search.toLowerCase())
  );

  const formIsClasseExamen = !!classeMatieres.find(cm => String(cm.id) === String(form.classe_matiere))?.niveau_is_classe_examen;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = () => {
    setSaving(true);
    setError('');
    evaluationService.create(form)
      .then(() => {
        setSuccess('Évaluation ajoutée avec succès !');
        setForm({ ...initForm, trimestre: idTrimestreParDefaut(trimestres) });
        setOpen(false);
        fetchData();
        setTimeout(() => setSuccess(''), 3000);
      })
      .catch(() => {
        setError('Erreur lors de l\'ajout. Vérifiez les informations.');
      })
      .finally(() => setSaving(false));
  };

  const typeColor = (type) => {
    if (type === 'EXAMEN_BLANC') return 'error';
    if (type === 'COMPOSITION') return 'warning';
    if (type === 'DEVOIR1') return 'primary';
    if (type === 'DEVOIR2') return 'secondary';
    return 'default';
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight="bold">Évaluations</Typography>
        {saisie && (
          <Button variant="contained" startIcon={<AddIcon />} color="primary" onClick={() => setOpen(true)}>
            Nouvelle Évaluation
          </Button>
        )}
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card>
        <CardContent>
          <TextField
            fullWidth
            placeholder="Rechercher par type, matière ou niveau..."
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
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>Matière</strong></TableCell>
                    <TableCell><strong>Niveau</strong></TableCell>
                    <TableCell><strong>Trimestre</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Coefficient</strong></TableCell>
                    <TableCell><strong>Sur</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">Aucune évaluation trouvée</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(e => (
                      <TableRow key={e.id} hover>
                        <TableCell>
                          <Chip label={e.type} color={typeColor(e.type)} size="small" />
                        </TableCell>
                        <TableCell>{e.matiere_nom}</TableCell>
                        <TableCell>{e.niveau_nom}</TableCell>
                        <TableCell>{e.trimestre_nom}</TableCell>
                        <TableCell>{e.date}</TableCell>
                        <TableCell>{e.coefficient}</TableCell>
                        <TableCell>{e.note_sur}</TableCell>
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
            {filtered.length} évaluation(s) trouvée(s)
          </Typography>
        </CardContent>
      </Card>

      {/* Modal Ajout Évaluation */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Typography variant="h5" fontWeight="bold">Nouvelle Évaluation</Typography>
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth select label="Cours (Niveau / Matière)" name="classe_matiere"
                value={form.classe_matiere} onChange={handleChange}
              >
                {classeMatieres.map(cm => (
                  <MenuItem key={cm.id} value={cm.id}>
                    {cm.niveau_nom} — {cm.matiere_nom}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth select label="Trimestre" name="trimestre"
                value={form.trimestre} onChange={handleChange}
              >
                {trimestres.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.annee_libelle} — {t.nom}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth select label="Type" name="type"
                value={form.type} onChange={handleChange}
              >
                {[['DEVOIR1', 'Devoir 1'], ['DEVOIR2', 'Devoir 2']].map(([k, v]) => {
                  const deja = evaluations.some(ev => String(ev.classe_matiere) === String(form.classe_matiere)
                    && String(ev.trimestre) === String(form.trimestre) && ev.type === k);
                  return <MenuItem key={k} value={k} disabled={deja}>{v}{deja ? ' — déjà programmé' : ''}</MenuItem>;
                })}
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
                fullWidth label="Coefficient" name="coefficient"
                type="number" value={form.coefficient} onChange={handleChange}
                inputProps={{ min: 0.5, step: 0.5 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Note sur" name="note_sur"
                type="number" value={form.note_sur} onChange={handleChange}
                inputProps={{ min: 1 }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth label="Libellé (optionnel)" name="libelle"
                value={form.libelle} onChange={handleChange}
                placeholder="ex: Devoir n°1 chapitre 3"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button
            variant="contained" onClick={handleSubmit}
            disabled={saving || !form.classe_matiere || !form.trimestre || !form.date}
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}