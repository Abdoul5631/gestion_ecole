import { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, CircularProgress, Alert, Chip,
  Divider, TextField, MenuItem, Button, Avatar
} from '@mui/material';
import EventNoteIcon from '@mui/icons-material/EventNote';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import DateRangeIcon from '@mui/icons-material/DateRange';
import EditNoteIcon from '@mui/icons-material/EditNote';
import SaveIcon from '@mui/icons-material/Save';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import {
  calendrierExamenBlancService, classeMatiereService, eleveService,
  evaluationService, noteService, getResults
} from 'services/api';

function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** « 2 – 7 décembre 2026 » (ou deux dates complètes si l'API ne gère pas formatRange). */
function plageDates(debut, fin) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      .formatRange(new Date(debut), new Date(fin));
  } catch {
    return `${fmtDate(debut)} → ${fmtDate(fin)}`;
  }
}

/** Où en est la session : en cours / dans N jours / terminée. */
function statutSession(debut, fin) {
  const jour = new Date(); jour.setHours(0, 0, 0, 0);
  const d = new Date(`${debut}T00:00:00`);
  const f = new Date(`${fin}T00:00:00`);
  if (jour > f) return { label: 'Terminé', color: 'default' };
  if (jour >= d) return { label: 'En cours', color: 'success' };
  const n = Math.ceil((d - jour) / 86400000);
  return { label: n === 1 ? 'Demain' : `Dans ${n} jours`, color: n <= 7 ? 'warning' : 'info' };
}

const AVATAR_COLORS = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828', '#0288d1', '#00796b', '#5d4037'];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

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
                  <TableCell sx={{ color: 'white', width: { xs: 'auto', sm: 160 } }}><strong>Note /20</strong></TableCell>
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
  // parent : uniquement la classe de l'enfant choisi
  const { enfants, selectedId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  useEffect(() => {
    if (role === 'PARENT' && (loadingEnfants || !selectedId)) {
      if (!loadingEnfants) { setCalendriers([]); setLoading(false); }
      return;
    }
    setLoading(true);
    calendrierExamenBlancService.getAll(role === 'PARENT' ? `?eleve_id=${selectedId}` : '')
      .then(res => setCalendriers(getResults(res).items))
      .catch(() => setError("Erreur lors du chargement du programme d'Examen Blanc."))
      .finally(() => setLoading(false));
  }, [role, selectedId, loadingEnfants]);

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

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={selectedId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : calendriers.length === 0 ? (
        <Alert severity="info">Aucun programme d'Examen Blanc publié pour le moment.</Alert>
      ) : (
        calendriers.map(cal => {
          const statut = statutSession(cal.date_debut, cal.date_fin);
          const programmes = [...cal.programmes].sort((x, y) =>
            String(x.date_examen || '9999').localeCompare(String(y.date_examen || '9999'))
            || String(x.heure_debut || '').localeCompare(String(y.heure_debut || ''))
            || String(x.matiere_nom).localeCompare(String(y.matiere_nom)));
          return (
            <Card key={cal.id} sx={{ mb: 3, borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <Box sx={{
                px: { xs: 2, sm: 3 }, py: 2, bgcolor: 'grey.50',
                borderBottom: '1px solid', borderColor: 'divider',
                borderLeft: '6px solid', borderLeftColor: 'warning.main',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5,
              }}>
                <Box>
                  <Typography variant="h5" fontWeight={700} lineHeight={1.2}>{cal.niveau_nom}</Typography>
                  <Typography variant="body2" color="text.secondary">{cal.annee_libelle} — {cal.trimestre_nom}</Typography>
                </Box>
                <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                  <Chip icon={<DateRangeIcon />} variant="outlined" label={plageDates(cal.date_debut, cal.date_fin)}
                    sx={{ fontWeight: 600, height: 34, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
                  <Chip size="small" color={statut.color} label={statut.label} sx={{ fontWeight: 600 }} />
                </Box>
              </Box>

              <CardContent sx={{ pt: 2.5 }}>
                <Box display="flex" alignItems="center" gap={1} mb={2}>
                  <MenuBookIcon color="primary" fontSize="small" />
                  <Typography variant="subtitle1" fontWeight="bold">Jour et heure par matière</Typography>
                  {programmes.length > 0 && <Chip size="small" variant="outlined" label={programmes.length} />}
                </Box>

                {programmes.length === 0 ? (
                  <Alert severity="info" variant="outlined">
                    Les jours et heures par matière ne sont pas encore renseignés.
                  </Alert>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                    {programmes.map((pr) => (
                      <Box key={pr.id} sx={{
                        display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5,
                        border: '1px solid', borderColor: 'divider', borderRadius: 2,
                        transition: 'box-shadow 0.15s', '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
                      }}>
                        <Avatar sx={{ width: 36, height: 36, fontSize: 14, fontWeight: 'bold', bgcolor: avatarColor(pr.matiere_nom) }}>
                          {pr.matiere_nom?.[0]?.toUpperCase()}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={700} variant="body2">{pr.matiere_nom}</Typography>
                          <Typography variant="body2" color={pr.date_examen ? 'text.primary' : 'text.disabled'}
                            sx={{ mt: 0.25, wordBreak: 'break-word' }}>
                            {pr.date_examen
                              ? `${new Date(`${pr.date_examen}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${pr.heure_debut ? ` · ${pr.heure_debut.slice(0, 5)}${pr.heure_fin ? ` – ${pr.heure_fin.slice(0, 5)}` : ''}` : ''}`
                              : 'Pas encore planifié'}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
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
          );
        })
      )}
    </Box>
  );
}
