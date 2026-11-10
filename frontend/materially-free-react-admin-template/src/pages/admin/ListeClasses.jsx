import { useEffect, useMemo, useState } from 'react';
import { messageErreur } from 'utils/erreurs';
import { classeService, niveauService, enseignantService, inscriptionService, anneeService, getResults } from 'services/api';
import authService from 'services/auth';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import ouvrirPdf from 'utils/ouvrirPdf';
import {
  Box, Typography, Grid, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Tooltip, CircularProgress, Chip,
  InputAdornment, Avatar
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import useIsMobile from 'hooks/useIsMobile';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { useIsOnline } from 'offline/RequireOnline';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';

import { estEnLigne } from 'offline/reseau';
const initForm = { nom: '', niveau: '', professeur_principal: '' };

// On saisit seulement la lettre (A, B, C…) : la classe s'appelle « niveau + lettre », ex. 6ème A
const lettresSeules = (v) => String(v || '').toUpperCase().replace(/[^A-ZÀ-ÖØ-Ý]/g, '').slice(0, 3);
const lettreDe = (c) => {
  const reste = String(c.nom || '').startsWith(`${c.niveau_nom} `) ? c.nom.slice(c.niveau_nom.length + 1).trim() : c.nom;
  return /^[A-ZÀ-ÖØ-Ý]{1,3}$/.test(reste) ? reste : c.nom; // ancien nom libre : conservé tel quel
};
const PALETTE = ['#0e8a96', '#d9661a', '#2b8a3e', '#3460c4', '#c0392b', '#7b3fa0', '#8a5a2b', '#0f766e'];

// « 6ème A » → 6A, « Terminale C » → TC, « 2nde A » → 2A
const sigle = (nom) => {
  const mots = String(nom || '').trim().split(/\s+/);
  if (mots.length === 1) return mots[0].slice(0, 3).toUpperCase(); // « CM2 », « CP1 »
  const debut = (mots[0].match(/^\d+/) || [mots[0][0] || '?'])[0];
  return `${debut}${mots.length > 1 ? mots[mots.length - 1][0] : ''}`.toUpperCase();
};
const initiales = (nom) => String(nom || '').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase();

export default function ListeClasses() {
  const peutModifier = authService.getRole() === 'ADMIN'; // secrétaire, comptable, surveillant : consultation seulement
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [filterNiveau, setFilterNiveau] = useState('');
  const [filterActif, setFilterActif] = useState('all');
  const [search, setSearch] = useState('');
  const [eleves, setEleves] = useState([]);
  const [loadingEleves, setLoadingEleves] = useState(false);
  const isMobile = useIsMobile();
  const [annee, setAnnee] = useState('');
  const online = useIsOnline();

  const fetchData = async () => {
    setLoading(true);
    setError('');
    anneeService.getActive().then((r) => setAnnee(r.data?.libelle || '')).catch(() => {});
    try {
      const paramsC = '?inclure_suspendus=1';
      const paramsN = '?inclure_suspendus=1';
      const paramsE = '?inclure_suspendus=1';
      const [resC, resN, resE] = await Promise.all([
        readThrough(CacheKeys.classes(paramsC), async () => {
          const r = await classeService.getAll(paramsC);
          return Array.isArray(r.data) ? r.data : r.data.results ?? [];
        }),
        readThrough(CacheKeys.niveaux(paramsN), async () => {
          const r = await niveauService.getAll(paramsN);
          return Array.isArray(r.data) ? r.data : r.data.results ?? [];
        }),
        peutModifier
          ? readThrough(CacheKeys.enseignants(paramsE), async () => {
            const r = await enseignantService.getAll(paramsE);
            return Array.isArray(r.data) ? r.data : r.data.results ?? [];
          })
          : Promise.resolve({ data: [] }),
      ]);
      if (resC.neverCached) {
        setError(NEVER_CACHED_MSG);
        setClasses([]);
      } else {
        setClasses(resC.data || []);
        setNiveaux(resN.data || []);
        setEnseignants(resE.data || []);
      }
    } catch {
      setError(estEnLigne() ? 'Erreur de chargement' : NEVER_CACHED_MSG);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = classes.filter(c => {
    const matchNiveau = !filterNiveau || String(c.niveau) === String(filterNiveau);
    const matchSearch = !search || c.nom_complet?.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && c.is_active)
      || (filterActif === 'suspended' && !c.is_active);
    return matchNiveau && matchSearch && matchActif;
  });

  const couleurDuNiveau = useMemo(() => {
    const ordre = new Map(niveaux.map((n, i) => [n.id, i]));
    return (niveauId) => PALETTE[(ordre.get(niveauId) ?? 0) % PALETTE.length];
  }, [niveaux]);

  // classes dans l'ordre des niveaux, puis par nom
  const classesTriees = useMemo(() => {
    const ordre = new Map(niveaux.map((n, i) => [n.id, i]));
    return [...filtered].sort((a, b) => ((ordre.get(a.niveau) ?? 999) - (ordre.get(b.niveau) ?? 999))
      || String(a.nom_complet).localeCompare(String(b.nom_complet), 'fr', { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, niveaux, filterNiveau, filterActif, search]);
  const totalEleves = filtered.filter((c) => c.is_active).reduce((t, c) => t + (c.nb_eleves || 0), 0);

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, niveau: form.niveau };
      if (form.professeur_principal) payload.professeur_principal = form.professeur_principal;
      const result = await sendOrQueue({
        kind: 'http',
        label: 'Créer classe',
        payload: { method: 'POST', url: '/classes/', data: payload },
      });
      setSuccess(result.queued ? QUEUED_MSG : 'Classe créée !');
      setOpen(false); setForm(initForm);
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(messageErreur(err, 'Création impossible : cette classe existe peut-être déjà dans ce niveau.'));
    } finally { setSaving(false); }
  };

  const handleOpenEdit = (c) => {
    setSelected(c);
    setForm({ nom: lettreDe(c), niveau: c.niveau, professeur_principal: c.professeur_principal || '' });
    setError(''); setEditOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true); setError('');
    try {
      const payload = { nom: form.nom, niveau: form.niveau };
      if (form.professeur_principal) payload.professeur_principal = form.professeur_principal;
      const result = await sendOrQueue({
        kind: 'http',
        label: 'Modifier classe',
        payload: { method: 'PUT', url: `/classes/${selected.id}/`, data: payload },
      });
      setSuccess(result.queued ? QUEUED_MSG : 'Classe modifiée !');
      setEditOpen(false);
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(messageErreur(err, 'Modification impossible. Vérifiez la lettre de la classe.'));
    } finally { setSaving(false); }
  };

  const handleToggleSuspend = async () => {
    try {
      if (selected.is_active) {
        const nb = selected.nb_eleves || 0;
        if (nb > 0 && !window.confirm('Ces élèves restent inscrits cette année. Suspendre quand même ?')) return;
      }
      const result = await sendOrQueue({
        kind: 'http',
        label: selected.is_active ? 'Suspendre classe' : 'Réactiver classe',
        payload: selected.is_active
          ? { method: 'DELETE', url: `/classes/${selected.id}/`, data: {} }
          : { method: 'POST', url: `/classes/${selected.id}/reactiver/`, data: {} },
      });
      setSuccess(result.queued ? QUEUED_MSG : (selected.is_active ? 'Classe suspendue.' : 'Classe réactivée !'));
      setSuspendOpen(false);
      if (!result.queued) fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  // Liste des élèves d'UNE classe : PDF à imprimer (ouvert dans un onglet) ou à télécharger
  const imprimerListe = async (c) => {
    try {
      await ouvrirPdf(classeService.listePdf(c.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const telechargerListe = async (c) => {
    try {
      const res = await classeService.listePdf(c.id, true);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `liste_${String(c.nom_complet || c.nom).replace(/\s+/g, '_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError('Impossible de télécharger la liste.');
    }
  };

  const handleOpenDetail = async (c) => {
    setSelected(c); setDetailOpen(true); setLoadingEleves(true);
    try {
      const res = await inscriptionService.getAll(`?classe_id=${c.id}&page_size=500`);
      setEleves(getResults(res).items.filter(i => String(i.classe) === String(c.id))
        .sort((a, b) => `${a.eleve_nom} ${a.eleve_prenom}`.localeCompare(`${b.eleve_nom} ${b.eleve_prenom}`)));
    } catch {
      setEleves([]);
    } finally { setLoadingEleves(false); }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Classes</Typography>
          {annee && <Chip size="small" color="primary" variant="outlined" label={`Année scolaire ${annee}`} />}
        </Box>
        {peutModifier && (
          <Button size="small" variant="contained" startIcon={<AddIcon />}
            disabled={!online}
            title={!online ? 'Connexion requise' : ''}
            onClick={() => { setForm(initForm); setError(''); setOpen(true); }}>
            Nouvelle Classe
          </Button>
        )}
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box display="flex" gap={1.5} flexWrap="wrap" alignItems="center" mb={2.5}>
        <TextField size="small" placeholder="Rechercher une classe..." value={search} onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 260 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
        <TextField select size="small" label="Niveau" value={filterNiveau} onChange={(e) => setFilterNiveau(e.target.value)} sx={{ minWidth: 170 }}>
          <MenuItem value="">Tous les niveaux</MenuItem>
          {niveaux.map((n) => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
        </TextField>
        {peutModifier && (
          <TextField select size="small" label="Statut" value={filterActif} onChange={(e) => setFilterActif(e.target.value)} sx={{ minWidth: 150 }}>
            <MenuItem value="all">Toutes</MenuItem>
            <MenuItem value="active">Actives</MenuItem>
            <MenuItem value="suspended">Suspendues</MenuItem>
          </TextField>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ ml: { sm: 'auto' } }}>
          {classesTriees.length} classe{classesTriees.length > 1 ? 's' : ''} · {totalEleves} élève{totalEleves > 1 ? 's' : ''}
        </Typography>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : classesTriees.length === 0 ? (
        <Alert severity="info">Aucune classe trouvée.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 1fr))' }, gap: 2.5 }}>
          {classesTriees.map((c) => {
            const couleur = couleurDuNiveau(c.niveau);
            const nb = c.nb_eleves || 0;
            return (
              <Box key={c.id} sx={{
                position: 'relative', borderRadius: 4, bgcolor: 'background.paper', overflow: 'hidden',
                border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column',
                opacity: c.is_active ? 1 : 0.6, boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
                transition: 'transform .18s, box-shadow .18s, border-color .18s',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 14px 30px rgba(16,24,40,0.10)', borderColor: `${couleur}66` },
              }}>
                {/* bandeau teinté de la couleur du niveau */}
                <Box sx={{ height: 6, background: `linear-gradient(90deg, ${couleur}, ${couleur}99)` }} />
                <Box sx={{ p: 2.25, pb: 1.75, display: 'flex', alignItems: 'center', gap: 1.75 }}>
                  <Box sx={{
                    width: 54, height: 54, borderRadius: 3, flexShrink: 0, color: '#fff',
                    background: `linear-gradient(135deg, ${couleur}, ${couleur}cc)`, boxShadow: `0 6px 14px ${couleur}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 19, letterSpacing: 0.5,
                  }}>
                    {sigle(c.nom_complet)}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 19, lineHeight: 1.2 }} noWrap>{c.nom_complet}</Typography>
                    <Box display="flex" alignItems="center" gap={0.75} mt={0.5}>
                      <Box sx={{ px: 1, py: 0.15, borderRadius: 10, bgcolor: `${couleur}14`, color: couleur, fontSize: 12, fontWeight: 700 }}>
                        {c.niveau_nom}
                      </Box>
                      {!c.is_active && (
                        <Box sx={{ px: 1, py: 0.15, borderRadius: 10, bgcolor: '#fef3c7', color: '#b45309', fontSize: 12, fontWeight: 700 }}>Suspendue</Box>
                      )}
                    </Box>
                  </Box>
                  <Box textAlign="right" sx={{ flexShrink: 0 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 28, lineHeight: 1, color: nb ? 'text.primary' : 'text.disabled' }}>{nb}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>élève{nb > 1 ? 's' : ''}</Typography>
                  </Box>
                </Box>

                <Box sx={{ mx: 2.25, mb: 2, px: 1.5, py: 1.1, borderRadius: 2.5, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  {c.professeur_nom ? (
                    <Avatar sx={{ width: 30, height: 30, fontSize: 12, fontWeight: 700, bgcolor: `${couleur}22`, color: couleur }}>{initiales(c.professeur_nom)}</Avatar>
                  ) : (
                    <Avatar sx={{ width: 30, height: 30, bgcolor: 'transparent', color: 'text.disabled', border: '1px dashed', borderColor: 'divider' }}><PersonOutlineIcon fontSize="small" /></Avatar>
                  )}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.2 }}>Professeur principal</Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: c.professeur_nom ? 'text.primary' : 'text.disabled', fontStyle: c.professeur_nom ? 'normal' : 'italic' }} noWrap>
                      {c.professeur_nom || 'Non désigné'}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 'auto', px: 1.25, py: 0.75, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
                  <Button onClick={() => handleOpenDetail(c)} endIcon={<ArrowForwardIcon sx={{ fontSize: '16px !important' }} />}
                    sx={{ color: couleur, fontWeight: 700, textTransform: 'none', fontSize: 14, borderRadius: 2, '&:hover': { bgcolor: `${couleur}10` } }}>
                    Voir les élèves
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  {peutModifier && (
                    <>
                      <Tooltip title="Modifier"><IconButton size="small" onClick={() => handleOpenEdit(c)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title={c.is_active ? 'Suspendre la classe' : 'Réactiver la classe'}>
                        <IconButton size="small" color={c.is_active ? 'default' : 'success'} onClick={() => { setSelected(c); setSuspendOpen(true); }}>
                          {c.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Dialog Création */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvelle Classe</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Niveau" value={form.niveau}
                onChange={e => setForm({ ...form, niveau: e.target.value })}>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Lettre de la classe"
                value={form.nom} onChange={e => setForm({ ...form, nom: lettresSeules(e.target.value) })}
                placeholder="A, B, C…" autoFocus inputProps={{ maxLength: 3, style: { textTransform: 'uppercase' } }}
                helperText={form.niveau && form.nom ? `La classe s'appellera : ${niveaux.find(n => n.id === form.niveau)?.nom || ''} ${form.nom}` : 'Lettres seulement : A, B, C…'} />
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Professeur Principal (optionnel)"
                value={form.professeur_principal}
                onChange={e => setForm({ ...form, professeur_principal: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || !form.nom || !form.niveau}>
            {saving ? 'Création...' : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Modification */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.nom_complet}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select fullWidth label="Niveau" value={form.niveau}
                onChange={e => setForm({ ...form, niveau: e.target.value })}>
                {niveaux.map(n => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Lettre de la classe"
                value={form.nom} onChange={e => setForm({ ...form, nom: lettresSeules(e.target.value) })} autoFocus
                inputProps={{ maxLength: 3, style: { textTransform: 'uppercase' } }}
                helperText={form.niveau && form.nom ? `La classe s'appellera : ${niveaux.find(n => n.id === form.niveau)?.nom || ''} ${form.nom}` : 'Lettres seulement : A, B, C…'} />
            </Grid>
            <Grid size={12}>
              <TextField select fullWidth label="Professeur Principal (optionnel)"
                value={form.professeur_principal}
                onChange={e => setForm({ ...form, professeur_principal: e.target.value })}>
                <MenuItem value=""><em>Aucun</em></MenuItem>
                {enseignants.map(en => <MenuItem key={en.id} value={en.id}>{en.nom}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate}
            disabled={saving || !form.nom || !form.niveau}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Suspendre / Réactiver */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.is_active ? 'Suspendre la classe' : 'Réactiver la classe'}
        </DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>
                Suspendre <strong>{selected?.nom_complet}</strong> ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                {(selected?.nb_eleves || 0) > 0
                  ? `${selected.nb_eleves} élève(s) restent inscrits cette année. Notes et historique conservés.`
                  : 'La classe ne sera plus proposée pour les nouvelles inscriptions et l’emploi du temps.'}
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver la classe <strong>{selected?.nom_complet}</strong> ?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained"
            color={selected?.is_active ? 'warning' : 'success'}
            onClick={handleToggleSuspend}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Détails élèves */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.nom_complet}
          {selected?.professeur_nom && (
            <Typography variant="body2" color="text.secondary">
              Prof. Principal : {selected.professeur_nom}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ minHeight: 300 }}>
          {loadingEleves ? (
            <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>
          ) : eleves.length === 0 ? (
            <Alert severity="info">Aucun élève inscrit dans cette classe.</Alert>
          ) : (
            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell><strong>Matricule</strong></TableCell>
                    <TableCell><strong>Nom</strong></TableCell>
                    <TableCell><strong>Prénom</strong></TableCell>
                    <TableCell><strong>Date de naissance</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eleves.map(i => (
                    <TableRow key={i.id} hover>
                      <TableCell>{i.eleve_matricule}</TableCell>
                      <TableCell><strong>{i.eleve_nom}</strong></TableCell>
                      <TableCell>{i.eleve_prenom}</TableCell>
                      <TableCell>{i.eleve_date_naissance ? new Date(`${i.eleve_date_naissance}T00:00:00`).toLocaleDateString('fr-FR') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)} color="inherit">Fermer</Button>
          <Box flex={1} />
          <Button startIcon={<DownloadIcon />} disabled={eleves.length === 0} onClick={() => telechargerListe(selected)}>
            Télécharger PDF
          </Button>
          <Button variant="contained" startIcon={<PrintIcon />} disabled={eleves.length === 0} onClick={() => imprimerListe(selected)}>
            Imprimer
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
