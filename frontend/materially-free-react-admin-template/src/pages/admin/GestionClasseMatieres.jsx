import { useEffect, useState } from 'react';
import { classeMatiereService, enseignantService, matiereService, classeService } from 'services/api';
import {
  Box, Typography, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Tooltip, CircularProgress, Chip, Grid,
  InputAdornment
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import useIsMobile from 'hooks/useIsMobile';

const initForm = { classe: '', matiere: '', enseignant: '', coef: 1.0 };

export default function GestionClasseMatieres() {
  const [data, setData] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterMatiere, setFilterMatiere] = useState('');

  const [form, setForm] = useState(initForm);
  const [editForm, setEditForm] = useState({ enseignant: '' });
  const isMobile = useIsMobile();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resCM, resE, resM, resC] = await Promise.all([
        classeMatiereService.getAll(),
        enseignantService.getAll(),
        matiereService.getAll(),
        classeService.getAll()
      ]);
      setData(resCM.data);
      setEnseignants(resE.data);
      setMatieres(resM.data);
      setClasses(resC.data);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    try {
      const payload = { classe: form.classe, matiere: form.matiere, coef: parseFloat(form.coef) || 1.0 };
      if (form.enseignant) payload.enseignant = form.enseignant;
      await classeMatiereService.create(payload);
      setSuccess('Affectation réussie !');
      setOpen(false);
      setForm(initForm);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError("Erreur lors de l'affectation (doublon possible)");
    }
  };

  const handleOpenEdit = (d) => {
    setSelected(d);
    setEditForm({ enseignant: d.enseignant || '' });
    setError('');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const payload = {
        classe: selected.classe,
        matiere: selected.matiere,
        coef: selected.coef,
      };
      if (editForm.enseignant) payload.enseignant = editForm.enseignant;
      await classeMatiereService.update(selected.id, payload);
      setSuccess('Affectation mise à jour !');
      setEditOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la mise à jour');
    }
  };

  const handleToggleSuspend = async () => {
    try {
      await classeMatiereService.patch(selected.id, { is_active: !selected.is_active });
      const msg = selected.is_active ? 'Matière suspendue.' : 'Matière réactivée !';
      setSuccess(msg);
      setSuspendOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  // Grouper par classe avec filtres
  const grouped = classes
    .filter(c => !filterClasse || String(c.id) === String(filterClasse))
    .map(c => ({
      classe: c,
      matieres: data
        .filter(d => String(d.classe) === String(c.id))
        .filter(d => !filterMatiere || String(d.matiere) === String(filterMatiere))
        .filter(d => {
          if (!search) return true;
          const term = search.toLowerCase();
          return (
            d.matiere_nom?.toLowerCase().includes(term) ||
            d.enseignant_nom?.toLowerCase().includes(term)
          );
        })
    }))
    .filter(g => g.matieres.length > 0);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Affectation Cours — Classes</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />}
          onClick={() => { setError(''); setForm(initForm); setOpen(true); }}>
          Nouvelle Affectation
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField select fullWidth label="Filtrer par classe" size="small"
            value={filterClasse} onChange={e => setFilterClasse(e.target.value)}>
            <MenuItem value="">Toutes les classes</MenuItem>
            {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField select fullWidth label="Filtrer par matière" size="small"
            value={filterMatiere} onChange={e => setFilterMatiere(e.target.value)}>
            <MenuItem value="">Toutes les matières</MenuItem>
            {matieres.map(m => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField fullWidth placeholder="Rechercher enseignant..."
            value={search} onChange={e => setSearch(e.target.value)} size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
        </Grid>
      </Grid>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : grouped.length === 0 ? (
        <Alert severity="info">Aucune affectation trouvée.</Alert>
      ) : (
        <Box display="flex" flexDirection="column" gap={3}>
          {grouped.map(({ classe, matieres: cms }) => (
            <Paper key={classe.id} elevation={3} sx={{ overflow: 'hidden' }}>
              {/* En-tête de classe */}
              <Box sx={{
                bgcolor: 'primary.main', px: 3, py: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Typography variant="h6" color="white" fontWeight="bold">
                    {classe.nom_complet}
                  </Typography>
                  <Chip
                    label={classe.niveau_nom}
                    size="small"
                    sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 'bold' }}
                  />
                </Box>
                <Chip
                  label={`${cms.length} matière${cms.length > 1 ? 's' : ''}`}
                  size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.15)', color: 'white' }}
                />
              </Box>

              {/* Table des matières */}
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell><strong>Matière</strong></TableCell>
                      <TableCell><strong>Type</strong></TableCell>
                      <TableCell><strong>Coefficient</strong></TableCell>
                      <TableCell><strong>Enseignant</strong></TableCell>
                      <TableCell align="right"><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cms.map(d => (
                      <TableRow key={d.id} hover
                        sx={{ opacity: d.is_active ? 1 : 0.5, bgcolor: d.is_active ? 'inherit' : '#fff8e1' }}>
                        <TableCell>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography fontWeight="medium">{d.matiere_nom}</Typography>
                            {!d.is_active && <Chip label="Suspendue" color="warning" size="small" />}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={
                              d.matiere_type === 'LITTERATURE' ? 'Littérature' :
                              d.matiere_type === 'SCIENTIFIQUE' ? 'Sciences' : 'Autres'
                            }
                            size="small"
                            color={
                              d.matiere_type === 'LITTERATURE' ? 'info' :
                              d.matiere_type === 'SCIENTIFIQUE' ? 'success' : 'default'
                            }
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Chip label={`Coef ${d.coef}`} size="small" color="primary" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {d.enseignant_nom
                            ? <Chip label={d.enseignant_nom} size="small" color="secondary" variant="outlined" />
                            : <em style={{ color: '#bbb', fontSize: 13 }}>Non assigné</em>}
                        </TableCell>
                        <TableCell align="right">
                          <Box display="flex" gap={0.5} justifyContent="flex-end">
                            <Tooltip title="Modifier coefficient / enseignant">
                              <IconButton size="small" color="primary" onClick={() => handleOpenEdit(d)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={d.is_active ? 'Suspendre' : 'Réactiver'}>
                              <IconButton size="small"
                                color={d.is_active ? 'warning' : 'success'}
                                onClick={() => { setSelected(d); setSuspendOpen(true); }}>
                                {d.is_active
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
            </Paper>
          ))}
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {grouped.length} classe(s) — {data.length} affectation(s) au total
      </Typography>

      {/* Dialog Nouvelle Affectation */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvelle Affectation</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Classe" value={form.classe}
                onChange={e => setForm({ ...form, classe: e.target.value })}>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Matière" value={form.matiere}
                onChange={e => setForm({ ...form, matiere: e.target.value })}>
                {matieres.map(m => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Enseignant (optionnel)" value={form.enseignant}
                onChange={e => setForm({ ...form, enseignant: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.classe || !form.matiere}>
            Affecter
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Suspendre / Réactiver */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.is_active ? 'Suspendre la matière' : 'Réactiver la matière'}
        </DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>
                Suspendre <strong>{selected?.matiere_nom}</strong> en <strong>{selected?.classe_nom}</strong> ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                La matière ne sera plus active dans cette classe. Les notes existantes restent conservées.
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver <strong>{selected?.matiere_nom}</strong> en <strong>{selected?.classe_nom}</strong> ?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained"
            color={selected?.is_active ? 'warning' : 'success'}
            onClick={handleToggleSuspend}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Modifier */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          Modifier — {selected?.matiere_nom}
          <Typography variant="body2" color="text.secondary">{selected?.classe_nom}</Typography>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <TextField select fullWidth label="Enseignant" value={editForm.enseignant}
            onChange={e => setEditForm({ ...editForm, enseignant: e.target.value })} autoFocus sx={{ mt: 1 }}>
            <MenuItem value=""><em>Aucun</em></MenuItem>
            {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
