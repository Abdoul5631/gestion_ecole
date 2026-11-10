import { useEffect, useMemo, useState } from 'react';
import { emploiService, classeService, classeMatiereService } from 'services/api';
import {
  Box, Card, CardContent, Typography, MenuItem, TextField, Button,
  Grid, CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, Chip, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import useIsMobile from 'hooks/useIsMobile';
import authService from 'services/auth';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';

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

function versMinutes(h) {
  const [hh, mm] = h.split(':').map(Number);
  return hh * 60 + mm;
}

function depuisMinutes(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function formatH(t) {
  return t ? t.slice(0, 5) : '';
}

const EMPTY_FORM = { classe_matiere: '', jour: 'LUNDI', heure_debut: '08:00', heure_fin: '09:00', salle: '' };

export default function EmploiDuTempsAdmin() {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState('classe'); // 'classe' (planification) ou 'professeur' (consultation)
  const peutVoirProfesseurs = authService.getRole() !== 'ENSEIGNANT'; // un enseignant ne consulte pas ses collègues
  const parProf = mode === 'professeur';
  const lecture = authService.getRole() !== 'ADMIN' || parProf; // le directeur planifie par classe ; le reste se consulte
  const [classes, setClasses] = useState([]);
  const [profs, setProfs] = useState([]); // professeurs, d'après leur affectation aux cours
  const [profId, setProfId] = useState('');
  const [emploisProf, setEmploisProf] = useState([]);
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
    readThrough(CacheKeys.classes(), async () => {
      const res = await classeService.getAll();
      return Array.isArray(res.data) ? res.data : res.data.results ?? [];
    }).then((r) => {
      if (r.neverCached) setError(NEVER_CACHED_MSG);
      else setClasses(r.data || []);
    });
  }, []);

  // Professeurs ayant au moins un cours affecté : liste tirée des affectations (classe-matières) de la base
  useEffect(() => {
    if (!peutVoirProfesseurs) return;
    readThrough(CacheKeys.emploi('profs'), async () => {
      const res = await classeMatiereService.getAll('');
      const cms = (Array.isArray(res.data) ? res.data : res.data.results ?? []).filter(cm => cm.is_active !== false && cm.enseignant);
      const parProfesseur = new Map();
      cms.forEach((cm) => {
        const p = parProfesseur.get(cm.enseignant) || { id: cm.enseignant, nom: cm.enseignant_nom || `Enseignant ${cm.enseignant}`, cours: 0, affectations: [] };
        p.cours += 1;
        p.affectations.push({ id: cm.id, libelle: `${cm.matiere_nom} (${cm.classe_nom})` });
        parProfesseur.set(cm.enseignant, p);
      });
      return [...parProfesseur.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    }).then((r) => { if (!r.neverCached) setProfs(r.data || []); });
  }, [peutVoirProfesseurs]);

  useEffect(() => {
    if (!parProf || !profId) { setEmploisProf([]); return; }
    setLoading(true);
    setError('');
    readThrough(CacheKeys.emploi(`prof:${profId}`), async () => {
      const re = await emploiService.getAll(`?enseignant_id=${profId}`);
      return Array.isArray(re.data) ? re.data : re.data.results ?? [];
    }).then((r) => {
      if (r.neverCached) { setError(NEVER_CACHED_MSG); setEmploisProf([]); } else setEmploisProf(r.data || []);
    }).finally(() => setLoading(false));
  }, [parProf, profId]);

  useEffect(() => {
    if (!classeId) { setEmplois([]); setClasseMatieres([]); return; }
    setLoading(true);
    setError('');
    readThrough(CacheKeys.emploi(`classe:${classeId}`), async () => {
      const [re, rcm] = await Promise.all([
        emploiService.getAll(`?classe_id=${classeId}`),
        classeMatiereService.getAll(`?classe_id=${classeId}`),
      ]);
      const cms = Array.isArray(rcm.data) ? rcm.data : rcm.data.results ?? [];
      return {
        emplois: Array.isArray(re.data) ? re.data : re.data.results ?? [],
        classeMatieres: cms.filter(cm => cm.is_active !== false),
      };
    }).then((r) => {
      if (r.neverCached) {
        setError(NEVER_CACHED_MSG);
        setEmplois([]);
        setClasseMatieres([]);
      } else {
        setEmplois(r.data?.emplois || []);
        setClasseMatieres(r.data?.classeMatieres || []);
      }
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

  const messageErreur = (err) => {
    const data = err?.response?.data;
    let msg = 'Erreur lors de l’enregistrement.';
    if (typeof data === 'string') msg = data;
    else if (data?.detail) msg = Array.isArray(data.detail) ? data.detail.join(' ') : String(data.detail);
    else if (data?.non_field_errors) {
      msg = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(' ') : String(data.non_field_errors);
    } else if (data && typeof data === 'object') {
      const parts = Object.entries(data).map(([k, v]) =>
        `${k}: ${Array.isArray(v) ? v.join(', ') : v}`
      );
      if (parts.length) msg = parts.join(' | ');
    }
    return msg;
  };

  const enregistrer = async (data, id) => {
    const result = await sendOrQueue({
      kind: 'http',
      label: id ? 'Modifier créneau EDT' : 'Ajouter créneau EDT',
      payload: id
        ? { method: 'PUT', url: `/emploi-du-temps/${id}/`, data }
        : { method: 'POST', url: '/emploi-du-temps/', data },
    });
    setSuccess(result.queued ? QUEUED_MSG : (id ? 'Modifié avec succès' : 'Ajouté avec succès'));
    if (!result.queued) {
      const re = await emploiService.getAll(`?classe_id=${classeId}`);
      setEmplois(Array.isArray(re.data) ? re.data : re.data.results ?? []);
    }
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSave = async () => {
    if (!form.classe_matiere || !form.jour || !form.heure_debut || !form.heure_fin) return;
    setSaving(true);
    try {
      await enregistrer(form, editId);
      setOpen(false);
    } catch (err) {
      setError(messageErreur(err));
    } finally {
      setSaving(false);
    }
  };

  // ── Glisser-déposer (ordinateur) ────────────────────────────────────────────────────────────
  // Une matière de la liste déposée dans une case crée le créneau ; un créneau déposé ailleurs est déplacé.
  const [survol, setSurvol] = useState('');
  const [copie, setCopie] = useState(null); // cours en cours de duplication (clic sur une case pour le placer)

  // Déplace (ou duplique) un cours vers une case, en gardant sa durée et sa salle.
  const placerCreneau = async (emp, jour, heure, dupliquer) => {
    const debut = emp.heure_debut.slice(0, 5);
    const duree = Math.max(30, versMinutes(emp.heure_fin.slice(0, 5)) - versMinutes(debut));
    await enregistrer({
      classe_matiere: emp.classe_matiere, jour, heure_debut: heure,
      heure_fin: depuisMinutes(Math.min(versMinutes(heure) + duree, 23 * 60 + 59)), salle: emp.salle || '',
    }, dupliquer ? null : emp.id);
  };

  const cliquerCase = async (jour, heure) => {
    if (!copie) return;
    setError('');
    try {
      await placerCreneau(copie, jour, heure, true);
    } catch (err) {
      setError(messageErreur(err));
    }
  };

  const deposer = async (e, jour, heure) => {
    e.preventDefault();
    setSurvol('');
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    setError('');
    try {
      if (payload.kind === 'matiere') {
        await enregistrer({ classe_matiere: payload.id, jour, heure_debut: heure, heure_fin: addHour(heure), salle: '' }, null);
      } else if (payload.kind === 'creneau') {
        const emp = emplois.find((x) => x.id === payload.id);
        if (!emp) return;
        const dupliquer = e.ctrlKey || e.altKey;
        if (!dupliquer && emp.jour === jour && emp.heure_debut.slice(0, 2) === heure.slice(0, 2)) return;
        await placerCreneau(emp, jour, heure, dupliquer);
      }
    } catch (err) {
      setError(messageErreur(err));
    }
  };

  const glisser = (e, payload) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Retirer ce créneau de l’emploi du temps ?')) return;
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: 'Supprimer créneau EDT',
        payload: { method: 'DELETE', url: `/emploi-du-temps/${id}/`, data: {} },
      });
      if (result.queued) setSuccess(QUEUED_MSG);
      setEmplois(prev => prev.filter(e => e.id !== id));
    } catch {
      setError('Impossible de supprimer le créneau.');
    }
  };

  // Construire grille : { LUNDI: { '08:00': [emploi,...] }, ... }
  const grille = {};
  JOURS.forEach(j => { grille[j] = {}; });
  const affiches = parProf ? emploisProf : emplois;
  affiches.forEach(e => {
    const h = `${e.heure_debut.slice(0, 2)}:00`;
    if (!grille[e.jour]) grille[e.jour] = {};
    if (!grille[e.jour][h]) grille[e.jour][h] = [];
    grille[e.jour][h].push(e);
  });

  // Un cours de 10h à 12h occupe deux lignes : la case de départ s'étend (rowSpan), les suivantes sont masquées
  const spans = {};
  const couvert = new Set();
  JOURS.forEach((jour) => {
    CRENEAUX.forEach((heure, i) => {
      if (couvert.has(`${jour}|${heure}`)) return;
      const slots = grille[jour][heure] || [];
      if (slots.length !== 1) return;
      const fin = versMinutes(slots[0].heure_fin.slice(0, 5));
      let n = Math.min(Math.max(1, Math.ceil((fin - versMinutes(heure)) / 60)), CRENEAUX.length - i);
      for (let k = 1; k < n; k++) {
        if ((grille[jour][CRENEAUX[i + k]] || []).length) { n = k; break; }
      }
      spans[`${jour}|${heure}`] = n;
      for (let k = 1; k < n; k++) couvert.add(`${jour}|${CRENEAUX[i + k]}`);
    });
  });

  // Cours affectés au professeur mais pas encore placés dans un emploi du temps
  const sansHoraire = useMemo(() => {
    const p = profs.find(x => x.id === profId);
    const places = new Set(emploisProf.map(e => e.classe_matiere));
    return (p?.affectations || []).filter(a => !places.has(a.id));
  }, [profs, profId, emploisProf]);

  const resumeProf = useMemo(() => {
    const minutes = emploisProf.reduce((t, e) => t + Math.max(0, versMinutes(e.heure_fin.slice(0, 5)) - versMinutes(e.heure_debut.slice(0, 5))), 0);
    return { heures: Math.round((minutes / 60) * 10) / 10, classes: new Set(emploisProf.map(e => e.classe_id)).size, cours: emploisProf.length };
  }, [emploisProf]);

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
          {parProf ? 'Emploi du temps par professeur' : lecture ? 'Emploi du temps des classes' : 'Emploi du Temps'}
        </Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {parProf && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Les cours d&apos;un professeur viennent des cours qui lui sont affectés dans chaque classe. Pour changer un horaire, passez en mode « Par classe » ;
          pour changer le professeur d&apos;un cours, modifiez l&apos;affectation du cours.
        </Alert>
      )}

      {!lecture && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Planifiez les cours par classe, jour et horaire. Un même créneau ne peut pas être pris deux fois
          par la même classe, ni par le même enseignant. Deux classes avec des enseignants différents
          peuvent avoir cours en même temps. Les créneaux se répètent chaque semaine.
        </Alert>
      )}

      {copie && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={() => setCopie(null)}>Terminer</Button>}>
          Copie de « {copie.matiere_nom} » : cliquez sur autant de cases que voulu pour la placer. Cliquez sur « Terminer » à la fin.
        </Alert>
      )}

      <Card sx={{ mb: 3, borderRadius: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            {peutVoirProfesseurs && (
              <Grid size={{ xs: 12, sm: 'auto' }}>
                <ToggleButtonGroup exclusive size="small" color="primary" value={mode}
                  onChange={(_, v) => { if (v) { setMode(v); setError(''); } }}>
                  <ToggleButton value="classe" sx={{ textTransform: 'none', px: 2 }}>Par classe</ToggleButton>
                  <ToggleButton value="professeur" sx={{ textTransform: 'none', px: 2 }}>Par professeur</ToggleButton>
                </ToggleButtonGroup>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              {parProf ? (
                <TextField select fullWidth size="small" label="Choisir un professeur"
                  value={profId} onChange={e => setProfId(e.target.value)}>
                  <MenuItem value=""><em>— Sélectionner —</em></MenuItem>
                  {profs.map(p => <MenuItem key={p.id} value={p.id}>{p.nom} ({p.cours} cours affectés)</MenuItem>)}
                </TextField>
              ) : (
                <TextField select fullWidth size="small" label="Choisir une classe"
                  value={classeId} onChange={e => setClasseId(e.target.value)}>
                  <MenuItem value=""><em>— Sélectionner —</em></MenuItem>
                  {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
                </TextField>
              )}
            </Grid>
            {parProf && profId && (
              <Grid size={{ xs: 12, sm: 'auto' }}>
                <Chip color="primary" variant="outlined" label={`${resumeProf.heures} h par semaine · ${resumeProf.classes} classe(s) · ${resumeProf.cours} créneau(x)`} />
              </Grid>
            )}
            {!parProf && classeId && !lecture && (
              <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => openAdd()}>
                  Ajouter un créneau
                </Button>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {!(parProf ? profId : classeId) && (
        <Box textAlign="center" py={8} color="text.secondary">
          <CalendarMonthIcon sx={{ fontSize: 64, opacity: 0.2, mb: 2 }} />
          <Typography>{parProf ? 'Sélectionnez un professeur pour voir son emploi du temps' : 'Sélectionnez une classe pour voir son emploi du temps'}</Typography>
        </Box>
      )}

      {(parProf ? profId : classeId) && loading && <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>}

      {parProf && profId && !loading && sansHoraire.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Ce professeur a {profs.find(x => x.id === profId)?.cours} cours affectés, mais {sansHoraire.length} n&apos;ont pas encore d&apos;horaire :
          ils n&apos;apparaissent donc pas dans la grille. Pour les placer, passez en mode « Par classe », choisissez la classe et ajoutez le créneau.
          <Box mt={0.5}>{sansHoraire.map(a => a.libelle).join(' · ')}</Box>
        </Alert>
      )}

      {(parProf ? profId : classeId) && !loading && (
        <Card sx={{ borderRadius: 3, overflow: 'auto' }}>
          <CardContent sx={{ p: 0 }}>
            {isMobile && (
              <Box sx={{ p: 1.5 }}>
                {JOURS.map((jour) => {
                  const vus = new Set();
                  const slotsJour = CRENEAUX.flatMap((h) => grille[jour][h] || []).filter((e) => {
                    if (vus.has(e.id)) return false;
                    vus.add(e.id);
                    return true;
                  }).sort((a, b) => String(a.heure_debut).localeCompare(String(b.heure_debut)));
                  return (
                    <Box key={jour} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography fontWeight={700}>{JOURS_LABELS[jour]}</Typography>
                        {!lecture && <Button size="small" startIcon={<AddIcon />} onClick={() => openAdd(jour, '08:00')}>Ajouter</Button>}
                      </Box>
                      {slotsJour.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ pl: 0.5 }}>Aucun cours</Typography>
                      )}
                      {slotsJour.map((emp) => (
                        <Box key={emp.id} sx={{
                          bgcolor: getColor(emp.classe_matiere, colorMap), color: 'white', borderRadius: 1.5,
                          p: 1.25, mb: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
                        }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography fontWeight={700} fontSize={14} sx={{ wordBreak: 'break-word' }}>{emp.matiere_nom}</Typography>
                            <Typography fontSize={12} sx={{ opacity: 0.9 }}>
                              {formatH(emp.heure_debut)} – {formatH(emp.heure_fin)}{emp.salle ? ` · ${emp.salle}` : ''}
                            </Typography>
                            {(parProf ? emp.classe_nom : emp.enseignant_nom) && <Typography fontSize={12} sx={{ opacity: 0.9 }}>{parProf ? emp.classe_nom : emp.enseignant_nom}</Typography>}
                          </Box>
                          {!lecture && (
                            <Box sx={{ display: 'flex', flexShrink: 0 }}>
                              <IconButton size="small" sx={{ color: 'white' }} onClick={() => openEdit(emp)} aria-label="Modifier">
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" sx={{ color: 'white' }} onClick={() => handleDelete(emp.id)} aria-label="Retirer">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          )}
                        </Box>
                      ))}
                    </Box>
                  );
                })}
              </Box>
            )}
            <Box sx={{ overflowX: 'auto', display: isMobile ? 'none' : 'block' }}>
              <table data-no-stack style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 700 }}>
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
                        if (couvert.has(`${jour}|${heure}`)) return null;
                        const slots = grille[jour][heure] || [];
                        const n = spans[`${jour}|${heure}`] || 1;
                        return (
                          <td key={jour} rowSpan={n}
                            style={{
                              border: '1px solid #e0e0e0', padding: 4, verticalAlign: 'top', minWidth: 110, position: 'relative',
                              background: survol === `${jour}|${heure}` ? '#e3f2fd' : undefined,
                            }}
                            onDoubleClick={lecture ? undefined : () => { if (!copie) openAdd(jour, heure); }}
                            onClick={lecture ? undefined : () => cliquerCase(jour, heure)}
                            onDragOver={lecture ? undefined : (e) => { e.preventDefault(); if (survol !== `${jour}|${heure}`) setSurvol(`${jour}|${heure}`); }}
                            onDragLeave={lecture ? undefined : () => setSurvol((s) => (s === `${jour}|${heure}` ? '' : s))}
                            onDrop={lecture ? undefined : (e) => deposer(e, jour, heure)}>
                            {slots.map(emp => {
                              const color = getColor(emp.classe_matiere, colorMap);
                              return (
                                <Box key={emp.id} draggable={!lecture}
                                  onDragStart={(e) => glisser(e, { kind: 'creneau', id: emp.id })}
                                  sx={{
                                  bgcolor: color, color: 'white', borderRadius: 1, cursor: 'grab',
                                  p: '4px 6px', mb: 0.5, fontSize: 11,
                                  // cours sur plusieurs lignes : le bloc remplit toute la case étendue
                                  ...(n > 1 ? { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, mb: 0, overflow: 'hidden' } : {}),
                                }}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 0.5 }}>
                                    <Typography fontSize={11} fontWeight="bold" lineHeight={1.3} sx={{ wordBreak: 'break-word' }}>
                                      {emp.matiere_nom}
                                    </Typography>
                                    {!lecture && <Box sx={{ display: 'flex', flexShrink: 0 }}>
                                      <Tooltip title="Dupliquer (puis cliquer sur une case)">
                                        <IconButton size="small" sx={{ color: 'white', p: 0.3 }} onClick={(ev) => { ev.stopPropagation(); setCopie(emp); }}>
                                          <ContentCopyIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Modifier">
                                        <IconButton size="small" sx={{ color: 'white', p: 0.3 }} onClick={(ev) => { ev.stopPropagation(); openEdit(emp); }}>
                                          <EditIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Retirer">
                                        <IconButton size="small" sx={{ color: 'white', p: 0.3 }} onClick={(ev) => { ev.stopPropagation(); handleDelete(emp.id); }}>
                                          <DeleteIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                      </Tooltip>
                                    </Box>}
                                  </Box>
                                  {(parProf ? emp.classe_nom : emp.enseignant_nom) && <Typography fontSize={10} sx={{ opacity: 0.9 }}>{parProf ? emp.classe_nom : emp.enseignant_nom}</Typography>}
                                  <Typography fontSize={10} sx={{ opacity: 0.85 }}>
                                    {formatH(emp.heure_debut)} – {formatH(emp.heure_fin)}
                                    {emp.salle ? ` · ${emp.salle}` : ''}
                                  </Typography>
                                </Box>
                              );
                            })}
                            {!lecture && slots.length === 0 && (
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
            <Box p={2}>
              {!isMobile && !lecture && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Glissez une matière dans une case pour la placer (1 h). Glissez un cours déjà placé pour le déplacer (touche Ctrl enfoncée : le dupliquer), ou utilisez l’icône de copie.
                </Typography>
              )}
              <Box display="flex" flexWrap="wrap" gap={1}>
                {!parProf && classeMatieres.map(cm => (
                  <Chip key={cm.id} size="small" label={`${cm.matiere_nom} — ${cm.enseignant_nom || 'N/A'}`}
                    draggable={!isMobile && !lecture}
                    onDragStart={(e) => glisser(e, { kind: 'matiere', id: cm.id })}
                    sx={{ bgcolor: getColor(cm.id, colorMap), color: 'white', fontSize: 11, cursor: isMobile || lecture ? 'default' : 'grab' }} />
                ))}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Dialog ajout/modif */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{editId ? 'Modifier le créneau' : 'Ajouter un créneau'}</DialogTitle>
        <DialogContent>
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
                value={form.heure_debut} onChange={e => {
                  const debut = e.target.value;
                  const duree = Math.max(30, versMinutes(form.heure_fin) - versMinutes(form.heure_debut));
                  setForm({ ...form, heure_debut: debut, heure_fin: debut ? depuisMinutes(Math.min(versMinutes(debut) + duree, 23 * 60 + 59)) : form.heure_fin });
                }}
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
