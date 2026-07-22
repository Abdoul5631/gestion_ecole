import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { evaluationService, noteService, trimestreService, eleveService, parametresService, getResults } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, TextField, MenuItem, Alert, CircularProgress, Divider
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import { ListeNotesPrint } from 'pages/admin/NotesParClasse';

const TYPE_LABELS = { DEVOIR1: 'Devoir 1', DEVOIR2: 'Devoir 2', COMPOSITION: 'Composition', EXAMEN_BLANC: 'Examen Blanc' };

export default function SaisieNotesParClasse() {
  const { classeMatiereId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [classeMatiere, setClasseMatiere] = useState(null);
  const [trimestres, setTrimestres] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [evaluations, setEvaluations] = useState([]);

  const [selectedEvalId, setSelectedEvalId] = useState('');
  const [isNewEval, setIsNewEval] = useState(false);
  const [newEvalForm, setNewEvalForm] = useState({ type: 'DEVOIR1', coefficient: 1, trimestre: '' });

  const [notes, setNotes] = useState({});
  const [ecole, setEcole] = useState({});

  useEffect(() => {
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
    const load = async () => {
      setLoading(true);
      try {
        const resCM = await api.get(`/classe-matieres/${classeMatiereId}/`);
        setClasseMatiere(resCM.data);

        const [resT, resEl, resEv] = await Promise.all([
          trimestreService.getAll(),
          eleveService.getAll(`/eleves/?classe_id=${resCM.data.classe}`),
          evaluationService.getAll(),
        ]);

        setTrimestres(resT.data);
        const { items: elevesItems } = getResults(resEl);
        setEleves(elevesItems);
        setEvaluations(resEv.data.filter(ev => ev.classe_matiere === parseInt(classeMatiereId)));

        const init = {};
        elevesItems.forEach(el => { init[el.id] = ''; });
        setNotes(init);
      } catch {
        setError('Erreur lors du chargement des données.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [classeMatiereId]);

  const handleEvalChange = (e) => {
    const val = e.target.value;
    if (val === 'NEW') {
      setIsNewEval(true);
      setSelectedEvalId('');
    } else {
      setIsNewEval(false);
      setSelectedEvalId(val);
      if (val) {
        evaluationService.getNotes(val).then(res => {
          setNotes(prev => {
            // Initialiser à 0 pour les élèves sans note
            const updated = {};
            Object.keys(prev).forEach(id => { updated[id] = 0; });
            res.data.forEach(n => { if (String(n.eleve) in updated) updated[n.eleve] = n.valeur; });
            return updated;
          });
        });
      }
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      let evalId = selectedEvalId;

      if (isNewEval) {
        if (!newEvalForm.trimestre) throw new Error('Veuillez sélectionner un trimestre.');
        const res = await evaluationService.create({
          classe_matiere: parseInt(classeMatiereId),
          trimestre: parseInt(newEvalForm.trimestre),
          type: newEvalForm.type,
          coefficient: parseFloat(newEvalForm.coefficient),
        });
        evalId = res.data.id;
      }

      const notesToSubmit = Object.entries(notes)
        .filter(([, v]) => v !== '' && v !== null)
        .map(([eleveId, valeur]) => ({ eleve_id: parseInt(eleveId), valeur: parseFloat(valeur) }));

      if (notesToSubmit.length === 0) throw new Error('Aucune note à enregistrer.');

      await noteService.saisieMasse({ evaluation_id: evalId, notes: notesToSubmit });
      setSuccess(`${notesToSubmit.length} note(s) enregistrée(s) !`);
      setIsNewEval(false);
      const resEv = await evaluationService.getAll();
      setEvaluations(resEv.data.filter(ev => ev.classe_matiere === parseInt(classeMatiereId)));
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || err.response?.data?.detail || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const selectedEvalObj = evaluations.find(ev => String(ev.id) === String(selectedEvalId));
  const evalLabel = selectedEvalObj
    ? `${TYPE_LABELS[selectedEvalObj.type] || selectedEvalObj.type} — ${selectedEvalObj.trimestre_nom} (coef ${selectedEvalObj.coefficient})`
    : '';
  const canPrint = eleves.length > 0 && !!selectedEvalId;

  const handlePrintListe = () => {
    const content = document.getElementById('liste-notes-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Liste des Notes</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDFListe = async () => {
    const content = document.getElementById('liste-notes-print');
    if (!content) return;
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'), import('html2canvas')
      ]);
      const canvas = await html2canvas(content, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const imgH = (canvas.height * pageW) / canvas.width;
      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH);
      const nomClasse = (classeMatiere?.classe_nom || 'classe').replace(/\s+/g, '_');
      const nomMatiere = (classeMatiere?.matiere_nom || 'matiere').replace(/\s+/g, '_');
      pdf.save(`liste_notes_${nomClasse}_${nomMatiere}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/enseignant/cours')}>Retour</Button>
        <Box>
          <Typography variant="h4" fontWeight="bold">Saisie des Notes</Typography>
          {classeMatiere && (
            <Typography variant="subtitle1" color="text.secondary">
              {classeMatiere.matiere_nom} — {classeMatiere.classe_nom}
            </Typography>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Évaluation
              </Typography>
              <TextField select fullWidth size="small"
                value={isNewEval ? 'NEW' : selectedEvalId} onChange={handleEvalChange}>
                <MenuItem value=""><em>Sélectionner</em></MenuItem>
                <MenuItem value="NEW"><strong>+ Nouvelle évaluation</strong></MenuItem>
                {evaluations.map(ev => (
                  <MenuItem key={ev.id} value={ev.id}>
                    {ev.type} — {ev.trimestre_nom} (coef {ev.coefficient})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {isNewEval && (
            <Box mt={2} p={2} border="1px dashed #ccc" borderRadius={2}>
              <Typography variant="subtitle2" color="primary" mb={1.5}>Nouvelle Évaluation</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField select fullWidth label="Type" size="small"
                    value={newEvalForm.type}
                    onChange={e => setNewEvalForm({ ...newEvalForm, type: e.target.value })}>
                    <MenuItem value="DEVOIR1">Devoir 1</MenuItem>
                    <MenuItem value="DEVOIR2">Devoir 2</MenuItem>
                    <MenuItem value="COMPOSITION">Composition</MenuItem>
                    {classeMatiere?.niveau_is_classe_examen && <MenuItem value="EXAMEN_BLANC">Examen Blanc</MenuItem>}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField select fullWidth label="Trimestre" size="small"
                    value={newEvalForm.trimestre}
                    onChange={e => setNewEvalForm({ ...newEvalForm, trimestre: e.target.value })}>
                    {trimestres.map(t => <MenuItem key={t.id} value={t.id}>{t.annee_libelle} — {t.nom}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField fullWidth label="Coefficient" type="number" size="small"
                    value={newEvalForm.coefficient}
                    onChange={e => setNewEvalForm({ ...newEvalForm, coefficient: e.target.value })}
                    inputProps={{ min: 0.5, step: 0.5 }} />
                </Grid>
              </Grid>
            </Box>
          )}
        </CardContent>
      </Card>

      {(selectedEvalId || isNewEval) && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
              <Typography variant="h6">{eleves.length} élève(s)</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrintListe}
                  disabled={!canPrint} title={!canPrint ? 'Sélectionnez une évaluation existante d\'abord' : ''}>
                  Imprimer
                </Button>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadPDFListe}
                  disabled={!canPrint} title={!canPrint ? 'Sélectionnez une évaluation existante d\'abord' : ''}>
                  PDF
                </Button>
                <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </Box>
            </Box>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'primary.main' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Nom Prénom</strong></TableCell>
                    <TableCell sx={{ color: 'white', width: 180 }}><strong>Note /20</strong></TableCell>
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
          </CardContent>
        </Card>
      )}

      {canPrint && (
        <Box mt={3}>
          <Typography variant="subtitle2" color="text.secondary" mb={1}>
            Aperçu — Liste des Notes (impression)
          </Typography>
          <ListeNotesPrint
            ecole={ecole}
            classeNom={classeMatiere?.classe_nom}
            matiereNom={classeMatiere?.matiere_nom}
            enseignantNom={classeMatiere?.enseignant_nom}
            evalLabel={evalLabel}
            eleves={eleves}
            notesData={notes}
          />
        </Box>
      )}
    </Box>
  );
}
