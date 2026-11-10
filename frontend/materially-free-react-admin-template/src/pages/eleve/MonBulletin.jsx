import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { idTrimestreParDefaut, trimestresEnCours } from 'utils/anneeDefaut';
import { useEffect, useState } from 'react';
import api, { trimestreService, parametresService, bulletinService } from 'services/api';
import { imprimerBulletin } from 'utils/printBulletin';
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
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { useIsOnline } from 'offline/RequireOnline';

import { estEnLigne } from 'offline/reseau';
export default function MonBulletin() {
  const [trimestres, setTrimestres] = useState([]);
  const [selectedTrimestre, setSelectedTrimestre] = useState('');
  const [bulletinData, setBulletinData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ecole, setEcole] = useState({});
  const role = authService.getRole();
  const online = useIsOnline();

  const [eleveDirectId, setEleveDirectId] = useState(null);
  const { enfants, selectedId: enfantId, selectedEnfant, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  const eleveId = role === 'PARENT' ? enfantId : eleveDirectId;

  useEffect(() => {
    readThrough(CacheKeys.trimestres(), async () => {
      const res = await trimestreService.getAll();
      return res.data;
    }).then((r) => { if (!r.neverCached) setTrimestres(trimestresEnCours(r.data)); });

    readThrough(CacheKeys.parametres(), async () => {
      const res = await parametresService.get();
      return res.data;
    }).then((r) => { if (r.data) setEcole(r.data); }).catch(() => {});

    if (role !== 'PARENT') {
      readThrough(CacheKeys.authMe(), async () => {
        const res = await api.get('/auth/me/');
        return res.data;
      }).then((r) => { if (r.data?.eleve) setEleveDirectId(r.data.eleve); });
    }
  }, [role]);

  useEffect(() => { setBulletinData(null); setSelectedTrimestre(''); }, [enfantId]);
  // Année en cours par défaut (parmi les trimestres ouverts par la direction)
  useEffect(() => {
    if (selectedTrimestre) return;
    const ouverts = (Array.isArray(trimestres) ? trimestres : []).filter(t => t.bulletins_ouverts);
    setSelectedTrimestre(idTrimestreParDefaut(ouverts) || ouverts[0]?.id || '');
  }, [trimestres, selectedTrimestre, enfantId]);

  const fetchBulletin = async () => {
    if (!selectedTrimestre || !eleveId) return;
    setLoading(true);
    setError('');
    setBulletinData(null);
    try {
      const r = await readThrough(
        CacheKeys.bulletin(eleveId, selectedTrimestre),
        async () => {
          const res = await api.get(`/notes/bulletin/?eleve_id=${eleveId}&trimestre_id=${selectedTrimestre}`);
          return res.data;
        },
      );
      if (r.neverCached) setError(NEVER_CACHED_MSG);
      else setBulletinData(r.data);
    } catch (e) {
      setError(e?.response?.data?.code === 'bulletins_fermes' ? 'Le bulletin de ce trimestre n’est pas encore prêt. Vous serez prévenu dès qu’il sera disponible.' : e?.response?.data?.detail || (estEnLigne() ? 'Erreur lors du chargement du bulletin.' : NEVER_CACHED_MSG));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => imprimerBulletin('bulletin-print', 'Bulletin de notes');

  // Seuls les trimestres dont la direction a ouvert les bulletins sont proposés
  const trimestresOuverts = (Array.isArray(trimestres) ? trimestres : []).filter(t => t.bulletins_ouverts);

  const handleDownloadPDF = async () => {
    if (!online) {
      setError('Connexion requise pour télécharger le PDF.');
      return;
    }
    if (!eleveId || !selectedTrimestre) return;
    const nom = selectedEnfant ? `${selectedEnfant.nom}_${selectedEnfant.prenom}` : 'bulletin';
    try {
      await bulletinService.telechargerPdf(eleveId, selectedTrimestre, `bulletin_${nom}.pdf`);
    } catch {
      setError('Impossible de télécharger le bulletin PDF.');
    }
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
            <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={handleDownloadPDF} disabled={!online}>
              PDF
            </Button>
          </Box>
        )}
      </Box>

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={enfantId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}

      {role === 'PARENT' && enfants.length === 0 && !loadingEnfants && (
        <Alert severity="warning" sx={{ mb: 2 }}>Aucun enfant lié à votre compte. Contactez l&apos;administration.</Alert>
      )}

      {trimestres.length > 0 && trimestresOuverts.length === 0 && (
        <Card sx={{ mb: 3, textAlign: 'center', border: '1px dashed', borderColor: 'divider', boxShadow: 'none' }}>
          <CardContent sx={{ py: 6 }}>
            <HourglassEmptyIcon sx={{ fontSize: 52, color: 'text.disabled' }} />
            <Typography variant="h5" fontWeight={800} mt={1.5}>
              {role === 'PARENT' ? 'Le bulletin n’est pas encore prêt' : 'Ton bulletin n’est pas encore prêt'}
            </Typography>
            <Typography color="text.secondary" mt={1} sx={{ maxWidth: 520, mx: 'auto', lineHeight: 1.7 }}>
              L’école publie les bulletins à la fin du trimestre, une fois toutes les notes saisies et vérifiées.
              Vous recevrez un message dès qu’il sera disponible.
            </Typography>
          </CardContent>
        </Card>
      )}

      {!(trimestres.length > 0 && trimestresOuverts.length === 0) && (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="flex-end">
            <Grid size={{ xs: 12, md: 9 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Trimestre</Typography>
              <TextField select fullWidth size="small" value={selectedTrimestre}
                onChange={e => { setSelectedTrimestre(e.target.value); setBulletinData(null); }}>
                <MenuItem value=""><em>Choisir un trimestre</em></MenuItem>
                {(Array.isArray(trimestres) ? trimestres : [])
                  .filter(t => t.bulletins_ouverts || t.annee_libelle === trimestresOuverts[0]?.annee_libelle)
                  .map(t => (
                    <MenuItem key={t.id} value={t.id} disabled={!t.bulletins_ouverts}>
                      {t.annee_libelle} — {t.nom}{t.bulletins_ouverts ? '' : ' (pas encore prêt)'}
                    </MenuItem>
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
      )}

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>}

      {bulletinData && !loading && (
        !bulletinData.disciplines?.length
          ? <Alert severity="info">Aucune note enregistrée pour ce trimestre.</Alert>
          : <BulletinPrint data={bulletinData} ecole={ecole} />
      )}
    </Box>
  );
}
