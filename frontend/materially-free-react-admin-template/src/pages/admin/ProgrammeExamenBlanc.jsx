import { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, MenuItem, TextField,
  Button, Alert, CircularProgress, Chip, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tooltip
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import EventIcon from '@mui/icons-material/Event';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { niveauService, trimestreService, classeMatiereService,
         calendrierExamenBlancService, programmeExamenBlancService, getResults } from 'services/api';

export default function ProgrammeExamenBlanc() {
  const [niveaux, setNiveaux] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [selectedNiveau, setSelectedNiveau] = useState('');
  const [selectedTrimestre, setSelectedTrimestre] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Calendrier courant pour (niveau, trimestre)
  const [calendrier, setCalendrier] = useState(null);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  // Matières disponibles pour ce niveau
  const [matieresDuNiveau, setMatieresDuNiveau] = useState([]);

  // Programmes : { [matiereId]: { id (si existe), contenu } }
  const [programmes, setProgrammes] = useState({});

  useEffect(() => {
    Promise.all([niveauService.getAll(), trimestreService.getAll()])
      .then(([rN, rT]) => {
        setNiveaux(getResults(rN).items.filter(n => n.is_classe_examen));
        setTrimestres(rT.data);
      });
  }, []);

  const loadCalendrier = useCallback(async () => {
    if (!selectedNiveau || !selectedTrimestre) return;
    setLoading(true);
    setError('');
    setCalendrier(null);
    setDateDebut('');
    setDateFin('');
    setProgrammes({});

    try {
      const resCM = await classeMatiereService.getAll(`?niveau_id=${selectedNiveau}`);
      const uniqueMatieres = [
        ...new Map(resCM.data.map(cm => [cm.matiere, { id: cm.matiere, nom: cm.matiere_nom }])).values()
      ].sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresDuNiveau(uniqueMatieres);

      const resC = await calendrierExamenBlancService.getByNiveauTrimestre(selectedNiveau, selectedTrimestre);
      const items = getResults(resC).items;

      if (items.length > 0) {
        const cal = items[0];
        setCalendrier(cal);
        setDateDebut(cal.date_debut);
        setDateFin(cal.date_fin);
        const progMap = {};
        uniqueMatieres.forEach(m => { progMap[m.id] = { id: null, contenu: '' }; });
        cal.programmes.forEach(p => {
          progMap[p.matiere] = { id: p.id, contenu: p.contenu };
        });
        setProgrammes(progMap);
      } else {
        const progMap = {};
        uniqueMatieres.forEach(m => { progMap[m.id] = { id: null, contenu: '' }; });
        setProgrammes(progMap);
      }
    } catch {
      setError('Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [selectedNiveau, selectedTrimestre]);

  useEffect(() => { loadCalendrier(); }, [loadCalendrier]);

  const handleSave = async () => {
    if (!dateDebut || !dateFin) {
      setError('Les dates de début et fin sont obligatoires.');
      return;
    }
    if (dateFin < dateDebut) {
      setError('La date de fin doit être après la date de début.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let cal = calendrier;

      if (!cal) {
        const res = await calendrierExamenBlancService.create({
          niveau: selectedNiveau,
          trimestre: selectedTrimestre,
          date_debut: dateDebut,
          date_fin: dateFin,
        });
        cal = res.data;
        setCalendrier(cal);
      } else {
        await calendrierExamenBlancService.patch(cal.id, { date_debut: dateDebut, date_fin: dateFin });
      }

      const updatedMap = { ...programmes };
      for (const [matiereId, prog] of Object.entries(programmes)) {
        if (prog.id) {
          await programmeExamenBlancService.patch(prog.id, { contenu: prog.contenu });
        } else if (prog.contenu.trim()) {
          const res = await programmeExamenBlancService.create({
            calendrier: cal.id,
            matiere: parseInt(matiereId),
            contenu: prog.contenu,
          });
          updatedMap[matiereId] = { id: res.data.id, contenu: prog.contenu };
        }
      }
      setProgrammes(updatedMap);
      setSuccess("Calendrier d'Examen Blanc enregistré avec succès !");
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err?.response?.data?.detail || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProgramme = async (matiereId) => {
    const prog = programmes[matiereId];
    if (!prog?.id) {
      setProgrammes(prev => ({ ...prev, [matiereId]: { id: null, contenu: '' } }));
      return;
    }
    try {
      await programmeExamenBlancService.delete(prog.id);
      setProgrammes(prev => ({ ...prev, [matiereId]: { id: null, contenu: '' } }));
    } catch {
      setError('Erreur lors de la suppression du programme.');
    }
  };

  const niveauNom = niveaux.find(n => String(n.id) === String(selectedNiveau))?.nom || '';
  const trimestreObj = trimestres.find(t => String(t.id) === String(selectedTrimestre));
  const trimestreLabel = trimestreObj ? `${trimestreObj.annee_libelle || ''} — ${trimestreObj.nom}` : '';

  const programmesRemplis = Object.values(programmes).filter(p => p.contenu?.trim()).length;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <EventIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Programme des Examens Blancs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Définissez les dates et le programme par matière pour chaque niveau d'examen
          </Typography>
        </Box>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Sélecteurs */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField select fullWidth label="Niveau (examen)" size="small"
                value={selectedNiveau}
                onChange={e => { setSelectedNiveau(e.target.value); setSelectedTrimestre(''); }}>
                <MenuItem value=""><em>Sélectionner un niveau</em></MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
              {niveaux.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Aucun niveau d'examen configuré (voir Gestion des Niveaux).
                </Typography>
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField select fullWidth label="Trimestre" size="small"
                value={selectedTrimestre}
                onChange={e => setSelectedTrimestre(e.target.value)}
                disabled={!selectedNiveau}>
                <MenuItem value=""><em>Sélectionner un trimestre</em></MenuItem>
                {trimestres.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.annee_libelle || t.annee_scolaire} — {t.nom}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              {calendrier && (
                <Chip label="Calendrier existant" color="success" size="small" icon={<EventIcon />} />
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {!selectedNiveau || !selectedTrimestre ? (
        <Box textAlign="center" py={8} color="text.secondary">
          <EventIcon sx={{ fontSize: 64, opacity: 0.15, mb: 1 }} />
          <Typography>Sélectionnez un niveau d'examen et un trimestre pour commencer.</Typography>
        </Box>
      ) : loading ? (
        <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>
      ) : (
        <>
          {/* Dates de la session */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <EventIcon color="primary" />
                <Typography variant="h6" fontWeight="bold">
                  Dates de la session — {niveauNom}
                  {trimestreLabel && <Typography component="span" variant="body2" color="text.secondary" ml={1}>({trimestreLabel})</Typography>}
                </Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth label="Date de début" type="date" size="small"
                    InputLabelProps={{ shrink: true }}
                    value={dateDebut}
                    onChange={e => setDateDebut(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth label="Date de fin" type="date" size="small"
                    InputLabelProps={{ shrink: true }}
                    value={dateFin}
                    onChange={e => setDateFin(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }} display="flex" alignItems="center">
                  {dateDebut && dateFin && (
                    <Chip
                      label={`${new Date(dateDebut).toLocaleDateString('fr-FR')} → ${new Date(dateFin).toLocaleDateString('fr-FR')}`}
                      color="primary" variant="outlined" size="small"
                    />
                  )}
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Programmes par matière */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <MenuBookIcon color="primary" />
                  <Typography variant="h6" fontWeight="bold">
                    Programmes par matière
                  </Typography>
                  <Chip label={`${programmesRemplis}/${matieresDuNiveau.length} remplis`}
                    size="small" color={programmesRemplis === matieresDuNiveau.length ? 'success' : 'default'} />
                </Box>
              </Box>

              {matieresDuNiveau.length === 0 ? (
                <Alert severity="info">
                  Aucune matière assignée à ce niveau. Vérifiez les affectations cours/classes.
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'primary.main' }}>
                      <TableRow>
                        <TableCell sx={{ color: 'white', width: 200 }}><strong>Matière</strong></TableCell>
                        <TableCell sx={{ color: 'white' }}><strong>Programme à évaluer</strong></TableCell>
                        <TableCell sx={{ color: 'white', width: 60 }} align="center"><strong>Eff.</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matieresDuNiveau.map(matiere => {
                        const prog = programmes[matiere.id] || { id: null, contenu: '' };
                        return (
                          <TableRow key={matiere.id} hover>
                            <TableCell>
                              <Typography fontWeight="bold" variant="body2">{matiere.nom}</Typography>
                              {prog.id && <Chip label="Enregistré" size="small" color="success" sx={{ mt: 0.5 }} />}
                            </TableCell>
                            <TableCell>
                              <TextField
                                fullWidth multiline rows={2} size="small"
                                placeholder="Ex: Chapitres 1 à 3, Thèmes traités en cours..."
                                value={prog.contenu}
                                onChange={e => setProgrammes(prev => ({
                                  ...prev,
                                  [matiere.id]: { ...prev[matiere.id], contenu: e.target.value }
                                }))}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              {prog.contenu?.trim() && (
                                <Tooltip title="Vider le programme">
                                  <IconButton size="small" color="error"
                                    onClick={() => handleDeleteProgramme(matiere.id)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          <Box display="flex" justifyContent="flex-end">
            <Button
              variant="contained" size="large" startIcon={<SaveIcon />}
              onClick={handleSave} disabled={saving || !dateDebut || !dateFin}>
              {saving ? 'Enregistrement...' : calendrier ? 'Mettre à jour' : 'Créer le calendrier'}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
