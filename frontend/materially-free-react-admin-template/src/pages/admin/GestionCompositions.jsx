import { idTrimestreParDefaut, trimestresEnCours } from 'utils/anneeDefaut';
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, MenuItem, TextField,
  Button, Alert, CircularProgress, Divider, Chip, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tooltip
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import EventIcon from '@mui/icons-material/Event';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { messageErreur } from 'utils/erreurs';
import PublicationCalendrier from 'components/PublicationCalendrier';
import { niveauService, trimestreService, classeMatiereService, classeService,
         calendrierCompoService, programmeCompoService, evaluationService } from 'services/api';

const VIDE = { id: null, date: '', debut: '', fin: '' };
const hhmm = (t) => (t || '').slice(0, 5);
const aDate = (p) => !!p?.date;

export default function GestionCompositions() {
  const [niveaux, setNiveaux] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [selectedNiveau, setSelectedNiveau] = useState('');
  const [selectedTrimestre, setSelectedTrimestre] = useState('');
  const [classes, setClasses] = useState([]); // classes du niveau : chacune a son propre programme
  const [selectedClasse, setSelectedClasse] = useState('');

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

  // Épreuves : { [matiereId]: { id (si existe), date, debut, fin } }
  const [programmes, setProgrammes] = useState({});

  // Chargement des référentiels
  const [generation, setGeneration] = useState(false);
  const genererEvaluations = async (ceNiveau) => {
    setGeneration(true);
    setError('');
    try {
      const res = await evaluationService.generer({
        type: 'COMPOSITION',
        trimestre_id: selectedTrimestre,
        niveau_id: ceNiveau ? selectedNiveau : undefined,
      });
      setSuccess(res.data?.message || 'Évaluations programmées.');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de programmer les évaluations.');
    } finally {
      setGeneration(false);
    }
  };

  useEffect(() => {
    Promise.all([niveauService.getAll(), trimestreService.getAll()])
      .then(([rN, rT]) => {
        setNiveaux(rN.data);
        setTrimestres(trimestresEnCours(rT.data));
        setSelectedTrimestre(prev => prev || idTrimestreParDefaut(rT.data));
      });
  }, []);

  const loadCalendrier = useCallback(async () => {
    if (!selectedNiveau || !selectedTrimestre || !niveaux.length) return;
    setLoading(true);
    setError('');
    setCalendrier(null);
    setDateDebut('');
    setDateFin('');
    setProgrammes({});

    try {
      // 1. Classes du niveau, puis matières de la classe choisie (Tle A et Tle D n'ont pas les mêmes)
      const resCl = await classeService.getAll();
      const lesClasses = (Array.isArray(resCl.data) ? resCl.data : resCl.data.results ?? [])
        .filter(c => String(c.niveau) === String(selectedNiveau) && c.is_active !== false)
        .sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true }));
      setClasses(lesClasses);
      const classeId = lesClasses.some(c => String(c.id) === String(selectedClasse)) ? selectedClasse : (lesClasses[0]?.id || '');
      if (String(classeId) !== String(selectedClasse)) setSelectedClasse(classeId);
      // Collège (6ème à 3ème) : même programme pour tout le niveau, donc toutes les matières du niveau.
      // Lycée (2nde, 1ère, Terminale) : matières de la classe choisie seulement.
      const parClasse = !!niveaux.find(n => String(n.id) === String(selectedNiveau))?.programme_par_classe;
      const resCM = await classeMatiereService.getAll(`?niveau_id=${selectedNiveau}`);
      const uniqueMatieres = [
        ...new Map((Array.isArray(resCM.data) ? resCM.data : resCM.data.results ?? [])
          .filter(cm => !parClasse || String(cm.classe) === String(classeId))
          .map(cm => [cm.matiere, { id: cm.matiere, nom: cm.matiere_nom }])).values()
      ].sort((a, b) => a.nom.localeCompare(b.nom));
      setMatieresDuNiveau(uniqueMatieres);

      // 2. Calendrier existant ?
      const resC = await calendrierCompoService.getByNiveauTrimestre(selectedNiveau, selectedTrimestre);
      const items = Array.isArray(resC.data) ? resC.data : resC.data.results ?? [];

      if (items.length > 0) {
        const cal = items[0];
        setCalendrier(cal);
        setDateDebut(cal.date_debut);
        setDateFin(cal.date_fin);
        // Initialiser programmes depuis cal.programmes
        const progMap = {};
        uniqueMatieres.forEach(m => { progMap[m.id] = { ...VIDE }; });
        cal.programmes.filter(p => (parClasse ? String(p.classe) === String(classeId) : !p.classe)).forEach(p => {
          progMap[p.matiere] = { id: p.id, date: p.date_composition || '', debut: hhmm(p.heure_debut), fin: hhmm(p.heure_fin) };
        });
        setProgrammes(progMap);
      } else {
        // Pas encore de calendrier — initialiser vide
        const progMap = {};
        uniqueMatieres.forEach(m => { progMap[m.id] = { ...VIDE }; });
        setProgrammes(progMap);
      }
    } catch {
      setError('Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  }, [selectedNiveau, selectedTrimestre, selectedClasse, niveaux]);

  useEffect(() => {
    loadCalendrier();
  }, [loadCalendrier]);

  const handleSave = async () => {
    if (!dateDebut || !dateFin) {
      setError('Les dates de début et fin sont obligatoires.');
      return;
    }
    if (dateFin < dateDebut) {
      setError('La date de fin doit être après la date de début.');
      return;
    }
    for (const [matiereId, prog] of Object.entries(programmes)) {
      const nom = matieresDuNiveau.find(m => String(m.id) === String(matiereId))?.nom;
      if (!prog.date && (prog.debut || prog.fin)) { setError(`${nom} : choisissez aussi la date de l'épreuve.`); return; }
      if (prog.date && (prog.date < dateDebut || prog.date > dateFin)) { setError(`${nom} : la date doit être comprise dans la session (${dateDebut} → ${dateFin}).`); return; }
      if (prog.debut && prog.fin && prog.fin <= prog.debut) { setError(`${nom} : l'heure de fin doit être après l'heure de début.`); return; }
    }
    setSaving(true);
    setError('');
    try {
      let cal = calendrier;

      // Créer ou mettre à jour le calendrier
      if (!cal) {
        const res = await calendrierCompoService.create({
          niveau: selectedNiveau,
          trimestre: selectedTrimestre,
          date_debut: dateDebut,
          date_fin: dateFin,
        });
        cal = res.data;
        setCalendrier(cal);
      } else {
        await calendrierCompoService.patch(cal.id, { date_debut: dateDebut, date_fin: dateFin });
      }

      // Sauvegarder l'épreuve de chaque matière
      const updatedMap = { ...programmes };
      for (const [matiereId, prog] of Object.entries(programmes)) {
        const data = { date_composition: prog.date || null, heure_debut: prog.debut || null, heure_fin: prog.fin || null };
        if (prog.id) {
          await programmeCompoService.patch(prog.id, data);
        } else if (prog.date) {
          const res = await programmeCompoService.create({ calendrier: cal.id, classe: parClasse ? selectedClasse : null, matiere: parseInt(matiereId), ...data });
          updatedMap[matiereId] = { ...prog, id: res.data.id };
        }
      }
      setProgrammes(updatedMap);
      setSuccess('Calendrier de composition enregistré avec succès !');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(messageErreur(err, "Erreur lors de l'enregistrement."));
    } finally {
      setSaving(false);
    }
  };

  const viderEpreuve = async (matiereId) => {
    const prog = programmes[matiereId];
    try {
      if (prog?.id) await programmeCompoService.patch(prog.id, { date_composition: null, heure_debut: null, heure_fin: null });
      setProgrammes(prev => ({ ...prev, [matiereId]: { ...VIDE, id: prog?.id || null } }));
    } catch {
      setError("Erreur lors de la suppression de l'épreuve.");
    }
  };

  const modifier = (matiereId, champ, valeur) =>
    setProgrammes(prev => ({ ...prev, [matiereId]: { ...(prev[matiereId] || VIDE), [champ]: valeur } }));

  const parClasse = !!niveaux.find(n => String(n.id) === String(selectedNiveau))?.programme_par_classe;
  const niveauNom = niveaux.find(n => String(n.id) === String(selectedNiveau))?.nom || '';
  const trimestreObj = trimestres.find(t => String(t.id) === String(selectedTrimestre));
  const trimestreLabel = trimestreObj ? `${trimestreObj.annee_libelle || ''} — ${trimestreObj.nom}` : '';

  const programmesRemplis = Object.values(programmes).filter(aDate).length;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <EventIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Box>
          <Typography variant="h4" fontWeight="bold">Calendrier des Compositions</Typography>
          <Typography variant="body2" color="text.secondary">
            Fixez la session, puis le jour et l'heure de la composition de chaque matière
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
              <TextField select fullWidth label="Niveau" size="small"
                value={selectedNiveau}
                onChange={e => { setSelectedNiveau(e.target.value); setSelectedClasse(''); }}>
                <MenuItem value=""><em>Sélectionner un niveau</em></MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
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

      {/* Contenu principal */}
      {!selectedNiveau || !selectedTrimestre ? (
        <Box textAlign="center" py={8} color="text.secondary">
          <EventIcon sx={{ fontSize: 64, opacity: 0.15, mb: 1 }} />
          <Typography>Sélectionnez un niveau et un trimestre pour commencer.</Typography>
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

          {/* Programmes par matière : chaque classe a le sien */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {parClasse
                  ? "Choisissez la classe : au lycée, le programme est propre à chaque classe (matières et jours différents d'une série à l'autre)."
                  : `Le programme est le même pour toutes les classes de ${niveauNom || 'ce niveau'}.`}
              </Typography>
              {!parClasse ? null : classes.length === 0 ? (
                <Alert severity="info" sx={{ mb: 2 }}>Aucune classe dans ce niveau. Créez d&apos;abord les classes.</Alert>
              ) : (
                <Box display="flex" gap={1} flexWrap="wrap" mb={2}>
                  {classes.map(c => (
                    <Chip key={c.id} clickable label={c.nom}
                      color={String(c.id) === String(selectedClasse) ? 'primary' : 'default'}
                      variant={String(c.id) === String(selectedClasse) ? 'filled' : 'outlined'}
                      onClick={() => setSelectedClasse(c.id)} sx={{ fontWeight: 700 }} />
                  ))}
                </Box>
              )}
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                  <MenuBookIcon color="primary" />
                  <Typography variant="h6" fontWeight="bold">
                    Jour et heure par matière{parClasse ? ` — ${classes.find(c => String(c.id) === String(selectedClasse))?.nom || ''}` : ''}
                  </Typography>
                  <Chip label={`${programmesRemplis}/${matieresDuNiveau.length} planifiées`}
                    size="small" color={programmesRemplis === matieresDuNiveau.length ? 'success' : 'default'} />
                </Box>
              </Box>

              {matieresDuNiveau.length === 0 ? (
                <Alert severity="info">
                  Aucune matière n&apos;est affectée à cette classe. Vérifiez les matières de la classe (page Matières).
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'primary.main' }}>
                      <TableRow>
                        <TableCell sx={{ color: 'white' }}><strong>Matière</strong></TableCell>
                        <TableCell sx={{ color: 'white', width: 190 }}><strong>Date</strong></TableCell>
                        <TableCell sx={{ color: 'white', width: 130 }}><strong>Début</strong></TableCell>
                        <TableCell sx={{ color: 'white', width: 130 }}><strong>Fin</strong></TableCell>
                        <TableCell sx={{ color: 'white', width: 60 }} align="center" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matieresDuNiveau.map(matiere => {
                        const prog = programmes[matiere.id] || VIDE;
                        return (
                          <TableRow key={matiere.id} hover>
                            <TableCell>
                              <Typography fontWeight="bold" variant="body2">{matiere.nom}</Typography>
                              {prog.id && prog.date && <Chip label="Enregistré" size="small" color="success" sx={{ mt: 0.5 }} />}
                            </TableCell>
                            <TableCell>
                              <TextField fullWidth type="date" size="small" value={prog.date}
                                inputProps={{ min: dateDebut || undefined, max: dateFin || undefined }}
                                onChange={e => modifier(matiere.id, 'date', e.target.value)} />
                            </TableCell>
                            <TableCell>
                              <TextField fullWidth type="time" size="small" value={prog.debut} disabled={!prog.date}
                                onChange={e => modifier(matiere.id, 'debut', e.target.value)} />
                            </TableCell>
                            <TableCell>
                              <TextField fullWidth type="time" size="small" value={prog.fin} disabled={!prog.date}
                                onChange={e => modifier(matiere.id, 'fin', e.target.value)} />
                            </TableCell>
                            <TableCell align="center">
                              {(prog.date || prog.debut || prog.fin) && (
                                <Tooltip title="Effacer le jour et l'heure">
                                  <IconButton size="small" color="error" onClick={() => viderEpreuve(matiere.id)}>
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

          {/* Programmer les évaluations (directeur) */}
          <Box display="flex" justifyContent="flex-end" gap={1} flexWrap="wrap" mb={1.5}>
            <Button variant="outlined" disabled={generation || !selectedTrimestre} onClick={() => genererEvaluations(true)}>
              Créer les compositions de ce niveau
            </Button>
            <Button variant="outlined" disabled={generation || !selectedTrimestre} onClick={() => genererEvaluations(false)}>
              Créer les compositions de toute l’école
            </Button>
          </Box>

          {/* Bouton Enregistrer */}
          <Box display="flex" justifyContent="flex-end">
            <Button
              variant="contained" size="large" startIcon={<SaveIcon />}
              onClick={handleSave} disabled={saving || !dateDebut || !dateFin}>
              {saving ? 'Enregistrement...' : calendrier ? 'Mettre à jour' : 'Créer le calendrier'}
            </Button>
          </Box>

          {/* Publication : invisible pour les familles tant que le directeur ne publie pas */}
          <PublicationCalendrier calendrier={calendrier} service={calendrierCompoService} onChange={setCalendrier} />
        </>
      )}
    </Box>
  );
}
