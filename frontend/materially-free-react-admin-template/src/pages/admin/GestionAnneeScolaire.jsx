import { useEffect, useState } from 'react';
import { anneeService, trimestreService } from 'services/api';
import {
  Box, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, CircularProgress, Chip, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import useIsMobile from 'hooks/useIsMobile';

export default function GestionAnneeScolaire() {
  const isMobile = useIsMobile();
  const [annees, setAnnees] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dialogs année
  const [openAnnee, setOpenAnnee] = useState(false);
  const [suspendAnneeOpen, setSuspendAnneeOpen] = useState(false);
  const [formAnnee, setFormAnnee] = useState({ libelle: '' });
  const [selectedAnnee, setSelectedAnnee] = useState(null);

  // Dialogs trimestre
  const [openTrimestre, setOpenTrimestre] = useState(false);
  const [suspendTrimestreOpen, setSuspendTrimestreOpen] = useState(false);
  const [formTrimestre, setFormTrimestre] = useState({ annee_scolaire: '', nom: '' });
  const [selectedTrimestre, setSelectedTrimestre] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resA, resT] = await Promise.all([anneeService.getAll(), trimestreService.getAll()]);
      setAnnees(resA.data);
      setTrimestres(resT.data);
    } catch {
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const ok = (msg) => { setSuccess(msg); fetchData(); setTimeout(() => setSuccess(''), 3000); };
  const ko = (msg) => setError(msg);

  // ── Années scolaires ──
  const handleSaveAnnee = async () => {
    try {
      if (selectedAnnee) await anneeService.update(selectedAnnee.id, { libelle: formAnnee.libelle, is_active: selectedAnnee.is_active });
      else await anneeService.create({ libelle: formAnnee.libelle });
      setOpenAnnee(false);
      setFormAnnee({ libelle: '' });
      setSelectedAnnee(null);
      ok('Année scolaire enregistrée !');
    } catch { ko("Erreur (libellé peut-être déjà existant)."); }
  };

  const handleToggleAnnee = async () => {
    try {
      await anneeService.patch(selectedAnnee.id, { is_active: !selectedAnnee.is_active });
      setSuspendAnneeOpen(false);
      ok(selectedAnnee.is_active ? 'Année scolaire suspendue.' : 'Année scolaire réactivée !');
    } catch { ko('Erreur lors de la modification.'); setSuspendAnneeOpen(false); }
  };

  // ── Trimestres ──
  const handleSaveTrimestre = async () => {
    try {
      if (selectedTrimestre) await trimestreService.update(selectedTrimestre.id, { annee_scolaire: formTrimestre.annee_scolaire, nom: formTrimestre.nom, is_active: selectedTrimestre.is_active });
      else await trimestreService.create({ annee_scolaire: formTrimestre.annee_scolaire, nom: formTrimestre.nom });
      setOpenTrimestre(false);
      setFormTrimestre({ annee_scolaire: '', nom: '' });
      setSelectedTrimestre(null);
      ok('Trimestre enregistré !');
    } catch { ko("Erreur lors de l'enregistrement."); }
  };

  const handleToggleTrimestre = async () => {
    try {
      await trimestreService.patch(selectedTrimestre.id, { is_active: !selectedTrimestre.is_active });
      setSuspendTrimestreOpen(false);
      ok(selectedTrimestre.is_active ? 'Trimestre suspendu.' : 'Trimestre réactivé !');
    } catch { ko('Erreur lors de la modification.'); setSuspendTrimestreOpen(false); }
  };

  const StatusChip = ({ active }) => (
    <Chip
      label={active ? 'Actif' : 'Suspendu'}
      color={active ? 'success' : 'default'}
      size="small"
      variant={active ? 'filled' : 'outlined'}
    />
  );

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Gestion de l'Année Scolaire</Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={3}>

          {/* ── Années scolaires ── */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" mb={2}>
                  <Typography variant="h6">Années Scolaires</Typography>
                  <Button variant="contained" startIcon={<AddIcon />}
                    onClick={() => { setSelectedAnnee(null); setFormAnnee({ libelle: '' }); setOpenAnnee(true); }}>
                    Nouvelle Année
                  </Button>
                </Box>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell><strong>Libellé</strong></TableCell>
                        <TableCell><strong>Statut</strong></TableCell>
                        <TableCell align="right"><strong>Actions</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {annees.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center">Aucune année scolaire</TableCell>
                        </TableRow>
                      ) : annees.map(a => (
                        <TableRow key={a.id} hover
                          sx={{ opacity: a.is_active ? 1 : 0.6, bgcolor: a.is_active ? 'inherit' : '#fff8e1' }}>
                          <TableCell><strong>{a.libelle}</strong></TableCell>
                          <TableCell><StatusChip active={a.is_active} /></TableCell>
                          <TableCell align="right">
                            <Box display="flex" gap={0.5} justifyContent="flex-end">
                              <Tooltip title="Modifier">
                                <IconButton size="small" color="primary"
                                  onClick={() => { setSelectedAnnee(a); setFormAnnee({ libelle: a.libelle }); setOpenAnnee(true); }}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={a.is_active ? 'Suspendre' : 'Réactiver'}>
                                <IconButton size="small"
                                  color={a.is_active ? 'warning' : 'success'}
                                  onClick={() => { setSelectedAnnee(a); setSuspendAnneeOpen(true); }}>
                                  {a.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* ── Trimestres ── */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" mb={2}>
                  <Typography variant="h6">Trimestres</Typography>
                  <Button variant="contained" color="secondary" startIcon={<AddIcon />}
                    onClick={() => { setSelectedTrimestre(null); setFormTrimestre({ annee_scolaire: '', nom: '' }); setOpenTrimestre(true); }}>
                    Nouveau Trimestre
                  </Button>
                </Box>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell><strong>Année Scolaire</strong></TableCell>
                        <TableCell><strong>Trimestre</strong></TableCell>
                        <TableCell><strong>Statut</strong></TableCell>
                        <TableCell align="right"><strong>Actions</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {trimestres.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center">Aucun trimestre</TableCell>
                        </TableRow>
                      ) : trimestres.map(t => (
                        <TableRow key={t.id} hover
                          sx={{ opacity: t.is_active ? 1 : 0.6, bgcolor: t.is_active ? 'inherit' : '#fff8e1' }}>
                          <TableCell>{t.annee_libelle}</TableCell>
                          <TableCell><strong>{t.nom}</strong></TableCell>
                          <TableCell><StatusChip active={t.is_active} /></TableCell>
                          <TableCell align="right">
                            <Box display="flex" gap={0.5} justifyContent="flex-end">
                              <Tooltip title="Modifier">
                                <IconButton size="small" color="primary"
                                  onClick={() => {
                                    setSelectedTrimestre(t);
                                    setFormTrimestre({ annee_scolaire: t.annee_scolaire, nom: t.nom });
                                    setOpenTrimestre(true);
                                  }}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={t.is_active ? 'Suspendre' : 'Réactiver'}>
                                <IconButton size="small"
                                  color={t.is_active ? 'warning' : 'success'}
                                  onClick={() => { setSelectedTrimestre(t); setSuspendTrimestreOpen(true); }}>
                                  {t.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Dialog Année — Créer / Modifier */}
      <Dialog open={openAnnee} onClose={() => setOpenAnnee(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{selectedAnnee ? 'Modifier' : 'Ajouter'} une Année Scolaire</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="Libellé (ex: 2024-2025)" fullWidth value={formAnnee.libelle}
            onChange={e => setFormAnnee({ libelle: e.target.value })}
            placeholder="2024-2025" autoFocus sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenAnnee(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleSaveAnnee} disabled={!formAnnee.libelle}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Année — Suspendre / Réactiver */}
      <Dialog open={suspendAnneeOpen} onClose={() => setSuspendAnneeOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selectedAnnee?.is_active ? "Suspendre l'année" : "Réactiver l'année"}
        </DialogTitle>
        <DialogContent>
          {selectedAnnee?.is_active ? (
            <>
              <Typography>Suspendre l'année <strong>{selectedAnnee?.libelle}</strong> ?</Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                L'année sera marquée comme suspendue. Les trimestres et données liées restent conservés.
              </Alert>
            </>
          ) : (
            <Typography>Réactiver l'année <strong>{selectedAnnee?.libelle}</strong> ?</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendAnneeOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained"
            color={selectedAnnee?.is_active ? 'warning' : 'success'}
            onClick={handleToggleAnnee}>
            {selectedAnnee?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Trimestre — Créer / Modifier */}
      <Dialog open={openTrimestre} onClose={() => setOpenTrimestre(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{selectedTrimestre ? 'Modifier' : 'Ajouter'} un Trimestre</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box display="flex" flexDirection="column" gap={2} sx={{ mt: 1 }}>
            <TextField select label="Année Scolaire" fullWidth
              value={formTrimestre.annee_scolaire}
              onChange={e => setFormTrimestre({ ...formTrimestre, annee_scolaire: e.target.value })}>
              {annees.map(a => <MenuItem key={a.id} value={a.id}>{a.libelle}</MenuItem>)}
            </TextField>
            <TextField label="Nom du trimestre" fullWidth
              value={formTrimestre.nom}
              onChange={e => setFormTrimestre({ ...formTrimestre, nom: e.target.value })}
              placeholder="ex: Trimestre 1" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpenTrimestre(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleSaveTrimestre}
            disabled={!formTrimestre.annee_scolaire || !formTrimestre.nom}>
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Trimestre — Suspendre / Réactiver */}
      <Dialog open={suspendTrimestreOpen} onClose={() => setSuspendTrimestreOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selectedTrimestre?.is_active ? 'Suspendre le trimestre' : 'Réactiver le trimestre'}
        </DialogTitle>
        <DialogContent>
          {selectedTrimestre?.is_active ? (
            <>
              <Typography>
                Suspendre <strong>{selectedTrimestre?.nom}</strong> ({selectedTrimestre?.annee_libelle}) ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                Le trimestre sera marqué comme suspendu. Les évaluations et notes liées restent conservées.
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver <strong>{selectedTrimestre?.nom}</strong> ({selectedTrimestre?.annee_libelle}) ?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendTrimestreOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained"
            color={selectedTrimestre?.is_active ? 'warning' : 'success'}
            onClick={handleToggleTrimestre}>
            {selectedTrimestre?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
