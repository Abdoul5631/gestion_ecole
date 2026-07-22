import { useEffect, useState } from 'react';
import { inscriptionService, eleveService, classeService, niveauService, getResults } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Tooltip, CircularProgress, InputAdornment, Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import useIsMobile from 'hooks/useIsMobile';

export default function GestionInscriptions() {
  const [inscriptions, setInscriptions] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filterNiveau, setFilterNiveau] = useState('');

  const [form, setForm] = useState({ eleve: '', classe: '' });
  const isMobile = useIsMobile();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resI, resE, resC, resN] = await Promise.all([
        inscriptionService.getAll(),
        eleveService.getAll(),
        classeService.getAll(),
        niveauService.getAll(),
      ]);
      setInscriptions(resI.data);
      setEleves(getResults(resE).items);
      setClasses(resC.data);
      setNiveaux(resN.data);
    } catch {
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const classesFiltrees = filterNiveau
    ? classes.filter(c => String(c.niveau) === String(filterNiveau))
    : classes;

  const handleSave = async () => {
    try {
      await inscriptionService.create(form);
      setSuccess('Inscription réussie !');
      setOpen(false);
      setForm({ eleve: '', classe: '' });
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const msg = err.response?.data?.non_field_errors?.[0]
        || err.response?.data?.detail
        || "Erreur lors de l'inscription (l'élève est peut-être déjà inscrit dans cette classe)";
      setError(msg);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Supprimer cette inscription ?')) {
      try {
        await inscriptionService.delete(id);
        setInscriptions(prev => prev.filter(i => i.id !== id));
        setSuccess('Inscription supprimée');
        setTimeout(() => setSuccess(''), 3000);
      } catch {
        setError('Erreur lors de la suppression');
      }
    }
  };

  const filtered = inscriptions.filter(i => {
    const matchNiveau = !filterNiveau || (i.niveau_nom && classes.find(c => String(c.id) === String(i.classe) && String(c.niveau) === String(filterNiveau)));
    const matchSearch = !search ||
      `${i.eleve_nom} ${i.eleve_prenom} ${i.eleve_matricule}`.toLowerCase().includes(search.toLowerCase());
    return matchNiveau && matchSearch;
  });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Gestion des Inscriptions</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setError(''); setOpen(true); }}>
          Nouvelle Inscription
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 1 }} sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'center' }}>
              <FilterListIcon color="action" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Filtrer par niveau" size="small"
                value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)}>
                <MenuItem value="">Tous les niveaux</MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField fullWidth placeholder="Rechercher par nom ou matricule..." size="small"
                value={search} onChange={e => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} elevation={2}>
          <Table>
            <TableHead sx={{ bgcolor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white' }}><strong>Élève</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Classe</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Niveau</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Date</strong></TableCell>
                <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">Aucune inscription trouvée</TableCell>
                </TableRow>
              ) : filtered.map(i => (
                <TableRow key={i.id} hover>
                  <TableCell><strong>{i.eleve_nom} {i.eleve_prenom}</strong></TableCell>
                  <TableCell>{i.eleve_matricule}</TableCell>
                  <TableCell><Chip label={i.classe_nom || '—'} size="small" color="primary" /></TableCell>
                  <TableCell>{i.niveau_nom}</TableCell>
                  <TableCell>{i.date_inscription}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Supprimer">
                      <IconButton color="error" size="small" onClick={() => handleDelete(i.id)}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {filtered.length} inscription(s)
      </Typography>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Inscrire un Élève</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField select fullWidth label="Élève" value={form.eleve}
                onChange={e => setForm({ ...form, eleve: e.target.value })}>
                {eleves.map(e => (
                  <MenuItem key={e.id} value={e.id}>
                    {e.nom} {e.prenom} ({e.matricule})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Filtrer par niveau" value={filterNiveau}
                onChange={e => { setFilterNiveau(e.target.value); setForm({ ...form, classe: '' }); }}>
                <MenuItem value="">Tous</MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Classe" value={form.classe}
                onChange={e => setForm({ ...form, classe: e.target.value })}>
                {classesFiltrees.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={!form.eleve || !form.classe}>
            Inscrire
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
