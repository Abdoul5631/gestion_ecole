import { idTrimestreParDefaut, trimestresEnCours } from 'utils/anneeDefaut';
import { useEffect, useState } from 'react';
import api, { trimestreService, parametresService } from 'services/api';
import {
  Box, Card, CardContent, Typography, CircularProgress,
  MenuItem, TextField, Alert, Button, Grid, Chip
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { BulletinExamenBlancPrint } from 'pages/admin/BulletinExamenBlanc';

const STATUT_LABELS = { ADMIS: 'Admis', DEUXIEME_TOUR: 'Second Tour', AJOURNE: 'Ajourné' };
const STATUT_COLORS = { ADMIS: 'success', DEUXIEME_TOUR: 'warning', AJOURNE: 'error' };

export default function MonBulletinExamenBlanc() {
  const [trimestres, setTrimestres] = useState([]);
  const [selectedTrimestre, setSelectedTrimestre] = useState('');
  const [bulletinData, setBulletinData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});
  const [monResultat, setMonResultat] = useState(null);
  const role = authService.getRole();

  const [eleveDirectId, setEleveDirectId] = useState(null);
  const { enfants, selectedId: enfantId, selectedEnfant, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  const eleveId = role === 'PARENT' ? enfantId : eleveDirectId;

  useEffect(() => {
    trimestreService.getAll().then(res => { setTrimestres(trimestresEnCours(res.data)); setSelectedTrimestre(prev => prev || idTrimestreParDefaut(res.data)); });
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
    if (role !== 'PARENT') {
      api.get('/auth/me/').then(res => { if (res.data.eleve) setEleveDirectId(res.data.eleve); });
    }
  }, []);

  useEffect(() => { setBulletinData(null); setMonResultat(null); setSelectedTrimestre(idTrimestreParDefaut(trimestres)); }, [enfantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBulletin = async () => {
    if (!selectedTrimestre || !eleveId) return;
    setLoading(true);
    setError('');
    setBulletinData(null);
    setMonResultat(null);
    try {
      const res = await api.get(`/notes/bulletin-examen-blanc/?eleve_id=${eleveId}&trimestre_id=${selectedTrimestre}`);
      setBulletinData(res.data);
      if (res.data.deliberated) {
        const resC = await api.get(`/notes/classement-examen-blanc/?niveau_id=${res.data.niveau_id}&trimestre_id=${selectedTrimestre}`);
        setMonResultat(resC.data.classement?.[0] || null);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Cet élève n'est pas dans une classe d'examen (3ème/Terminale).");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const content = document.getElementById('bulletin-eb-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Bulletin Examen Blanc</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDF = async () => {
    const content = document.getElementById('bulletin-eb-print');
    if (!content) return;
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import('jspdf'), import('html2canvas')
    ]);
    const canvas = await html2canvas(content, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const imgH = (canvas.height * pageW) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, imgH);
    const nom = selectedEnfant ? `${selectedEnfant.nom}_${selectedEnfant.prenom}` : 'bulletin';
    pdf.save(`bulletin_examen_blanc_${nom}.pdf`);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.5}>
          <WorkspacePremiumIcon color="warning" sx={{ fontSize: 30 }} />
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            {role === 'PARENT' ? "Examen Blanc de mes enfants" : 'Mon Examen Blanc'}
          </Typography>
        </Box>
        {bulletinData && (
          <Box display="flex" gap={1}>
            <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>Imprimer</Button>
            <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadPDF}>PDF</Button>
          </Box>
        )}
      </Box>

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={enfantId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {role === 'PARENT' && enfants.length === 0 && !loadingEnfants && (
        <Alert severity="warning" sx={{ mb: 2 }}>Aucun enfant lié à votre compte. Contactez l'administration.</Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={{ xs: 12, md: 9 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Trimestre</Typography>
              <TextField select fullWidth size="small" value={selectedTrimestre}
                onChange={e => { setSelectedTrimestre(e.target.value); setBulletinData(null); setMonResultat(null); }}>
                <MenuItem value=""><em>Choisir un trimestre</em></MenuItem>
                {trimestres.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.annee_libelle} — {t.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Button variant="contained" fullWidth onClick={fetchBulletin}
                disabled={!selectedTrimestre || !eleveId || loading}>
                {loading ? <CircularProgress size={20} color="inherit" /> : 'Afficher'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {error && <Alert severity="info" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>}

      {bulletinData && !loading && (
        <>
          {monResultat && (
            <Alert severity={monResultat.statut === 'AJOURNE' ? 'error' : 'success'} sx={{ mb: 2 }}
              icon={<WorkspacePremiumIcon />}>
              <strong>Résultat après délibération :</strong> Moyenne {monResultat.moyenne_generale}/20 —
              Rang {monResultat.rang}/{bulletinData.nb_eleves} —{' '}
              <Chip size="small" color={STATUT_COLORS[monResultat.statut]} label={STATUT_LABELS[monResultat.statut]} />
            </Alert>
          )}
          {!monResultat && (
            <Alert severity="info" sx={{ mb: 2 }}>
              La délibération n'a pas encore eu lieu — le classement (admis / second tour / ajourné) n'est pas encore disponible.
            </Alert>
          )}
          {bulletinData.disciplines.length === 0
            ? <Alert severity="info">Aucune note d'Examen Blanc enregistrée pour ce trimestre.</Alert>
            : <BulletinExamenBlancPrint data={bulletinData} ecole={ecole} />}
        </>
      )}
    </Box>
  );
}
