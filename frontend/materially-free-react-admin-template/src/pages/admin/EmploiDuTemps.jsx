import { useEffect, useState } from 'react';
import { emploiService, classeService, classeMatiereService } from 'services/api';
import {
  Box, Card, CardContent, Typography, MenuItem, TextField, Button,
  Grid, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, Chip
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import useIsMobile from 'hooks/useIsMobile';

const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const JOURS_LABELS = { LUNDI: 'Lundi', MARDI: 'Mardi', MERCREDI: 'Mercredi', JEUDI: 'Jeudi', VENDREDI: 'Vendredi', SAMEDI: 'Samedi' };

// Créneaux horaires de 07h00 à 18h00
const CRENEAUX = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const COLORS = [
  '#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828',
  '#00838f', '#5d4037', '#e91e63', '#0288d1', '#558b2f',
];

function getColor(classeMatiereId, colorMap) {
  if (!colorMap[classeMatiereId]) {
    const idx = Object.keys(colorMap).length % COLORS.length;
    colorMap[classeMatiereId] = COLORS[idx];
  }
  return colorMap[classeMatiereId];
}

function formatH(t) {
  return t ? t.slice(0, 5) : '';
}

const EMPTY_FORM = { classe_matiere: '', jour: 'LUNDI', heure_debut: '08:00', heure_fin: '09:00', salle: '' };

export default function EmploiDuTempsAdmin() {
  const isMobile = useIsMobile();
  const [classes, setClasses] = useState([]);
  const [classeId, setClasseId] = useState('');
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [emplois, setEmplois] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [colorMap] = useState({});

  // Dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classeService.getAll().then(res => {
      const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];
      setClasses(data);
    });
  }, []);

  useEffect(() => {
    if (!classeId) { setEmplois([]); setClasseMatieres([]); return; }
    setLoading(true);
    Promise.all([
      emploiService.getAll(`?classe_id=${classeId}`),
      classeMatiereService.getAll(`?classe_id=${classeId}`)
    ]).then(([re, rcm]) => {
      setEmplois(Array.isArray(re.data) ? re.data : re.data.results ?? []);
      const cms = Array.isArray(rcm.data) ? rcm.data : rcm.data.results ?? [];
      setClasseMatieres(cms.filter(cm => cm.is_active !== false));
    }).finally(() => setLoading(false));
  }, [classeId]);

  // classeMatiereService.getAll doesn't accept params — use query string directly
  // We patch this by using api directly
  const fetchClasseMatieres = (cid) => {
    import('services/api').then(m => {
      m.default.get(`/classe-matieres/?classe_id=${cid}`).then(res => {
        const cms = Array.isArray(res.data) ? res.data : res.data.results ?? [];
        setClasseMatieres(cms.filter(cm => cm.is_active !== false));
      });
    });
  };

  useEffect(() => {
    if (classeId) fetchClasseMatieres(classeId);
  }, [classeId]);

  const openAdd = (jour = 'LUNDI', heure_debut = '08:00') => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, jour, heure_debut, heure_fin: addHour(heure_debut) });
    setOpen(true);
  };

  const openEdit = (emp) => {
    setEditId(emp.id);
    setForm({
      classe_matiere: emp.classe_matiere,
      jour: emp.jour,
      heure_debut: emp.heure_debut.slice(0, 5),
      heure_fin: emp.heure_fin.slice(0, 5),
      salle: emp.salle || '',
    });
    setOpen(true);
  };

  const addHour = (h) => {
    const [hh, mm] = h.split(':').map(Number);
    return `${String(hh + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!form.classe_matiere || !form.jour || !form.heure_debut || !form.heure_fin) return;
    setSaving(true);
    try {
      if (editId) {
        await emploiService.update(editId, form);
      } else {
        await emploiService.create(form);
      }
      setSuccess(editId ? 'Modifié avec succès' : 'Ajouté avec succès');
      setOpen(false);
      // Refresh
      const re = await emploiService.getAll(`?classe_id=${classeId}`);
      setEmplois(Array.isArray(re.data) ? re.data : re.data.results ?? []);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err?.response?.data ? JSON.stringify(err.response.data) : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce créneau ?')) return;
    await emploiService.delete(id);
    setEmplois(prev => prev.filter(e => e.id !== id));
  };

  // Construire grille : { LUNDI: { '08:00': [emploi,...] }, ... }
  const grille = {};
  JOURS.forEach(j => { grille[j] = {}; });
  emplois.forEach(e => {
    const h = e.heure_debut.slice(0, 5);
    if (!grille[e.jour]) grille[e.jour] = {};
    if (!grille[e.jour][h]) grille[e.jour][h] = [];
    grille[e.jour][h].push(e);
  });

  const cellStyle = {
    border: '1px solid',
    borderColor: 'divider',
    minHeight: 64,
    p: 0.5,
    position: 'relative',
    verticalAlign: 'top',
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3} flexWrap="wrap">
        <CalendarMonthIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Emploi du Temps
        </Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField select fullWidth size="small" label="Choisir une classe"
                value={classeId} onChange={e => setClasseId(e.target.value)}>
                <MenuItem value=""><em>— Sélectionner —</em></MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            {classeId && (
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => openAdd()}>
                  Ajouter un créneau
                </Button>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {!classeId && (
        <Box textAlign="center" py={8} color="text.secondary">
          <CalendarMonthIcon sx={{ fontSize: 64, opacity: 0.2, mb: 2 }} />
          <Typography>Sélectionnez une classe pour voir son emploi du temps</Typography>
        </Box>
      )}

      {classeId && loading && <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>}

      {classeId && !loading && (
        <Card sx={{ borderRadius: 3, overflow: 'auto' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 700 }}>
                <thead>
                  <tr>
                    <th style={{ width: 70, border: '1px solid #e0e0e0', padding: '8px', background: '#f5f5f5', fontSize: 12 }}>
                      Heure
                    </th>
                    {JOURS.map(j => (
                      <th key={j} style={{ border: '1px solid #e0e0e0', padding: '8px', background: '#f5f5f5', fontSize: 13, fontWeight: 'bold' }}>
                        {JOURS_LABELS[j]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CRENEAUX.map(heure => (
                    <tr key={heure}>
                      <td style={{ border: '1px solid #e0e0e0', padding: '4px 8px', fontSize: 11, color: '#666', textAlign: 'center', background: '#fafafa' }}>
                        {heure}
                      </td>
                      {JOURS.map(jour => {
                        const slots = grille[jour][heure] || [];
                        return (
                          <td key={jour} style={{ border: '1px solid #e0e0e0', padding: 4, verticalAlign: 'top', minWidth: 110 }}
                            onDoubleClick={() => openAdd(jour, heure)}>
                            {slots.map(emp => {
                              const color = getColor(emp.classe_matiere, colorMap);
                              return (
                                <Box key={emp.id} sx={{
                                  bgcolor: color, color: 'white', borderRadius: 1,
                                  p: '4px 6px', mb: 0.5, fontSize: 11,
                                }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 0.5 }}>
                                    <Typography fontSize={11} fontWeight="bold" lineHeight={1.3} sx={{ wordBreak: 'break-word' }}>
                                      {emp.matiere_nom}
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexShrink: 0 }}>
                                      <Tooltip title="Modifier">
                                        <IconButton size="small" sx={{ color: 'white', p: 0.3 }} onClick={() => openEdit(emp)}>
                                          <EditIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Supprimer">
                                        <IconButton size="small" sx={{ color: 'white', p: 0.3 }} onClick={() => handleDelete(emp.id)}>
                                          <DeleteIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                      </Tooltip>
                                    </Box>
                                  </Box>
                                  {emp.enseignant_nom && <Typography fontSize={10} sx={{ opacity: 0.9 }}>{emp.enseignant_nom}</Typography>}
                                  <Typography fontSize={10} sx={{ opacity: 0.85 }}>
                                    {formatH(emp.heure_debut)} – {formatH(emp.heure_fin)}
                                    {emp.salle ? ` · ${emp.salle}` : ''}
                                  </Typography>
                                </Box>
                              );
                            })}
                            {slots.length === 0 && (
                              <Box sx={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, '&:hover': { opacity: 1 } }}>
                                <Tooltip title="Double-clic pour ajouter">
                                  <AddIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                                </Tooltip>
                              </Box>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Box p={2} display="flex" flexWrap="wrap" gap={1}>
              {classeMatieres.map(cm => (
                <Chip key={cm.id} size="small" label={`${cm.matiere_nom} — ${cm.enseignant_nom || 'N/A'}`}
                  sx={{ bgcolor: getColor(cm.id, colorMap), color: 'white', fontSize: 11 }} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Dialog ajout/modif */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editId ? 'Modifier le créneau' : 'Ajouter un créneau'}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 1 }}>
            Ce créneau se répète automatiquement chaque semaine pendant toute l'année scolaire — inutile de le recréer semaine après semaine.
          </Alert>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField select fullWidth label="Matière / Cours" size="small"
                value={form.classe_matiere} onChange={e => setForm({ ...form, classe_matiere: e.target.value })}>
                <MenuItem value=""><em>Choisir</em></MenuItem>
                {classeMatieres.map(cm => (
                  <MenuItem key={cm.id} value={cm.id}>
                    {cm.matiere_nom} {cm.enseignant_nom ? `(${cm.enseignant_nom})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Jour" size="small"
                value={form.jour} onChange={e => setForm({ ...form, jour: e.target.value })}>
                {JOURS.map(j => <MenuItem key={j} value={j}>{JOURS_LABELS[j]}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth label="Heure début" type="time" size="small"
                value={form.heure_debut} onChange={e => setForm({ ...form, heure_debut: e.target.value })}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField fullWidth label="Heure fin" type="time" size="small"
                value={form.heure_fin} onChange={e => setForm({ ...form, heure_fin: e.target.value })}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth label="Salle (optionnel)" size="small"
                value={form.salle} onChange={e => setForm({ ...form, salle: e.target.value })}
                placeholder="Ex: Salle A, Labo, Amphi..." />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.classe_matiere}>
            {saving ? <CircularProgress size={18} /> : (editId ? 'Modifier' : 'Ajouter')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
