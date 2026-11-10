import { idTrimestreParDefaut, trimestresEnCours } from 'utils/anneeDefaut';
import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, MenuItem, CircularProgress, Alert, Chip
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import {
  classeMatiereService, evaluationService, noteService,
  eleveService, trimestreService, classeService, parametresService, getResults
} from 'services/api';
import { peutSaisir } from 'utils/droits';

const TYPE_LABELS = { DEVOIR1: 'Devoir 1', DEVOIR2: 'Devoir 2', COMPOSITION: 'Composition', EXAMEN_BLANC: 'Examen Blanc' };

// ─── Liste imprimable des notes d'une évaluation (exportée pour réutilisation) ─
export function ListeNotesPrint({ ecole = {}, classeNom, matiereNom, enseignantNom, evalLabel, eleves, notesData }) {
  const rows = eleves.map(e => ({ ...e, note: notesData[e.id] }));
  const valeurs = rows
    .map(r => parseFloat(r.note))
    .filter(v => !isNaN(v));
  const moyenne = valeurs.length ? (valeurs.reduce((a, b) => a + b, 0) / valeurs.length).toFixed(2) : '—';
  const noteMax = valeurs.length ? Math.max(...valeurs).toFixed(2) : '—';
  const noteMin = valeurs.length ? Math.min(...valeurs).toFixed(2) : '—';

  const tdStyle = { border: '1px solid #333', padding: '3px 6px', fontSize: '12px', textAlign: 'center' };
  const thStyle = { ...tdStyle, background: '#f0f0f0', fontWeight: 'bold' };
  const leftTd = { ...tdStyle, textAlign: 'left' };

  return (
    <Box id="liste-notes-print" sx={{
      fontFamily: 'Arial, sans-serif', p: 2, maxWidth: '700px', margin: '0 auto',
      border: '1px solid #ccc', bgcolor: 'white',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'top', fontSize: '12px' }}>
              <div style={{ fontWeight: 'bold' }}>{ecole.nom_ecole || 'Établissement'}</div>
              {ecole.ville && <div>{ecole.ville}</div>}
            </td>
            <td style={{ width: '50%', textAlign: 'right', verticalAlign: 'top' }}>
              {ecole.logo_url && (
                <img src={ecole.logo_url} alt="Logo"
                  style={{ width: 48, height: 48, objectFit: 'contain' }} />
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold',
        textTransform: 'uppercase', border: '2px solid #333',
        padding: '6px', marginBottom: '8px', letterSpacing: '1px' }}>
        Liste des Notes
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td><strong>Classe :</strong> {classeNom}</td>
            <td><strong>Matière :</strong> {matiereNom}</td>
          </tr>
          <tr>
            <td><strong>Enseignant :</strong> {enseignantNom || '—'}</td>
            <td><strong>Évaluation :</strong> {evalLabel}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '8%' }}>N°</th>
            <th style={{ ...thStyle, width: '22%' }}>Matricule</th>
            <th style={{ ...thStyle, textAlign: 'left', width: '50%' }}>Nom Prénom</th>
            <th style={{ ...thStyle, width: '20%' }}>Note/20</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}>{r.matricule}</td>
              <td style={leftTd}>{r.nom} {r.prenom}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold' }}>
                {r.note === '' || r.note === null || r.note === undefined ? '—' : r.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <tbody>
          <tr>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>Moyenne : {moyenne}</td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>Note Max : {noteMax}</td>
            <td style={{ ...tdStyle, fontWeight: 'bold' }}>Note Min : {noteMin}</td>
          </tr>
        </tbody>
      </table>
    </Box>
  );
}

