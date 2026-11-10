import { useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, InputAdornment, TextField, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonIcon from '@mui/icons-material/Person';
import api, { eleveService, getResults } from 'services/api';
import { useIsOnline } from 'offline/RequireOnline';

const nomEleve = (e) => `${e.prenom || ''} ${e.nom || ''}`.trim();

export default function DuplicataBulletin() {
  const online = useIsOnline();
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState([]);
  const [cherche, setCherche] = useState(false);
  const [eleve, setEleve] = useState(null);
  const [annees, setAnnees] = useState([]);
  const [charge, setCharge] = useState(false);
  const [enCours, setEnCours] = useState(''); // trimestre dont le PDF se prépare
  const [erreur, setErreur] = useState('');

  // recherche 400 ms après la dernière frappe ; élèves actifs ET anciens (suspendus, sortis)
  useEffect(() => {
    const q = recherche.trim();
    if (q.length < 2) { setResultats([]); return undefined; }
    const t = setTimeout(async () => {
      setCherche(true);
      try {
        const res = await eleveService.getAll(`/eleves/?search=${encodeURIComponent(q)}&inclure_suspendus=1&tous=1&page_size=20`);
        setResultats(getResults(res).items);
      } catch {
        setErreur('Recherche impossible. Vérifiez la connexion.');
      } finally {
        setCherche(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [recherche]);

  const choisir = async (e) => {
    setEleve(e); setAnnees([]); setErreur(''); setCharge(true);
    try {
      const res = await api.get(`/notes/historique-bulletins/?eleve_id=${e.id}`);
      setAnnees(res.data.annees || []);
    } catch {
      setErreur("Impossible de charger l'historique de cet élève.");
    } finally {
      setCharge(false);
    }
  };

  const pdf = async (t, annee, telecharger) => {
    setEnCours(t.id); setErreur('');
    try {
      const res = await api.get(`/notes/duplicata-bulletin/?eleve_id=${eleve.id}&trimestre_id=${t.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      if (telecharger) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `duplicata_bulletin_${eleve.nom}_${eleve.prenom}_${t.nom.replace(/\s+/g, '_')}_${annee}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      setErreur(err?.response?.status === 403
        ? "Vous n'avez pas le droit de délivrer ce duplicata."
        : 'Impossible de générer le duplicata. Vérifiez la connexion et réessayez.');
    } finally {
      setEnCours('');
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
        <Avatar variant="rounded" sx={{ bgcolor: 'primary.lighter', color: 'primary.main', width: 44, height: 44, borderRadius: 2 }}><FileCopyIcon /></Avatar>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Duplicata de bulletin</Typography>
          <Typography variant="body2" color="text.secondary">
            Retrouvez le bulletin d&apos;un élève, de cette année ou d&apos;une année passée, et téléchargez-le avec la mention « DUPLICATA ».
          </Typography>
        </Box>
      </Box>

      {!online && <Alert severity="warning" sx={{ mb: 2 }}>Connexion requise pour chercher un élève et générer un duplicata.</Alert>}
      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}

      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, alignItems: 'start' }}>
        {/* ── 1. Trouver l'élève ── */}
        <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography fontWeight={800} mb={1.25}>1. Chercher l&apos;élève</Typography>
            <TextField fullWidth size="small" autoFocus placeholder="Nom, prénom ou matricule…" value={recherche}
              onChange={(e) => setRecherche(e.target.value)} disabled={!online}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
            <Typography variant="caption" color="text.secondary" display="block" mt={0.75}>
              Les anciens élèves (suspendus ou partis) sont inclus.
            </Typography>
            <Box mt={1.5}>
              {cherche && <Box display="flex" justifyContent="center" py={2}><CircularProgress size={22} /></Box>}
              {!cherche && recherche.trim().length >= 2 && resultats.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>Aucun élève trouvé.</Typography>
              )}
              {resultats.map((e) => {
                const actif = eleve?.id === e.id;
                return (
                  <Box key={e.id} onClick={() => choisir(e)} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, p: 1, mb: 0.5, borderRadius: 2, cursor: 'pointer',
                    bgcolor: actif ? 'primary.lighter' : 'transparent', '&:hover': { bgcolor: actif ? 'primary.lighter' : 'action.hover' },
                  }}>
                    <Avatar sx={{ width: 36, height: 36, fontSize: 13, bgcolor: e.sexe === 'F' ? '#fce7f0' : 'primary.lighter', color: e.sexe === 'F' ? '#be185d' : 'primary.dark', fontWeight: 700 }}>
                      {`${e.prenom?.[0] || ''}${e.nom?.[0] || ''}`.toUpperCase() || <PersonIcon fontSize="small" />}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={700} fontSize={14.5} noWrap>{nomEleve(e)}</Typography>
                      <Typography variant="caption" color="text.secondary">{e.matricule}{e.classe_actuelle ? ` · ${e.classe_actuelle}` : ''}</Typography>
                    </Box>
                    {!e.is_active && <Chip size="small" label="Ancien" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 700 }} />}
                  </Box>
                );
              })}
            </Box>
          </CardContent>
        </Card>

        {/* ── 2. Choisir le bulletin ── */}
        <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography fontWeight={800} mb={1.25}>2. Choisir le bulletin{eleve ? ` de ${nomEleve(eleve)}` : ''}</Typography>
            {!eleve && <Typography color="text.secondary" sx={{ py: 3 }}>Choisissez d&apos;abord un élève dans la liste.</Typography>}
            {eleve && charge && <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>}
            {eleve && !charge && annees.length === 0 && (
              <Alert severity="info">Cet élève n&apos;a aucune inscription enregistrée : il n&apos;y a pas de bulletin à dupliquer.</Alert>
            )}
            {annees.map((an) => (
              <Box key={an.annee_id} sx={{ mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1.25, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography fontWeight={800}>{an.annee}</Typography>
                  {an.classe && <Chip size="small" label={an.classe} sx={{ bgcolor: 'primary.lighter', color: 'primary.dark', fontWeight: 700 }} />}
                  {an.en_cours && <Chip size="small" label="Année en cours" variant="outlined" color="success" />}
                </Box>
                {an.trimestres.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Aucun trimestre enregistré cette année-là.</Typography>}
                {an.trimestres.map((t) => (
                  <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.1, borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1, minWidth: 140 }}>
                      <Typography fontWeight={600}>{t.nom}</Typography>
                      <Typography variant="caption" sx={{ color: t.a_des_notes ? 'success.dark' : 'text.disabled' }}>
                        {t.a_des_notes ? 'Notes enregistrées' : 'Aucune note'}
                      </Typography>
                    </Box>
                    <Button size="small" startIcon={<VisibilityIcon />} disabled={!online || !t.a_des_notes || enCours === t.id}
                      onClick={() => pdf(t, an.annee, false)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                      Voir
                    </Button>
                    <Button size="small" variant="contained" disableElevation disabled={!online || !t.a_des_notes || enCours === t.id}
                      startIcon={enCours === t.id ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
                      onClick={() => pdf(t, an.annee, true)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                      Télécharger le duplicata
                    </Button>
                  </Box>
                ))}
              </Box>
            ))}
            {eleve && !charge && annees.length > 0 && (
              <Typography variant="caption" color="text.secondary" display="block">
                Chaque duplicata porte la mention « DUPLICATA », la date et votre nom. Il est enregistré dans l&apos;historique des actions.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
