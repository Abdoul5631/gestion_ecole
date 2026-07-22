import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, CircularProgress, Alert, Chip,
  Divider, TextField, MenuItem, Button
} from '@mui/material';
import EventNoteIcon from '@mui/icons-material/EventNote';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import DateRangeIcon from '@mui/icons-material/DateRange';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SaveIcon from '@mui/icons-material/Save';
import authService from 'services/auth';
import {
  calendrierExamenBlancService, classeMatiereService, eleveService,
  evaluationService, noteService, getResults
} from 'services/api';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Saisie des notes d'Examen Blanc — même style simple que la saisie de notes habituelle ─
function SaisieExamenBlancInline({ niveauId, trimestreId, trimestreLabel }) {
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [selectedCM, setSelectedCM] = useState('');
  const [eleves, setEleves] = useState([]);
  const [notes, setNotes] = useState({});
  const [evaluationId, setEvaluationId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    classeMatiereService.getAll(`?niveau_id=${niveauId}`)
      .then(res => setClasseMatieres(getResults(res).items));
  }, [niveauId]);

  const handleCMChange = async (e) => {
    const cmId = e.target.value;
    setSelectedCM(cmId);
    setNotes({});
    setEvaluationId(null);
    setError('');
    setSuccess('');
    if (!cmId) return;

    const cm = classeMatieres.find(c => String(c.id) === String(cmId));
    setLoading(true);
    try {
      const [resEl, resEv] = await Promise.all([
        eleveService.getAll(`/eleves/?classe_id=${cm.classe}`),
        evaluationService.getAll(),
      ]);
      const elevesItems = getResults(resEl).items;
      setEleves(elevesItems);

      const init = {};
      elevesItems.forEach(el => { init[el.id] = ''; });

      const existingEval = resEv.data.find(
        ev => ev.classe_matiere === parseInt(cmId) && ev.type === 'EXAMEN_BLANC' && ev.trimestre === trimestreId
      );
      if (existingEval) {
        setEvaluationId(existingEval.id);
        const resNotes = await evaluationService.getNotes(existingEval.id);
        resNotes.data.forEach(n => { if (init[n.eleve] !== undefined) init[n.eleve] = n.valeur; });
      }
      setNotes(init);
    } catch {
      setError('Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      let evalId = evaluationId;
      if (!evalId) {
        const res = await evaluationService.create({
          classe_matiere: parseInt(selectedCM),
          trimestre: trimestreId,
          type: 'EXAMEN_BLANC',
          coefficient: 1,
        });
        evalId = res.data.id;
        setEvaluationId(evalId);
      }

      const notesToSubmit = Object.entries(notes)
        .filter(([, v]) => v !== '' && v !== null)
        .map(([eleveId, valeur]) => ({ eleve_id: parseInt(eleveId), valeur: parseFloat(valeur) }));

      if (notesToSubmit.length === 0) throw new Error('Aucune note à enregistrer.');

      await noteService.saisieMasse({ evaluation_id: evalId, notes: notesToSubmit });
      setSuccess(`${notesToSubmit.length} note(s) enregistrée(s) !`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || err.response?.data?.detail || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  if (classeMatieres.length === 0) return null; // ce prof n'enseigne pas dans ce niveau

  return (
    <Box mt={3}>
      <Divider sx={{ mb: 2 }} />
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <EditNoteIcon color="primary" fontSize="small" />
        <Typography variant="subtitle1" fontWeight="bold">Saisir les notes — {trimestreLabel}</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <TextField select fullWidth size="small" label="Ma matière" value={selectedCM}
        onChange={handleCMChange} sx={{ mb: 2, maxWidth: 340 }}>
        <MenuItem value=""><em>Choisir une matière</em></MenuItem>
        {classeMatieres.map(cm => (
          <MenuItem key={cm.id} value={cm.id}>{cm.matiere_nom} — {cm.classe_nom}</MenuItem>
        ))}
      </TextField>

      {loading && <Box display="flex" justifyContent="center" p={2}><CircularProgress size={24} /></Box>}

      {!loading && selectedCM && eleves.length > 0 && (
        <>
          <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'primary.main' }}>
                <TableRow>
                  <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                  <TableCell sx={{ color: 'white' }}><strong>Nom Prénom</strong></TableCell>
                  <TableCell sx={{ color: 'white', width: 160 }}><strong>Note /20</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {eleves.map(el => (
                  <TableRow key={el.id} hover>
                    <TableCell>{el.matricule}</TableCell>
                    <TableCell>{el.nom} {el.prenom}</TableCell>
                    <TableCell>
                      <TextField type="number" size="small" fullWidth
                        value={notes[el.id] ?? ''}
                        onChange={e => setNotes(prev => ({ ...prev, [el.id]: e.target.value }))}
                        inputProps={{ step: 0.25, min: 0, max: 20 }}
                        placeholder="—" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box display="flex" justifyContent="flex-end" mt={2}>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

export default function ProgrammeExamenBlancView() {
  const [calendriers, setCalendriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const role = authService.getRole();

  useEffect(() => {
    calendrierExamenBlancService.getAll()
      .then(res => setCalendriers(getResults(res).items))
      .catch(() => setError("Erreur lors du chargement du programme d'Examen Blanc."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <Box sx={{
          width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'warning.light', color: 'warning.dark',
        }}>
          <WorkspacePremiumIcon fontSize="medium" />
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Programme des Examens Blancs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Dates et matières prévues pour la session
          </Typography>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : calendriers.length === 0 ? (
        <Alert severity="info">Aucun programme d'Examen Blanc publié pour le moment.</Alert>
      ) : (
        calendriers.map(cal => (
          <Card key={cal.id} sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }} elevation={2}>
            {/* Bandeau en-tête */}
            <Box sx={{
              background: 'linear-gradient(135deg, #1a237e 0%, #3949ab 100%)',
              color: 'white', px: 3, py: 2.5,
            }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
                <Box>
                  <Typography variant="h5" fontWeight="bold" lineHeight={1.2}>{cal.niveau_nom}</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    {cal.annee_libelle} — {cal.trimestre_nom}
                  </Typography>
                </Box>
                <Chip
                  icon={<DateRangeIcon sx={{ color: 'white !important' }} />}
                  label={`${fmtDate(cal.date_debut)}  →  ${fmtDate(cal.date_fin)}`}
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.15)', color: 'white', fontWeight: 600,
                    px: 1, height: 36, borderRadius: 2,
                  }}
                />
              </Box>
            </Box>

            <CardContent sx={{ pt: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <MenuBookIcon color="primary" fontSize="small" />
                <Typography variant="subtitle1" fontWeight="bold">Programme par matière</Typography>
              </Box>

              {cal.programmes.length === 0 ? (
                <Alert severity="info" variant="outlined">
                  Aucun programme par matière renseigné pour l'instant.
                </Alert>
              ) : (
                <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'primary.main' }}>
                      <TableRow>
                        <TableCell sx={{ color: 'white', width: 200 }}><strong>Matière</strong></TableCell>
                        <TableCell sx={{ color: 'white' }}><strong>Programme à évaluer</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cal.programmes.map((p, i) => (
                        <TableRow key={p.id} hover sx={{ bgcolor: i % 2 === 0 ? 'transparent' : 'action.hover' }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight="bold">{p.matiere_nom}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color={p.contenu ? 'text.primary' : 'text.disabled'}>
                              {p.contenu || 'Non renseigné'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {role === 'ENSEIGNANT' && (
                <SaisieExamenBlancInline
                  niveauId={cal.niveau}
                  trimestreId={cal.trimestre}
                  trimestreLabel={`${cal.annee_libelle} — ${cal.trimestre_nom}`}
                />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
}