export default function NotesParClasse() {
  const saisie = peutSaisir('pedagogie'); // le directeur consulte, l'enseignant saisit
  const [classes, setClasses] = useState([]);
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [trimestres, setTrimestres] = useState([]);

  const [selectedClasse, setSelectedClasse] = useState('');
  const [selectedCM, setSelectedCM] = useState('');
  const [selectedEvalId, setSelectedEvalId] = useState('');
  const [isNewEval, setIsNewEval] = useState(false);

  const [evaluations, setEvaluations] = useState([]);
  const [evalsClasse, setEvalsClasse] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [notesData, setNotesData] = useState({});

  const [newEvalForm, setNewEvalForm] = useState({ type: 'DEVOIR1', coefficient: 1, trimestre: '' });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});

  useEffect(() => {
    Promise.all([
      classeMatiereService.getAll(),
      classeService.getAll(),
      trimestreService.getAll()
    ]).then(([resCM, resC, resT]) => {
      setClasseMatieres(resCM.data);
      setClasses(resC.data);
      setTrimestres(trimestresEnCours(resT.data));
      setNewEvalForm(f => ({ ...f, trimestre: f.trimestre || idTrimestreParDefaut(resT.data) }));
    });
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
  }, []);

  const filteredCMs = selectedClasse
    ? classeMatieres.filter(cm => String(cm.classe) === String(selectedClasse))
    : [];

  const isClasseExamen = !!classes.find(c => String(c.id) === String(selectedClasse))?.niveau_is_classe_examen;

  // Évaluations de la classe choisie (toutes matières) : proposées directement, sans choisir matière puis évaluation
  const chargerDevoirsClasse = async (classeId) => {
    if (!classeId) { setEvalsClasse([]); return; }
    try {
      const ids = new Set(classeMatieres.filter(cm => String(cm.classe) === String(classeId)).map(cm => cm.id));
      const res = await evaluationService.getAll();
      const liste = (Array.isArray(res.data) ? res.data : res.data.results || []).filter(ev => ids.has(ev.classe_matiere));
      liste.sort((a, b) => String(a.trimestre_nom).localeCompare(String(b.trimestre_nom)) || String(a.matiere_nom).localeCompare(String(b.matiere_nom)));
      setEvalsClasse(liste);
    } catch { setEvalsClasse([]); }
  };

  const handleClasseChange = (e) => {
    setSelectedClasse(e.target.value);
    setSelectedCM('');
    setSelectedEvalId('');
    setIsNewEval(false);
    setEvaluations([]);
    setEleves([]);
    setNotesData({});
    chargerDevoirsClasse(e.target.value);
  };

  // Clic sur un devoir déjà programmé : la matière, l'évaluation et les notes se remplissent toutes seules
  const ouvrirDevoir = async (ev) => {
    setError(''); setSuccess('');
    setSelectedCM(ev.classe_matiere);
    setEvaluations(evalsClasse.filter(x => x.classe_matiere === ev.classe_matiere));
    setSelectedEvalId(ev.id);
    setIsNewEval(false);
    setLoading(true);
    try {
      let liste = eleves;
      if (!liste.length) {
        const resEl = await eleveService.getAll(`/eleves/?classe_id=${selectedClasse}`);
        liste = getResults(resEl).items;
        setEleves(liste);
      }
      const init = {};
      liste.forEach(el => { init[el.id] = 0; });
      const res = await evaluationService.getNotes(ev.id);
      res.data.forEach(n => { if (init[n.eleve] !== undefined) init[n.eleve] = n.valeur; });
      setNotesData(init);
    } catch {
      setError('Erreur lors du chargement des notes.');
    } finally {
      setLoading(false);
    }
  };

  const handleCMChange = async (e) => {
    const cmId = e.target.value;
    const classeId = selectedClasse; // capture locale pour éviter la stale closure

    setSelectedCM(cmId);
    setSelectedEvalId('');
    setIsNewEval(false);
    setEvaluations([]);
    setEleves([]);
    setNotesData({});

    if (!cmId) return;

    setLoading(true);
    try {
      const [resEv, resEl] = await Promise.all([
        evaluationService.getAll(),
        eleveService.getAll(`/eleves/?classe_id=${classeId}`)
      ]);
      const cmEvals = resEv.data.filter(ev => ev.classe_matiere === parseInt(cmId));
      setEvaluations(cmEvals);
      const { items: elevesItems } = getResults(resEl);
      setEleves(elevesItems);
      const init = {};
      elevesItems.forEach(el => { init[el.id] = ''; });
      setNotesData(init);
    } catch {
      setError('Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  };

  const handleEvalChange = async (e) => {
    const val = e.target.value;

    // Snapshot courant des élèves — évite toute dépendance à l'état async
    const initFromEleves = () => {
      const init = {};
      eleves.forEach(el => { init[el.id] = ''; });
      return init;
    };

    if (val === 'NEW') {
      setIsNewEval(true);
      setSelectedEvalId('');
      setNotesData(initFromEleves());
      return;
    }

    setIsNewEval(false);
    setSelectedEvalId(val);

    if (!val) {
      setNotesData(initFromEleves());
      return;
    }

    // Initialise à 0 pour les élèves sans note (évaluation existante)
    const init = {};
    eleves.forEach(el => { init[el.id] = 0; });
    setLoading(true);
    try {
      const res = await evaluationService.getNotes(val);
      res.data.forEach(n => {
        if (init[n.eleve] !== undefined) init[n.eleve] = n.valeur;
      });
      setNotesData(init);
    } catch {
      setError('Erreur lors du chargement des notes existantes.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      let evalId = selectedEvalId;

      if (isNewEval) {
        if (!newEvalForm.trimestre) throw new Error('Veuillez sélectionner un trimestre.');
        const res = await evaluationService.create({
          classe_matiere: parseInt(selectedCM),
          trimestre: parseInt(newEvalForm.trimestre),
          type: newEvalForm.type,
          coefficient: parseFloat(newEvalForm.coefficient)
        });
        evalId = res.data.id;
        setSelectedEvalId(evalId);
        setIsNewEval(false);
        const evRes = await evaluationService.getAll();
        setEvaluations(evRes.data.filter(ev => ev.classe_matiere === parseInt(selectedCM)));
        chargerDevoirsClasse(selectedClasse);
      }

      const notes = Object.entries(notesData)
        .filter(([, val]) => val !== '' && val !== null && val !== undefined)
        .map(([eleveId, valeur]) => ({ eleve_id: parseInt(eleveId), valeur: parseFloat(valeur) }));

      if (notes.length === 0) { setSaving(false); setSuccess('Aucune note à enregistrer.'); return; }

      await noteService.saisieMasse({ evaluation_id: evalId, notes });
      setSuccess(`${notes.length} note(s) enregistrée(s) !`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message || err.response?.data?.detail || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const canShowNotes = selectedCM && eleves.length > 0;
  const canSave = (selectedEvalId || isNewEval) && eleves.length > 0;

  const selectedCMObj = classeMatieres.find(cm => String(cm.id) === String(selectedCM));
  const selectedClasseObj = classes.find(c => String(c.id) === String(selectedClasse));
  const selectedEvalObj = evaluations.find(ev => String(ev.id) === String(selectedEvalId));
  const evalLabel = selectedEvalObj
    ? `${TYPE_LABELS[selectedEvalObj.type] || selectedEvalObj.type} — ${selectedEvalObj.trimestre_nom} (coef ${selectedEvalObj.coefficient})`
    : '';
  const canPrint = canShowNotes && !!selectedEvalId;

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
      const nomClasse = (selectedClasseObj?.nom || 'classe').replace(/\s+/g, '_');
      const nomMatiere = (selectedCMObj?.matiere_nom || 'matiere').replace(/\s+/g, '_');
      pdf.save(`liste_notes_${nomClasse}_${nomMatiere}.pdf`);
    } catch (e) {
      console.error('Erreur PDF:', e);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Saisie des Notes par Classe</Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>1. Classe</Typography>
              <TextField select fullWidth size="small" value={selectedClasse} onChange={handleClasseChange}>
                <MenuItem value=""><em>Sélectionner une classe</em></MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>2. Matière</Typography>
              <TextField select fullWidth size="small" value={selectedCM} onChange={handleCMChange}
                disabled={!selectedClasse}>
                <MenuItem value=""><em>Sélectionner une matière</em></MenuItem>
                {filteredCMs.map(cm => (
                  <MenuItem key={cm.id} value={cm.id}>
                    {cm.matiere_nom}{cm.enseignant_nom ? ` (${cm.enseignant_nom})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>3. Évaluation</Typography>
              <TextField select fullWidth size="small"
                value={isNewEval ? 'NEW' : selectedEvalId} onChange={handleEvalChange}
                disabled={!selectedCM}>
                <MenuItem value=""><em>Sélectionner</em></MenuItem>
                {saisie && <MenuItem value="NEW"><strong>+ Nouvelle évaluation</strong></MenuItem>}
                {evaluations.map(ev => (
                  <MenuItem key={ev.id} value={ev.id}>
                    {ev.type} — {ev.trimestre_nom} (coef {ev.coefficient})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          {selectedClasse && (
            <Box mt={3}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Devoirs et évaluations déjà programmés dans cette classe — cliquez pour ouvrir les notes
              </Typography>
              {evalsClasse.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Aucun devoir programmé pour l&apos;instant.{saisie ? ' Choisissez une matière puis « + Nouvelle évaluation » pour en programmer un.' : ''}
                </Typography>
              ) : (
                <Box display="flex" gap={1} flexWrap="wrap">
                  {evalsClasse.map(ev => (
                    <Chip key={ev.id} clickable onClick={() => ouvrirDevoir(ev)}
                      color={String(ev.id) === String(selectedEvalId) ? 'primary' : 'default'}
                      variant={String(ev.id) === String(selectedEvalId) ? 'filled' : 'outlined'}
                      label={`${ev.matiere_nom} — ${TYPE_LABELS[ev.type] || ev.type} — ${ev.trimestre_nom}`} />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {isNewEval && (
            <Box mt={3} p={2} border="1px dashed #ccc" borderRadius={2}>
              <Typography variant="subtitle2" mb={2} color="primary">Nouvelle Évaluation</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField select fullWidth label="Type" size="small"
                    value={newEvalForm.type}
                    onChange={e => setNewEvalForm({ ...newEvalForm, type: e.target.value })}>
                    {[['DEVOIR1', 'Devoir 1'], ['DEVOIR2', 'Devoir 2']].map(([k, v]) => {
                      const deja = evaluations.some(ev => ev.type === k && String(ev.trimestre) === String(newEvalForm.trimestre));
                      return <MenuItem key={k} value={k} disabled={deja}>{v}{deja ? ' — déjà programmé' : ''}</MenuItem>;
                    })}
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

      {canShowNotes && (
        <Card>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
              <Typography variant="h6">4. Notes — {eleves.length} élève(s)</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrintListe}
                  disabled={!canPrint} title={!canPrint ? 'Sélectionnez une évaluation existante d\'abord' : ''}>
                  Imprimer
                </Button>
                <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadPDFListe}
                  disabled={!canPrint} title={!canPrint ? 'Sélectionnez une évaluation existante d\'abord' : ''}>
                  PDF
                </Button>
                {saisie && <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={handleSave}
                  disabled={saving || !canSave}
                  title={!canSave ? 'Sélectionnez une évaluation d\'abord' : ''}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>}
              </Box>
            </Box>
            {saisie && !canSave && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Sélectionnez une évaluation (étape 3) pour pouvoir saisir et enregistrer les notes.
              </Alert>
            )}

            {loading ? (
              <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
            ) : (
              <TableContainer component={Paper} elevation={0} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'primary.main' }}>
                    <TableRow>
                      <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                      <TableCell sx={{ color: 'white' }}><strong>Nom Prénom</strong></TableCell>
                      <TableCell sx={{ color: 'white', width: '200px' }}><strong>Note</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {eleves.map(eleve => (
                      <TableRow key={eleve.id} hover>
                        <TableCell>{eleve.matricule}</TableCell>
                        <TableCell>{eleve.nom} {eleve.prenom}</TableCell>
                        <TableCell>
                          <TextField
                            type="number" size="small" fullWidth
                            value={notesData[eleve.id] ?? ''}
                            onChange={e => setNotesData(prev => ({ ...prev, [eleve.id]: e.target.value }))}
                            inputProps={{ step: 0.25, min: 0, max: 20, readOnly: !saisie }}
                            placeholder="—"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
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
            classeNom={selectedClasseObj?.nom}
            matiereNom={selectedCMObj?.matiere_nom}
            enseignantNom={selectedCMObj?.enseignant_nom}
            evalLabel={evalLabel}
            eleves={eleves}
            notesData={notesData}
          />
        </Box>
      )}
    </Box>
  );
}
