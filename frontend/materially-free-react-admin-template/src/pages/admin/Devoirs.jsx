import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Chip, IconButton, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DateRangeIcon from '@mui/icons-material/DateRange';
import { evaluationService, classeMatiereService, classeService, trimestreService } from 'services/api';
import useIsMobile from 'hooks/useIsMobile';
import { useNavigate } from 'react-router-dom';

const TYPE_COLORS = { DEVOIR1: 'primary', DEVOIR2: 'secondary', COMPOSITION: 'warning', EXAMEN_BLANC: 'error' };
const TYPE_LABELS = { DEVOIR1: 'Devoir 1', DEVOIR2: 'Devoir 2', COMPOSITION: 'Composition', EXAMEN_BLANC: 'Examen Blanc' };

const initForm = { type: 'DEVOIR1', coefficient: 1, trimestre: '', classe_matiere: '', date: '' };

export default function Devoirs() {
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState([]);
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [classes, setClasses] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterClasse, setFilterClasse] = useState('');
  const [filterMatiere, setFilterMatiere] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterTrimestre, setFilterTrimestre] = useState('');

  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const isMobile = useIsMobile();
  const [evalNotes, setEvalNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState(initForm);

  useEffect(() => {
    // Données de référence (filtres + formulaire) — chargées indépendamment
    Promise.all([
      classeMatiereService.getAll(),
      classeService.getAll(),
      trimestreService.getAll()
    ]).then(([resCM, resC, resT]) => {
      setClasseMatieres(resCM.data);
      setClasses(resC.data);
      setTrimestres(resT.data);
    }).catch(() => setError('Erreur de chargement des données de référence.'));

    // Évaluations séparément
    setLoading(true);
    evaluationService.getAll()
      .then(res => setEvaluations(res.data))
      .catch(() => setError('Erreur de chargement des évaluations.'))
      .finally(() => setLoading(false));
  }, []);

  const fetchData = () => {
    evaluationService.getAll().then(res => setEvaluations(res.data));
  };

  // Options matières dérivées des classeMatieres (filtrées par classe si sélectionnée)
  const cmForClasse = filterClasse
    ? classeMatieres.filter(cm => String(cm.classe) === String(filterClasse))
    : classeMatieres;
  const matiereOptions = [...new Map(cmForClasse.map(cm => [cm.matiere, { id: cm.matiere, nom: cm.matiere_nom }])).values()];

  // classeMatieres filtrées pour le formulaire de création
  const filteredCMsForm = form.classe_matiere_classe
    ? classeMatieres.filter(cm => String(cm.classe) === String(form.classe_matiere_classe))
    : classeMatieres;

  const formClasseIsExamen = !!classes.find(c => String(c.id) === String(form.classe_matiere_classe))?.niveau_is_classe_examen;
  const typeOptionsForm = Object.entries(TYPE_LABELS).filter(([k]) => k !== 'EXAMEN_BLANC' || formClasseIsExamen);

  const filtered = evaluations.filter(ev => {
    const cm = classeMatieres.find(c => c.id === ev.classe_matiere);
    const matchClasse = !filterClasse || (cm && String(cm.classe) === String(filterClasse));
    const matchMatiere = !filterMatiere || (cm && String(cm.matiere) === String(filterMatiere));
    const matchType = !filterType || ev.type === filterType;
    const matchTrimestre = !filterTrimestre || String(ev.trimestre) === String(filterTrimestre);
    return matchClasse && matchMatiere && matchType && matchTrimestre;
  });

  const handleCreate = async () => {
    setError('');
    try {
      const payload = {
        type: form.type,
        coefficient: parseFloat(form.coefficient),
        trimestre: form.trimestre,
        classe_matiere: form.classe_matiere,
      };
      if (form.date) payload.date = form.date;
      await evaluationService.create(payload);
      setSuccess('Évaluation créée !');
      setOpen(false);
      setForm(initForm);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError("Erreur lors de la création.");
    }
  };

  const handleToggleCancel = async () => {
    try {
      await evaluationService.patch(selected.id, { is_active: !selected.is_active });
      const msg = selected.is_active ? 'Évaluation annulée.' : 'Évaluation réactivée !';
      setSuccess(msg);
      setCancelOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
      setCancelOpen(false);
    }
  };

  const handleOpenNotes = (ev) => {
    setSelected(ev);
    setEvalNotes([]);
    setNotesOpen(true);
    setLoadingNotes(true);
    evaluationService.getNotes(ev.id)
      .then(res => setEvalNotes(res.data))
      .finally(() => setLoadingNotes(false));
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Devoirs & Évaluations</Typography>
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            variant="outlined" size="small" startIcon={<DateRangeIcon />} color="warning"
            onClick={() => navigate('/admin/compositions')}>
            Calendrier des Compositions
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />}
            onClick={() => { setError(''); setForm(initForm); setOpen(true); }}>
            Nouvelle Évaluation
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Filtres */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField select fullWidth label="Classe" size="small"
                value={filterClasse} onChange={e => { setFilterClasse(e.target.value); setFilterMatiere(''); }}>
                <MenuItem value="">Toutes les classes</MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField select fullWidth label="Matière" size="small"
                value={filterMatiere} onChange={e => setFilterMatiere(e.target.value)}
                >
                <MenuItem value="">Toutes les matières</MenuItem>
                {matiereOptions.map(m => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField select fullWidth label="Type" size="small"
                value={filterType} onChange={e => setFilterType(e.target.value)}>
                <MenuItem value="">Tous les types</MenuItem>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField select fullWidth label="Trimestre" size="small"
                value={filterTrimestre} onChange={e => setFilterTrimestre(e.target.value)}>
                <MenuItem value="">Tous les trimestres</MenuItem>
                {trimestres.map(t => <MenuItem key={t.id} value={t.id}>{t.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table>
                <TableHead sx={{ bgcolor: 'primary.main' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'white' }}><strong>Classe</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Matière</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Type</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Date</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Trimestre</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        Aucune évaluation trouvée.
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(ev => (
                    <TableRow key={ev.id} hover
                      sx={{ opacity: ev.is_active ? 1 : 0.55, bgcolor: ev.is_active ? 'inherit' : '#fff8e1' }}>
                      <TableCell>{ev.classe_nom}</TableCell>
                      <TableCell><strong>{ev.matiere_nom}</strong></TableCell>
                      <TableCell>
                        <Chip label={TYPE_LABELS[ev.type] || ev.type}
                          color={TYPE_COLORS[ev.type] || 'default'} size="small" />
                      </TableCell>
                      <TableCell>{ev.date || <em style={{ color: '#bbb' }}>—</em>}</TableCell>
                      <TableCell>{ev.trimestre_nom}</TableCell>
                      <TableCell>
                        <Chip
                          label={ev.is_active ? 'Active' : 'Annulée'}
                          color={ev.is_active ? 'success' : 'default'}
                          size="small" variant={ev.is_active ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" gap={0.5} justifyContent="flex-end">
                          <Tooltip title="Voir les notes">
                            <IconButton size="small" color="primary" onClick={() => handleOpenNotes(ev)}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={ev.is_active ? 'Annuler' : 'Réactiver'}>
                            <IconButton size="small"
                              color={ev.is_active ? 'warning' : 'success'}
                              onClick={() => { setSelected(ev); setCancelOpen(true); }}>
                              {ev.is_active
                                ? <PauseCircleIcon fontSize="small" />
                                : <PlayCircleIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {filtered.length} évaluation(s)
          </Typography>
        </CardContent>
      </Card>

      {/* Dialog Création */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvelle Évaluation</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={6}>
              <TextField select fullWidth label="Classe" size="small"
                value={form.classe_matiere_classe || ''}
                onChange={e => setForm({ ...form, classe_matiere_classe: e.target.value, classe_matiere: '' })}>
                <MenuItem value=""><em>Sélectionner</em></MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField select fullWidth label="Matière" size="small"
                value={form.classe_matiere}
                onChange={e => setForm({ ...form, classe_matiere: e.target.value })}
                disabled={!form.classe_matiere_classe}>
                <MenuItem value=""><em>Sélectionner</em></MenuItem>
                {filteredCMsForm.map(cm => (
                  <MenuItem key={cm.id} value={cm.id}>{cm.matiere_nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField select fullWidth label="Type" size="small"
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value })}>
                {typeOptionsForm.map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Date" size="small"
                type="date" value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Trimestre" size="small"
                value={form.trimestre}
                onChange={e => setForm({ ...form, trimestre: e.target.value })}>
                <MenuItem value=""><em>Sélectionner</em></MenuItem>
                {trimestres.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.annee_libelle} — {t.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={!form.trimestre || !form.classe_matiere}>
            Créer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Annuler / Réactiver */}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.is_active ? "Annuler l'évaluation" : "Réactiver l'évaluation"}
        </DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>
                Annuler le <strong>{TYPE_LABELS[selected?.type]}</strong> de{' '}
                <strong>{selected?.matiere_nom}</strong> ({selected?.classe_nom}) ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                L'évaluation sera marquée comme annulée. Les notes existantes restent conservées.
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver le <strong>{TYPE_LABELS[selected?.type]}</strong> de{' '}
              <strong>{selected?.matiere_nom}</strong> ({selected?.classe_nom}) ?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setCancelOpen(false)} color="inherit">Fermer</Button>
          <Button variant="contained"
            color={selected?.is_active ? 'warning' : 'success'}
            onClick={handleToggleCancel}>
            {selected?.is_active ? 'Annuler' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Notes */}
      <Dialog open={notesOpen} onClose={() => setNotesOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Notes — {selected?.matiere_nom} ({selected?.classe_nom}) · {selected && TYPE_LABELS[selected.type]}
          {selected?.date && <Typography variant="body2" color="text.secondary">Date : {selected.date}</Typography>}
        </DialogTitle>
        <DialogContent dividers>
          {loadingNotes ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell><strong>Matricule</strong></TableCell>
                    <TableCell><strong>Nom Prénom</strong></TableCell>
                    <TableCell><strong>Note</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {evalNotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        Aucune note saisie.
                      </TableCell>
                    </TableRow>
                  ) : evalNotes.map(n => (
                    <TableRow key={n.id}>
                      <TableCell>{n.eleve_matricule}</TableCell>
                      <TableCell>{n.eleve_prenom} {n.eleve_nom}</TableCell>
                      <TableCell><strong>{n.valeur}</strong></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNotesOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
