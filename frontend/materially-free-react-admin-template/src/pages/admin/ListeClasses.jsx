import { useEffect, useState } from 'react';
import { classeService, niveauService, enseignantService, inscriptionService } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Tooltip, CircularProgress, Chip,
  InputAdornment
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import useIsMobile from 'hooks/useIsMobile';

const initForm = { nom: '', niveau: '', professeur_principal: '' };

export default function ListeClasses() {
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [filterNiveau, setFilterNiveau] = useState('');
  const [filterActif, setFilterActif] = useState('all');
  const [search, setSearch] = useState('');
  const [eleves, setEleves] = useState([]);
  const [loadingEleves, setLoadingEleves] = useState(false);
  const isMobile = useIsMobile();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resC, resN, resE] = await Promise.all([
        classeService.getAll(),
        niveauService.getAll(),
        enseignantService.getAll(),
      ]);
      setClasses(resC.data);
      setNiveaux(resN.data);
      setEnseignants(resE.data);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = classes.filter(c => {
    const matchNiveau = !filterNiveau || String(c.niveau) === String(filterNiveau);
    const matchSearch = !search || c.nom_complet?.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && c.is_active)
      || (filterActif === 'suspended' && !c.is_active);
    return matchNiveau && matchSearch && matchActif;
  });

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, niveau: form.niveau };
      if (form.professeur_principal) payload.professeur_principal = form.professeur_principal;
      await classeService.create(payload);
      setSuccess('Classe créée !');
      setOpen(false); setForm(initForm); fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur — cette classe existe peut-être déjà dans ce niveau.');
    } finally { setSaving(false); }
  };

  const handleOpenEdit = (c) => {
    setSelected(c);
    setForm({ nom: c.nom, niveau: c.niveau, professeur_principal: c.professeur_principal || '' });
    setError(''); setEditOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, niveau: form.niveau };
      if (form.professeur_principal) payload.professeur_principal = form.professeur_principal;
      await classeService.update(selected.id, payload);
      setSuccess('Classe modifiée !');
      setEditOpen(false); fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
    } finally { setSaving(false); }
  };

  const handleToggleSuspend = async () => {
    try {
      await classeService.patch(selected.id, { is_active: !selected.is_active });
      const msg = selected.is_active ? 'Classe suspendue.' : 'Classe réactivée !';
      setSuccess(msg);
      setSuspendOpen(false); fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  const handleOpenDetail = async (c) => {
    setSelected(c); setDetailOpen(true); setLoadingEleves(true);
    try {
      const res = await inscriptionService.getAll();
      setEleves(res.data.filter(i => String(i.classe) === String(c.id)));
    } catch {
      setEleves([]);
    } finally { setLoadingEleves(false); }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Classes</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />}
          onClick={() => { setForm(initForm); setError(''); setOpen(true); }}>
          Nouvelle Classe
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Filtres */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 1 }} sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'center' }}>
              <FilterListIcon color="action" />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select fullWidth label="Niveau" size="small"
                value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)}>
                <MenuItem value="">Tous les niveaux</MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select fullWidth label="Statut" size="small"
                value={filterActif} onChange={e => setFilterActif(e.target.value)}>
                <MenuItem value="all">Toutes</MenuItem>
                <MenuItem value="active">Actives</MenuItem>
                <MenuItem value="suspended">Suspendues</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField fullWidth placeholder="Rechercher une classe..." size="small"
                value={search} onChange={e => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tableau */}
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} elevation={3}>
          <Table>
            <TableHead sx={{ bgcolor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white' }}><strong>Classe</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Niveau</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Prof. Principal</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Effectif</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">Aucune classe trouvée</TableCell>
                </TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id} hover
                  sx={{ opacity: c.is_active ? 1 : 0.6, bgcolor: c.is_active ? 'inherit' : '#fff8e1' }}>
                  <TableCell>
                    <Typography fontWeight="bold">{c.nom_complet}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={c.niveau_nom} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    {c.professeur_nom
                      ? <Chip label={c.professeur_nom} size="small" color="success" variant="outlined" />
                      : <em style={{ color: '#999' }}>Non assigné</em>}
                  </TableCell>
                  <TableCell>
                    <Chip label={`${c.nb_eleves} élève(s)`} size="small" />
                  </TableCell>
                  <TableCell>
                    {c.is_active
                      ? <Chip label="Active" color="success" size="small" />
                      : <Chip label="Suspendue" color="warning" size="small" />}
                  </TableCell>
                  <TableCell align="right">
                    <Box display="flex" gap={0.5} justifyContent="flex-end">
                      <Tooltip title="Voir les élèves">
                        <IconButton size="small" color="info" onClick={() => handleOpenDetail(c)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Modifier">
                        <IconButton size="small" color="primary" onClick={() => handleOpenEdit(c)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={c.is_active ? 'Suspendre la classe' : 'Réactiver la classe'}>
                        <IconButton size="small"
                          color={c.is_active ? 'warning' : 'success'}
                          onClick={() => { setSelected(c); setSuspendOpen(true); }}>
                          {c.is_active
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
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {filtered.length} classe(s)
      </Typography>

      {/* Dialog Création */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvelle Classe</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Niveau" value={form.niveau}
                onChange={e => setForm({ ...form, niveau: e.target.value })}>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Nom de la classe"
                value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })}
                placeholder="ex: A, B, C..." autoFocus />
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Professeur Principal (optionnel)"
                value={form.professeur_principal}
                onChange={e => setForm({ ...form, professeur_principal: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || !form.nom || !form.niveau}>
            {saving ? 'Création...' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Modification */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.nom_complet}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Niveau" value={form.niveau}
                onChange={e => setForm({ ...form, niveau: e.target.value })}>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Nom de la classe"
                value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} autoFocus />
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Professeur Principal (optionnel)"
                value={form.professeur_principal}
                onChange={e => setForm({ ...form, professeur_principal: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate}
            disabled={saving || !form.nom || !form.niveau}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Suspendre / Réactiver */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.is_active ? 'Suspendre la classe' : 'Réactiver la classe'}
        </DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>
                Suspendre <strong>{selected?.nom_complet}</strong> ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                Les élèves inscrits et les matières restent en place.
                La classe ne sera plus active tant qu'elle n'est pas réactivée.
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver la classe <strong>{selected?.nom_complet}</strong> ?
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

      {/* Dialog Détails élèves */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.nom_complet}
          {selected?.professeur_nom && (
            <Typography variant="body2" color="text.secondary">
              Prof. Principal : {selected.professeur_nom}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 300 }}>
          {loadingEleves ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : eleves.length === 0 ? (
            <Alert severity="info">Aucun élève inscrit dans cette classe.</Alert>
          ) : (
            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell><strong>Matricule</strong></TableCell>
                    <TableCell><strong>Nom</strong></TableCell>
                    <TableCell><strong>Prénom</strong></TableCell>
                    <TableCell><strong>Date Inscription</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eleves.map(i => (
                    <TableRow key={i.id} hover>
                      <TableCell>{i.eleve_matricule}</TableCell>
                      <TableCell><strong>{i.eleve_nom}</strong></TableCell>
                      <TableCell>{i.eleve_prenom}</TableCell>
                      <TableCell>{i.date_inscription}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)} color="inherit">Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
