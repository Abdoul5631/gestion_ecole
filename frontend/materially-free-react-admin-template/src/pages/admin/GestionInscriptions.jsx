import { useEffect, useState } from 'react';
import { inscriptionService, eleveService, classeService, niveauService, anneeService, getResults } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Tooltip, CircularProgress, InputAdornment, Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import useIsMobile from 'hooks/useIsMobile';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';

import { estEnLigne } from 'offline/reseau';
import { peutSaisir } from 'utils/droits';
import authService from 'services/auth';
export default function GestionInscriptions() {
  const saisie = peutSaisir('secretariat');
  // mettre en classe, changer de classe, retirer / réintégrer : secrétaire et directeur
  const peutAffecter = saisie || authService.getRole() === 'ADMIN';
  const [inscriptions, setInscriptions] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filterNiveau, setFilterNiveau] = useState('');

  const [form, setForm] = useState({ eleve: '', classe: '', annee_scolaire: '' });
  const [annees, setAnnees] = useState([]);
  const [anneeActive, setAnneeActive] = useState(null);
  const [filterAnnee, setFilterAnnee] = useState('');
  const [filterActif, setFilterActif] = useState('all');
  const isMobile = useIsMobile();


  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = filterAnnee ? `?annee_id=${filterAnnee}&inclure_suspendus=1` : '?inclure_suspendus=1';
      const result = await readThrough(CacheKeys.inscriptions(params), async () => {
        const [resI, resE, resC, resN, resA, resAct] = await Promise.all([
          inscriptionService.getAll(params),
          eleveService.getAll('/eleves/?tous=1&page_size=500'),
          classeService.getAll(),
          niveauService.getAll(),
          anneeService.getAll(),
          anneeService.getActive(),
        ]);
        return {
          inscriptions: Array.isArray(resI.data) ? resI.data : resI.data.results ?? [],
          eleves: getResults(resE).items,
          classes: Array.isArray(resC.data) ? resC.data : resC.data.results ?? [],
          niveaux: Array.isArray(resN.data) ? resN.data : resN.data.results ?? [],
          annees: Array.isArray(resA.data) ? resA.data : resA.data.results ?? [],
          anneeActive: resAct.data,
        };
      });
      if (result.neverCached) {
        setError(NEVER_CACHED_MSG);
        setInscriptions([]);
      } else {
        const d = result.data || {};
        setInscriptions(d.inscriptions || []);
        setEleves(d.eleves || []);
        setClasses(d.classes || []);
        setNiveaux(d.niveaux || []);
        setAnnees(d.annees || []);
        setAnneeActive(d.anneeActive);
        if (!filterAnnee && d.anneeActive?.id) setFilterAnnee(d.anneeActive.id);
      }
    } catch {
      setError(estEnLigne() ? 'Erreur lors du chargement des données' : NEVER_CACHED_MSG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [filterAnnee]);

  const classesFiltrees = filterNiveau
    ? classes.filter(c => String(c.niveau) === String(filterNiveau))
    : classes;

  // L'élève choisi a-t-il déjà une classe pour l'année affichée ? Alors on le déplace au lieu de le réinscrire.
  const anneeChoisie = filterAnnee || anneeActive?.id;
  const inscriptionActuelle = form.eleve
    ? inscriptions.find(i => String(i.eleve) === String(form.eleve) && String(i.annee_scolaire) === String(anneeChoisie))
    : null;

  const handleSave = async () => {
    try {
      const data = { eleve: form.eleve, classe: form.classe, annee_scolaire: anneeChoisie };
      const result = await sendOrQueue({
        kind: 'http',
        label: inscriptionActuelle ? 'Changement de classe' : 'Nouvelle inscription',
        payload: inscriptionActuelle
          ? { method: 'PUT', url: `/inscriptions/${inscriptionActuelle.id}/`, data }
          : { method: 'POST', url: '/inscriptions/', data },
      });
      setSuccess(result.queued ? QUEUED_MSG : (inscriptionActuelle ? 'Élève changé de classe !' : 'Élève mis en classe !'));
      setOpen(false);
      setForm({ eleve: '', classe: '', annee_scolaire: '' });
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const msg = err.response?.data?.non_field_errors?.[0]
        || err.response?.data?.detail
        || "Impossible d'enregistrer : vérifiez l'élève et la classe.";
      setError(msg);
    }
  };

  const handleToggle = async (ins) => {
    const actif = ins.is_active !== false;
    const msg = actif
      ? 'Suspendre cette inscription ? L’élève reste dans l’historique (notes conservées).'
      : 'Réactiver cette inscription ?';
    if (!window.confirm(msg)) return;
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: actif ? 'Suspendre inscription' : 'Réactiver inscription',
        payload: actif
          ? { method: 'DELETE', url: `/inscriptions/${ins.id}/`, data: {} }
          : { method: 'POST', url: `/inscriptions/${ins.id}/reactiver/`, data: {} },
      });
      setSuccess(result.queued ? QUEUED_MSG : (actif ? 'Inscription suspendue' : 'Inscription réactivée'));
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Action impossible');
    }
  };

  const filtered = inscriptions.filter(i => {
    const matchNiveau = !filterNiveau || (i.niveau_nom && classes.find(c => String(c.id) === String(i.classe) && String(c.niveau) === String(filterNiveau)));
    const matchSearch = !search ||
      `${i.eleve_nom} ${i.eleve_prenom} ${i.eleve_matricule}`.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && i.is_active !== false)
      || (filterActif === 'suspended' && i.is_active === false);
    return matchNiveau && matchSearch && matchActif;
  });

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Affectation des élèves en classe</Typography>
        <Box display="flex" gap={1} flexWrap="wrap">
          {peutAffecter && (
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => { setError(''); setOpen(true); }}>
              Mettre ou changer un élève de classe
            </Button>
          )}
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 1 }} sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'center' }}>
              <FilterListIcon color="action" />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select fullWidth label="Année scolaire" size="small"
                value={filterAnnee} onChange={e => setFilterAnnee(e.target.value)}>
                {annees.map(a => <MenuItem key={a.id} value={a.id}>{a.libelle}{a.is_active ? ' (en cours)' : ''}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField select fullWidth label="Filtrer par niveau" size="small"
                value={filterNiveau} onChange={e => setFilterNiveau(e.target.value)}>
                <MenuItem value="">Tous les niveaux</MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth placeholder="Rechercher par nom ou matricule..." size="small"
                value={search} onChange={e => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <TextField select fullWidth label="Afficher" size="small"
                value={filterActif} onChange={e => setFilterActif(e.target.value)}>
                <MenuItem value="all">Toutes</MenuItem>
                <MenuItem value="active">Actives</MenuItem>
                <MenuItem value="suspended">Suspendues</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} elevation={2}>
          <Table>
            <TableHead sx={{ bgcolor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white' }}><strong>Élève</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Classe</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Année</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                <TableCell sx={{ color: 'white' }}><strong>Date</strong></TableCell>
                <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">Aucun élève trouvé</TableCell>
                </TableRow>
              ) : filtered.map(i => (
                <TableRow key={i.id} hover sx={{ opacity: i.is_active === false ? 0.65 : 1 }}>
                  <TableCell><strong>{i.eleve_nom} {i.eleve_prenom}</strong></TableCell>
                  <TableCell>{i.eleve_matricule}</TableCell>
                  <TableCell><Chip label={i.classe_nom || '—'} size="small" color="primary" /></TableCell>
                  <TableCell>{i.annee_libelle}</TableCell>
                  <TableCell>
                    <Chip size="small" label={i.statut_libelle || i.statut || 'Inscrit'} />
                    {i.redoublant ? <Chip size="small" label="Redoublant" color="warning" sx={{ ml: 0.5 }} /> : null}
                    {i.is_active === false ? <Chip size="small" label="Suspendue" color="warning" sx={{ ml: 0.5 }} /> : null}
                  </TableCell>
                  <TableCell>{i.date_inscription}</TableCell>
                  <TableCell align="right">
                    {peutAffecter && (
                      <Tooltip title={i.is_active === false ? 'Réactiver' : 'Suspendre'}>
                        <IconButton color={i.is_active === false ? 'success' : 'warning'} size="small"
                          onClick={() => handleToggle(i)}>
                          {i.is_active === false ? <PlayCircleIcon /> : <PauseCircleIcon />}
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {filtered.length} élève(s)
      </Typography>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Mettre ou changer un élève de classe</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={12}>
              <TextField select fullWidth label="Élève" value={form.eleve}
                onChange={e => setForm({ ...form, eleve: e.target.value })}>
                {eleves.map(e => (
                  <MenuItem key={e.id} value={e.id}>
                    {e.nom} {e.prenom} ({e.matricule})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Filtrer par niveau" value={filterNiveau}
                onChange={e => { setFilterNiveau(e.target.value); setForm({ ...form, classe: '' }); }}>
                <MenuItem value="">Tous</MenuItem>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Classe" value={form.classe}
                onChange={e => setForm({ ...form, classe: e.target.value })}>
                {classesFiltrees.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={12}>
              {inscriptionActuelle ? (
                <Alert severity="info">
                  Actuellement en <strong>{inscriptionActuelle.classe_nom}</strong> ({inscriptionActuelle.annee_libelle}). Il sera déplacé dans la
                  classe choisie. Si des paiements ont déjà été faits, le montant dû ne change pas.
                </Alert>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Année scolaire : {annees.find(a => String(a.id) === String(anneeChoisie))?.libelle || '—'}
                </Typography>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={!form.eleve || !form.classe}>
            Valider
          </Button>
        </DialogActions>
      </Dialog>


    </Box>
  );
}
