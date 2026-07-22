import { useEffect, useState } from 'react';
import { classeMatiereService, matiereService, classeService, enseignantService } from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Chip, CircularProgress, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, MenuItem, Alert, IconButton, Tooltip,
  Select, InputLabel, FormControl, OutlinedInput, ListItemText, Checkbox
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import useIsMobile from 'hooks/useIsMobile';

const NEW_MATIERE = '__new__';
const initForm = { classes: [], matiere: '', enseignant: '', coef: 1.0 };
const initNew = { nom: '', type: 'SCIENTIFIQUE' };

const typeLabel = (type) => {
  if (type === 'SCIENTIFIQUE') return 'Scientifique';
  if (type === 'LITTERATURE') return 'Littérature';
  return 'Autres';
};
const typeColor = (type) => {
  if (type === 'SCIENTIFIQUE') return 'primary';
  if (type === 'LITTERATURE') return 'secondary';
  return 'default';
};

export default function ListeCours() {
  const [data, setData] = useState([]);
  const [matieres, setMatieres] = useState([]);
  const [classes, setClasses] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterNiveau, setFilterNiveau] = useState('');

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initForm);
  const [newMatiere, setNewMatiere] = useState(initNew);

  // Pour le formulaire d'édition (classe unique)
  const [editForm, setEditForm] = useState({ classe: '', matiere: '', enseignant: '' });

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const isMobile = useIsMobile();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resCM, resM, resC, resE] = await Promise.all([
        classeMatiereService.getAll(),
        matiereService.getAll(),
        classeService.getAll(),
        enseignantService.getAll(),
      ]);
      setData(resCM.data);
      setMatieres(resM.data);
      setClasses(resC.data);
      setEnseignants(resE.data);
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Niveaux déduits des classes (sans appel API supplémentaire)
  const niveaux = [...new Map(
    classes.map(c => [c.niveau, { id: c.niveau, nom: c.niveau_nom }])
  ).values()].sort((a, b) => a.nom.localeCompare(b.nom));

  const filtered = data.filter(d => {
    const classeObj = classes.find(c => String(c.id) === String(d.classe));
    const matchNiveau = !filterNiveau || String(classeObj?.niveau) === String(filterNiveau);
    const matchSearch = !search ||
      `${d.matiere_nom} ${d.classe_nom} ${d.enseignant_nom || ''}`.toLowerCase().includes(search.toLowerCase());
    return matchNiveau && matchSearch;
  });

  // Groupement par classe dans l'ordre du tableau classes
  const grouped = classes
    .filter(c => !filterNiveau || String(c.niveau) === String(filterNiveau))
    .map(c => ({
      classe: c,
      matieres: filtered.filter(d => String(d.classe) === String(c.id))
    }))
    .filter(g => g.matieres.length > 0);

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      let matiereId = form.matiere;

      if (form.matiere === NEW_MATIERE) {
        if (!newMatiere.nom.trim()) {
          setError('Saisissez le nom de la nouvelle matière.');
          setSaving(false);
          return;
        }
        const res = await matiereService.create({ nom: newMatiere.nom.trim(), type: newMatiere.type });
        matiereId = res.data.id;
      }

      if (!matiereId) {
        setError('Sélectionnez une matière.');
        setSaving(false);
        return;
      }

      if (form.classes.length === 0) {
        setError('Sélectionnez au moins une classe.');
        setSaving(false);
        return;
      }

      const results = await Promise.allSettled(
        form.classes.map(classeId => {
          const payload = { classe: classeId, matiere: matiereId, coef: parseFloat(form.coef) || 1.0 };
          if (form.enseignant) payload.enseignant = form.enseignant;
          return classeMatiereService.create(payload);
        })
      );

      const ok = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');

      if (ok > 0) {
        const msg = failed.length > 0
          ? `${ok} affectation(s) créée(s), ${failed.length} ignorée(s) (déjà existantes).`
          : `Matière ajoutée à ${ok} classe(s) !`;
        setSuccess(msg);
        setOpen(false);
        setForm(initForm);
        setNewMatiere(initNew);
        fetchData();
        setTimeout(() => setSuccess(''), 4000);
      } else {
        // Toutes ont échoué — montrer la vraie raison
        const reason = failed[0]?.reason?.response?.data;
        const msg = reason?.non_field_errors?.[0]
          || reason?.classe?.[0]
          || reason?.matiere?.[0]
          || (typeof reason === 'string' ? reason : null)
          || 'Cette matière est déjà affectée à toutes les classes sélectionnées.';
        setError(msg);
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Erreur inattendue.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (d) => {
    setSelected(d);
    setEditForm({ classe: d.classe, matiere: d.matiere, enseignant: d.enseignant || '' });
    setError('');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        classe: editForm.classe,
        matiere: editForm.matiere,
        coef: selected.coef,
      };
      if (editForm.enseignant) payload.enseignant = editForm.enseignant;
      await classeMatiereService.update(selected.id, payload);
      setSuccess('Matière modifiée !');
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

  const getClassName = (id) => classes.find(c => String(c.id) === String(id))?.nom || id;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Matières par Classe</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />}
          onClick={() => { setForm(initForm); setNewMatiere(initNew); setError(''); setOpen(true); }}>
          Ajouter une Matière
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

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
              <TextField fullWidth placeholder="Rechercher par matière, classe, enseignant..." size="small"
                value={search} onChange={e => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : grouped.length === 0 ? (
        <Alert severity="info">Aucune matière trouvée.</Alert>
      ) : (
        <Box display="flex" flexDirection="column" gap={3}>
          {grouped.map(({ classe, matieres: cms }) => (
            <Paper key={classe.id} elevation={3} sx={{ overflow: 'hidden' }}>
              {/* En-tête classe */}
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

              {/* Table des matières de cette classe */}
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
                            <Typography fontWeight="bold">{d.matiere_nom}</Typography>
                            {!d.is_active && <Chip label="Suspendue" color="warning" size="small" />}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip label={typeLabel(d.matiere_type)} color={typeColor(d.matiere_type)} size="small" />
                        </TableCell>
                        <TableCell>
                          <Chip label={`Coef ${d.coef}`} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          {d.enseignant_nom || <em style={{ color: '#bbb', fontSize: 13 }}>Non assigné</em>}
                        </TableCell>
                        <TableCell align="right">
                          <Box display="flex" gap={0.5} justifyContent="flex-end">
                            <Tooltip title="Modifier">
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
        {grouped.length} classe(s) — {filtered.length} matière(s)
      </Typography>

      {/* ── Dialog Ajout ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Ajouter une Matière à des Classes</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>

            {/* Multi-select classes */}
            <Grid size={12}>
              <FormControl fullWidth>
                <InputLabel>Classes *</InputLabel>
                <Select
                  multiple
                  value={form.classes}
                  onChange={e => setForm({ ...form, classes: e.target.value })}
                  input={<OutlinedInput label="Classes *" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map(id => (
                        <Chip key={id} label={getClassName(id)} size="small" color="primary" />
                      ))}
                    </Box>
                  )}
                >
                  {classes.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      <Checkbox checked={form.classes.includes(c.id)} />
                      <ListItemText primary={c.nom} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Matière — liste + option créer nouvelle */}
            <Grid size={12}>
              <TextField select fullWidth label="Matière *" value={form.matiere}
                onChange={e => setForm({ ...form, matiere: e.target.value })}>
                {matieres.map(m => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
                <MenuItem value={NEW_MATIERE} divider>
                  <em style={{ color: '#1976d2' }}>+ Créer une nouvelle matière</em>
                </MenuItem>
              </TextField>
            </Grid>

            {/* Champs nouvelle matière (si sélectionné) */}
            {form.matiere === NEW_MATIERE && (
              <>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField fullWidth label="Nom de la matière" value={newMatiere.nom}
                    onChange={e => setNewMatiere({ ...newMatiere, nom: e.target.value })}
                    placeholder="ex: Mathématiques" autoFocus />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth label="Type" value={newMatiere.type}
                    onChange={e => setNewMatiere({ ...newMatiere, type: e.target.value })}>
                    <MenuItem value="SCIENTIFIQUE">Scientifique</MenuItem>
                    <MenuItem value="LITTERATURE">Littérature</MenuItem>
                    <MenuItem value="AUTRES">Autres</MenuItem>
                  </TextField>
                </Grid>
              </>
            )}

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
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || form.classes.length === 0 || !form.matiere}>
            {saving ? 'Enregistrement...' : `Affecter à ${form.classes.length || '...'} classe(s)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Modifier ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.matiere_nom}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField select fullWidth label="Classe" value={editForm.classe}
                onChange={e => setEditForm({ ...editForm, classe: e.target.value })}>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Enseignant" value={editForm.enseignant}
                onChange={e => setEditForm({ ...editForm, enseignant: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Suspendre / Réactiver ── */}
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

    </Box>
  );
}
