import { useEffect, useState } from 'react';
import { niveauService } from 'services/api';
import {
  Box, Typography, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, CircularProgress, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, Alert, IconButton, Tooltip,
  InputAdornment, Chip, FormControlLabel, Checkbox, MenuItem
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import LayersIcon from '@mui/icons-material/Layers';
import SearchIcon from '@mui/icons-material/Search';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import useIsMobile from 'hooks/useIsMobile';

export default function GestionNiveaux() {
  const [niveaux, setNiveaux] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filterActif, setFilterActif] = useState('all');
  const [nom, setNom] = useState('');
  const [isClasseExamen, setIsClasseExamen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const isMobile = useIsMobile();

  const fetchData = () => {
    setLoading(true);
    niveauService.getAll('?inclure_suspendus=1')
      .then(res => setNiveaux(Array.isArray(res.data) ? res.data : res.data.results ?? []))
      .catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = niveaux.filter(n => {
    const matchSearch = n.nom.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && n.is_active)
      || (filterActif === 'suspended' && !n.is_active);
    return matchSearch && matchActif;
  });

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      await niveauService.create({ nom, is_classe_examen: isClasseExamen });
      setSuccess('Niveau ajouté !');
      setOpen(false);
      setNom('');
      setIsClasseExamen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.nom) setError(`Nom : ${data.nom[0]}`);
      else setError('Erreur (nom peut-être déjà existant).');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (n) => {
    setSelected(n);
    setNom(n.nom);
    setIsClasseExamen(n.is_classe_examen);
    setError('');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true);
    setError('');
    try {
      await niveauService.update(selected.id, { nom, is_active: selected.is_active, is_classe_examen: isClasseExamen });
      setSuccess('Niveau modifié !');
      setEditOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async () => {
    try {
      if (selected.is_active) {
        const nb = selected.nb_eleves || 0;
        if (nb > 0 && !window.confirm('Ces élèves restent inscrits cette année. Suspendre quand même ?')) return;
        await niveauService.delete(selected.id);
        setSuccess('Niveau suspendu.');
      } else {
        await niveauService.reactiver(selected.id);
        setSuccess('Niveau réactivé !');
      }
      setSuspendOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.5}>
          <LayersIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Gestion des Niveaux</Typography>
        </Box>
        <Button size="small" variant="contained" startIcon={<AddIcon />}
          onClick={() => { setNom(''); setError(''); setOpen(true); }}>
          Nouveau Niveau
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2, bgcolor: 'warning.light' }}>
        <CardContent sx={{ py: 1.5 }}>
          <Typography variant="body2" color="warning.dark">
            <strong>Important :</strong> Les niveaux sont la base de la structure scolaire.
            Créez vos niveaux (6ème, 5ème, 4ème, 3ème...) avant d'affecter des cours ou d'inscrire des élèves.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box display="flex" gap={2} mb={3} flexWrap="wrap">
            <TextField fullWidth placeholder="Rechercher un niveau..."
              value={search} onChange={e => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <TextField select size="small" label="Afficher" value={filterActif}
              onChange={e => setFilterActif(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="all">Tous</MenuItem>
              <MenuItem value="active">Actifs</MenuItem>
              <MenuItem value="suspended">Suspendus</MenuItem>
            </TextField>
          </Box>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : filtered.length === 0 ? (
            <Alert severity="info">Aucun niveau trouvé. Commencez par créer votre premier niveau.</Alert>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead sx={{ bgcolor: 'primary.main' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'white' }}><strong>Nom du Niveau</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(n => (
                    <TableRow key={n.id} hover
                      sx={{ opacity: n.is_active ? 1 : 0.6, bgcolor: n.is_active ? 'inherit' : '#fff8e1' }}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography fontWeight="bold" variant="subtitle1">{n.nom}</Typography>
                          {n.is_classe_examen && <Chip label="Classe d'examen" color="info" size="small" />}
                          {!n.is_active && <Chip label="Suspendu" color="warning" size="small" />}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={n.is_active ? 'Actif' : 'Suspendu'}
                          color={n.is_active ? 'success' : 'default'}
                          size="small"
                          variant={n.is_active ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" gap={0.5} justifyContent="flex-end">
                          <Tooltip title="Modifier">
                            <IconButton size="small" color="primary" onClick={() => handleEdit(n)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={n.is_active ? 'Suspendre' : 'Réactiver'}>
                            <IconButton size="small"
                              color={n.is_active ? 'warning' : 'success'}
                              onClick={() => { setSelected(n); setSuspendOpen(true); }}>
                              {n.is_active
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
            {filtered.length} niveau(x)
          </Typography>
        </CardContent>
      </Card>

      {/* Dialog Création */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouveau Niveau</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Nom du niveau" value={nom}
            onChange={e => setNom(e.target.value)} autoFocus required
            placeholder="ex: 6ème, 5ème, Terminale A..." />
          <FormControlLabel sx={{ mt: 1 }}
            control={<Checkbox checked={isClasseExamen} onChange={e => setIsClasseExamen(e.target.checked)} />}
            label="Classe d'examen (BEPC, Bac...) — autorise l'Examen Blanc" />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setOpen(false); setError(''); }} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !nom}>
            {saving ? 'Création...' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Modification */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.nom}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField fullWidth label="Nom du niveau" value={nom}
            onChange={e => setNom(e.target.value)} autoFocus required />
          <FormControlLabel sx={{ mt: 1 }}
            control={<Checkbox checked={isClasseExamen} onChange={e => setIsClasseExamen(e.target.checked)} />}
            label="Classe d'examen (BEPC, Bac...) — autorise l'Examen Blanc" />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setEditOpen(false); setError(''); }} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={saving || !nom}>
            {saving ? 'Modification...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Suspendre / Réactiver */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.is_active ? 'Suspendre le niveau' : 'Réactiver le niveau'}
        </DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>
                Suspendre le niveau <strong>{selected?.nom}</strong> ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                {(selected?.nb_eleves || 0) > 0
                  ? `${selected.nb_eleves} élève(s) restent inscrits cette année. Notes et historique conservés.`
                  : 'Les classes et inscriptions existantes restent conservées.'}
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver le niveau <strong>{selected?.nom}</strong> ?
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

    </Box>
  );
}
