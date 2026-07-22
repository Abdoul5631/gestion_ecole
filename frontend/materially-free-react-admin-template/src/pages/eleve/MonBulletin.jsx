import { useEffect, useState } from 'react';
import api, { trimestreService, parametresService } from 'services/api';
import {
  Box, Card, CardContent, Typography, CircularProgress,
  MenuItem, TextField, Alert, Button, Grid
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { BulletinPrint } from 'pages/bulletin/Bulletin';

export default function MonBulletin() {
  const [trimestres, setTrimestres] = useState([]);
  const [selectedTrimestre, setSelectedTrimestre] = useState('');
  const [bulletinData, setBulletinData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});
  const role = authService.getRole();

  // Pour les élèves → ID direct depuis me(). Pour les parents → hook enfants.
  const [eleveDirectId, setEleveDirectId] = useState(null);
  const { enfants, selectedId: enfantId, selectedEnfant, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  const eleveId = role === 'PARENT' ? enfantId : eleveDirectId;

  useEffect(() => {
    trimestreService.getAll().then(res => setTrimestres(res.data));
    parametresService.get().then(res => setEcole(res.data)).catch(() => {});
    if (role !== 'PARENT') {
      api.get('/auth/me/').then(res => { if (res.data.eleve) setEleveDirectId(res.data.eleve); });
    }
  }, []);

  // Réinitialise le bulletin quand l'enfant change
  useEffect(() => { setBulletinData(null); setSelectedTrimestre(''); }, [enfantId]);

  const fetchBulletin = () => {
    if (!selectedTrimestre || !eleveId) return;
    setLoading(true);
    setError('');
    setBulletinData(null);
    api.get(`/notes/bulletin/?eleve_id=${eleveId}&trimestre_id=${selectedTrimestre}`)
      .then(res => setBulletinData(res.data))
      .catch(() => setError('Erreur lors du chargement du bulletin.'))
      .finally(() => setLoading(false));
  };

  const handlePrint = () => {
    const content = document.getElementById('bulletin-print');
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Bulletin</title>
      <style>body{margin:0;font-family:Arial,sans-serif;}</style>
      </head><body>${content.outerHTML}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  const handleDownloadPDF = async () => {
    const content = document.getElementById('bulletin-print');
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
    pdf.save(`bulletin_${nom}.pdf`);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          {role === 'PARENT' ? 'Bulletin de mes enfants' : 'Mon Bulletin de Notes'}
        </Typography>
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
                onChange={e => { setSelectedTrimestre(e.target.value); setBulletinData(null); }}>
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>}

      {bulletinData && !loading && (
        bulletinData.disciplines.length === 0
          ? <Alert severity="info">Aucune note enregistrée pour ce trimestre.</Alert>
          : <BulletinPrint data={bulletinData} ecole={ecole} />
      )}
    </Box>
  );
}
