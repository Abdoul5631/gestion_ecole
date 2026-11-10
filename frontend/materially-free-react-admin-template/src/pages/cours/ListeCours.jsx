import { useEffect, useState } from 'react';
import { classeMatiereService, matiereService, classeService, enseignantService } from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Chip, CircularProgress, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, MenuItem, Alert,
  Select, InputLabel, FormControl, OutlinedInput, ListItemText, Checkbox, Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import { alpha } from '@mui/material/styles';
import useIsMobile from 'hooks/useIsMobile';

const NEW_MATIERE = '__new__';
const PALETTE_NIVEAUX = ['#1a9aa5', '#e0731a', '#2f9e44', '#3b6fd4', '#c0392b', '#7b3fa0', '#6d4c41', '#0f766e'];
const initForm = { classes: [], matiere: '', enseignant: '', coef: 1.0, coefs: {} }; // coefs : un coefficient par classe
const initNew = { nom: '', type: 'SCIENTIFIQUE' };

const typeLabel = (type) => {
  if (type === 'SCIENTIFIQUE') return 'Scientifique';
  if (type === 'LITTERATURE') return 'Littérature';
  return 'Autres';
};
// Pastille douce (fond léger + texte de la couleur) plutôt qu'un aplat saturé
const typeChipSx = (type) => {
  const palette = type === 'SCIENTIFIQUE' ? 'primary' : type === 'LITTERATURE' ? 'secondary' : null;
  if (!palette) return { fontWeight: 600, color: 'text.secondary', bgcolor: 'action.hover' };
  return { fontWeight: 600, color: `${palette}.main`, bgcolor: (t) => alpha(t.palette[palette].main, 0.1) };
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
  const [editForm, setEditForm] = useState({ classe: '', matiere: '', enseignant: '', coef: 1 });

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

  // Niveaux déduits des classes, dans l'ordre où l'école les a définis
  const niveaux = [...new Map(
    classes.map(c => [c.niveau, { id: c.niveau, nom: c.niveau_nom }])
  ).values()];

  const filtered = data.filter(d => {
    const classeObj = classes.find(c => String(c.id) === String(d.classe));
    const matchNiveau = !filterNiveau || String(classeObj?.niveau) === String(filterNiveau);
    const matchSearch = !search ||
      `${d.matiere_nom} ${d.classe_nom} ${d.enseignant_nom || ''}`.toLowerCase().includes(search.toLowerCase());
    return matchNiveau && matchSearch;
  });

  // Une section par niveau : les matières en lignes, les classes du niveau en colonnes
  const ORDRE_TYPE = { SCIENTIFIQUE: 0, LITTERATURE: 1, AUTRES: 2 };
  const parNiveau = niveaux
    .filter(n => !filterNiveau || String(n.id) === String(filterNiveau))
    .map((n, i) => {
      const cl = classes
        .filter(c => String(c.niveau) === String(n.id))
        .sort((a, b) => String(a.nom_complet).localeCompare(String(b.nom_complet), 'fr', { numeric: true }));
      const lignes = new Map();
      filtered.filter(d => cl.some(c => String(c.id) === String(d.classe))).forEach(d => {
        if (!lignes.has(d.matiere)) lignes.set(d.matiere, { matiere: d.matiere, nom: d.matiere_nom, type: d.matiere_type, cellules: {} });
        lignes.get(d.matiere).cellules[d.classe] = d;
      });
      const rows = [...lignes.values()].sort((a, b) =>
        ((ORDRE_TYPE[a.type] ?? 3) - (ORDRE_TYPE[b.type] ?? 3)) || a.nom.localeCompare(b.nom, 'fr'));
      return { niveau: n, couleur: PALETTE_NIVEAUX[i % PALETTE_NIVEAUX.length], classes: cl, lignes: rows };
    })
    .filter(g => g.lignes.length > 0);

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
          const payload = { classe: classeId, matiere: matiereId, coef: parseFloat(form.coefs[classeId] ?? form.coef) || 1.0 };
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
    setEditForm({ classe: d.classe, matiere: d.matiere, enseignant: d.enseignant || '', coef: d.coef ?? 1 });
    setError('');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    const coef = parseFloat(editForm.coef);
    if (!(coef > 0 && coef <= 20)) { setError('Le coefficient doit être un nombre entre 0,5 et 20.'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        classe: editForm.classe,
        matiere: editForm.matiere,
        coef: parseFloat(editForm.coef),
        enseignant: editForm.enseignant || null, // « Aucun » retire bien l'enseignant
      };
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
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Matières par niveau</Typography>
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
      ) : parNiveau.length === 0 ? (
        <Alert severity="info">Aucune matière trouvée.</Alert>
      ) : (
        <Box display="flex" flexDirection="column" gap={3}>
          {parNiveau.map(({ niveau, couleur, classes: cl, lignes }) => (
            <Paper key={niveau.id} variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
              <Box sx={{
                px: 2.5, py: 1.5, borderLeft: '5px solid', borderColor: couleur,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap',
              }}>
                <Typography variant="h5" fontWeight={800}>{niveau.nom}</Typography>
                <Box display="flex" gap={1}>
                  <Chip size="small" label={`${cl.length} classe${cl.length > 1 ? 's' : ''}`} />
                  <Chip size="small" variant="outlined" label={`${lignes.length} matière${lignes.length > 1 ? 's' : ''}`} />
                </Box>
              </Box>

              <TableContainer>
                <Table size="small" data-no-stack sx={{ minWidth: 360 }}>
                  <TableHead sx={{ '& th': { color: 'text.secondary', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, bgcolor: 'action.hover' } }}>
                    <TableRow>
                      <TableCell sx={{ minWidth: 170, position: 'sticky', left: 0, zIndex: 2, bgcolor: 'grey.100 !important', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.15)' }}>Matière</TableCell>
                      {cl.map(c => (
                        <TableCell key={c.id} sx={{ minWidth: 118, color: `${couleur} !important`, whiteSpace: 'nowrap' }}>{c.nom_complet}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lignes.map(l => (
                      <TableRow key={l.matiere} hover>
                        <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', boxShadow: '2px 0 4px -2px rgba(0,0,0,0.12)' }}>
                          <Typography fontWeight={700}>{l.nom}</Typography>
                          <Chip label={typeLabel(l.type)} size="small" sx={{ ...typeChipSx(l.type), height: 20, fontSize: 11, mt: 0.5 }} />
                        </TableCell>
                        {cl.map(c => {
                          const d = l.cellules[c.id];
                          if (!d) return <TableCell key={c.id} sx={{ color: 'text.disabled' }}>—</TableCell>;
                          return (
                            <TableCell key={c.id}
                              onClick={() => handleOpenEdit(d)}
                              sx={{ cursor: 'pointer', opacity: d.is_active ? 1 : 0.5, bgcolor: d.is_active ? 'inherit' : '#fff8e1', '&:hover': { bgcolor: 'action.hover' } }}>
                              <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={0.5}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight={600} sx={{ color: d.enseignant_nom ? 'text.primary' : 'text.disabled', fontStyle: d.enseignant_nom ? 'normal' : 'italic' }}>
                                    {d.enseignant_nom || 'Non assigné'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    coef {d.coef}{!d.is_active ? ' · suspendue' : ''}
                                  </Typography>
                                </Box>
                                <Tooltip title="Modifier (coefficient, enseignant, suspendre)">
                                  <EditIcon sx={{ fontSize: 17, color: 'primary.main', mt: 0.25, flexShrink: 0 }} />
                                </Tooltip>
                              </Box>
                            </TableCell>
                          );
                        })}
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
        {parNiveau.length} niveau{parNiveau.length > 1 ? 'x' : ''} — {filtered.length} affectation{filtered.length > 1 ? 's' : ''}. Cliquez sur une case (crayon) pour modifier le coefficient, l’enseignant ou suspendre la matière.
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

            {form.classes.length > 0 && (
              <Grid size={12}>
                <Typography variant="body2" fontWeight={700} mb={0.5}>Coefficient dans chaque classe *</Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                  Il dépend de la classe : par exemple Maths 3 en Tle A et 5 en Tle D.
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' } }}>
                  {form.classes.map(id => (
                    <TextField key={id} size="small" type="number" label={getClassName(id)}
                      value={form.coefs[id] ?? form.coef}
                      onChange={e => setForm({ ...form, coefs: { ...form.coefs, [id]: e.target.value } })}
                      inputProps={{ min: 0.5, max: 20, step: 0.5 }} />
                  ))}
                </Box>
              </Grid>
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
            disabled={saving || form.classes.length === 0 || !form.matiere || form.classes.some(id => !(parseFloat(form.coefs[id] ?? form.coef) > 0))}>
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
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Classe" value={editForm.classe}
                onChange={e => setEditForm({ ...editForm, classe: e.target.value })}>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Matière" value={editForm.matiere}
                onChange={e => setEditForm({ ...editForm, matiere: e.target.value })}>
                {matieres.map(m => <MenuItem key={m.id} value={m.id}>{m.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth type="number" label="Coefficient" value={editForm.coef}
                onChange={e => setEditForm({ ...editForm, coef: e.target.value })}
                inputProps={{ min: 0.5, max: 20, step: 0.5 }} />
            </Grid>
            {parseFloat(editForm.coef) !== parseFloat(selected?.coef) && (
              <Grid size={12}>
                <Alert severity="warning">
                  Changer le coefficient modifie les moyennes et les bulletins de cette classe, y compris pour les notes déjà saisies.
                </Alert>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField select fullWidth label="Enseignant" value={editForm.enseignant}
                onChange={e => setEditForm({ ...editForm, enseignant: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button color={selected?.is_active ? 'warning' : 'success'}
            onClick={() => { setEditOpen(false); setSuspendOpen(true); }}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
          <Box flex={1} />
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
