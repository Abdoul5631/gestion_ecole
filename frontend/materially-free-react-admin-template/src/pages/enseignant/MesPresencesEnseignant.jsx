import { useEffect, useState } from 'react';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, TextField, MenuItem, Alert, Grid,
  Avatar, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Button
} from '@mui/material';
import EventNoteIcon from '@mui/icons-material/EventNote';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const STATUT_COLOR  = { PRESENT: 'success', ABSENT: 'error', RETARD: 'warning', EXCUSE: 'info' };
const STATUT_LABEL  = { PRESENT: 'Présent', ABSENT: 'Absent', RETARD: 'En retard', EXCUSE: 'Excusé' };
const AVATAR_COLORS = ['#1976d2','#388e3c','#f57c00','#7b1fa2','#c62828','#0288d1','#00796b','#5d4037'];
const avatarColor   = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

export default function MesPresencesEnseignant() {
  const [presences, setPresences]           = useState([]);
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState('');

  const [filterClasse,  setFilterClasse]  = useState('');
  const [filterMatiere, setFilterMatiere] = useState('');
  const [filterDate,    setFilterDate]    = useState('');

  // Dialog justification
  const [justifyOpen,    setJustifyOpen]    = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [motif,          setMotif]          = useState('');
  const [saving,         setSaving]         = useState(false);

  const fetchPresences = () =>
    api.get('/presences/').then(res => setPresences(res.data)).catch(() => setError('Erreur de chargement.'));

  useEffect(() => {
    Promise.all([api.get('/presences/'), api.get('/classe-matieres/')])
      .then(([presRes, cmRes]) => {
        setPresences(presRes.data);
        setClasseMatieres(cmRes.data);
      })
      .catch(() => setError('Erreur de chargement.'))
      .finally(() => setLoading(false));
  }, []);

  // Options classes (dédupliquées)
  const classeOptions = [
    ...new Map(classeMatieres.map(cm => [cm.classe, { id: cm.classe, nom: cm.classe_nom }])).values()
  ];

  // Options matières selon la classe sélectionnée
  const matiereOptions = filterClasse
    ? classeMatieres.filter(cm => String(cm.classe) === String(filterClasse))
    : [];

  const cmSelectionne = matiereOptions.find(cm => String(cm.matiere) === String(filterMatiere));
  const cmIdsDeLaClasse = matiereOptions.map(cm => cm.id);

  const presencesFiltrees = presences
    .filter(p => !filterClasse  || cmIdsDeLaClasse.includes(p.classe_matiere))
    .filter(p => !filterMatiere || (cmSelectionne && p.classe_matiere === cmSelectionne.id))
    .filter(p => !filterDate    || p.date === filterDate);

  // Grouper par élève
  const parEleve = presencesFiltrees.reduce((acc, p) => {
    const key = p.eleve;
    if (!acc[key]) acc[key] = { nom: p.eleve_nom, prenom: p.eleve_prenom, records: [] };
    acc[key].records.push(p);
    return acc;
  }, {});

  const elevesGroupes = Object.values(parEleve).sort((a, b) => a.nom.localeCompare(b.nom));

  const stats = {
    presents: presencesFiltrees.filter(p => p.statut === 'PRESENT').length,
    absents:  presencesFiltrees.filter(p => p.statut === 'ABSENT').length,
    retards:  presencesFiltrees.filter(p => p.statut === 'RETARD').length,
    excuses:  presencesFiltrees.filter(p => p.statut === 'EXCUSE').length,
  };

  // Justification
  const openJustify = (rec) => {
    setSelectedRecord(rec);
    setMotif(rec.motif || '');
    setJustifyOpen(true);
  };

  const handleJustify = () => {
    if (!selectedRecord) return;
    setSaving(true);
    api.patch(`/presences/${selectedRecord.id}/`, { statut: 'EXCUSE', motif })
      .then(() => {
        setSuccess(`Absence de ${selectedRecord.eleve_nom} justifiée.`);
        setJustifyOpen(false);
        setSelectedRecord(null);
        fetchPresences();
        setTimeout(() => setSuccess(''), 3000);
      })
      .catch(() => setError("Erreur lors de la justification."))
      .finally(() => setSaving(false));
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <EventNoteIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold">Présences</Typography>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* Filtres */}
      <Card sx={{ mb: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <FilterListIcon color="action" />
            <Typography variant="subtitle1" fontWeight="bold">Filtres</Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Classe" size="small"
                value={filterClasse}
                onChange={e => { setFilterClasse(e.target.value); setFilterMatiere(''); }}>
                <MenuItem value="">Toutes les classes</MenuItem>
                {classeOptions.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth label="Matière" size="small"
                value={filterMatiere}
                onChange={e => setFilterMatiere(e.target.value)}
                disabled={!filterClasse}>
                <MenuItem value="">Toutes les matières</MenuItem>
                {matiereOptions.map(cm => (
                  <MenuItem key={cm.id} value={cm.matiere}>{cm.matiere_nom}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth label="Date" type="date" size="small"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>
      ) : !filterClasse ? (
        <Box textAlign="center" py={8} color="text.secondary">
          <EventNoteIcon sx={{ fontSize: 64, opacity: 0.2, mb: 1 }} />
          <Typography>Sélectionnez une classe pour voir les présences.</Typography>
        </Box>
      ) : elevesGroupes.length === 0 ? (
        <Alert severity="info">Aucune présence enregistrée pour ces critères.</Alert>
      ) : (
        <>
          {/* Stats */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              { label: 'Présents',   value: stats.presents, color: '#2e7d32', bg: '#e8f5e9' },
              { label: 'Absents',    value: stats.absents,  color: '#c62828', bg: '#ffebee' },
              { label: 'En retard',  value: stats.retards,  color: '#f57c00', bg: '#fff3e0' },
              { label: 'Excusés',    value: stats.excuses,  color: '#0288d1', bg: '#e1f5fe' },
            ].map(s => (
              <Grid key={s.label} size={{ xs: 6, sm: 3 }}>
                <Card sx={{ borderRadius: 2, bgcolor: s.bg, boxShadow: 'none', border: `1px solid ${s.color}33` }}>
                  <CardContent sx={{ py: 1.5, textAlign: 'center', '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="h5" fontWeight="bold" sx={{ color: s.color }}>{s.value}</Typography>
                    <Typography variant="caption" sx={{ color: s.color }}>{s.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Tableau */}
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell sx={{ width: 220 }}><strong>Élève</strong></TableCell>
                      <TableCell><strong>Date</strong></TableCell>
                      {!filterMatiere && <TableCell><strong>Matière</strong></TableCell>}
                      <TableCell><strong>Statut</strong></TableCell>
                      <TableCell><strong>Motif</strong></TableCell>
                      <TableCell align="center"><strong>Justifier</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {elevesGroupes.map(eleve =>
                      eleve.records
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((rec, idx) => (
                          <TableRow key={rec.id} hover
                            sx={{
                              bgcolor: rec.statut === 'ABSENT' ? '#fff5f5'
                                     : rec.statut === 'EXCUSE' ? '#f0f9ff'
                                     : rec.statut === 'RETARD' ? '#fffde7'
                                     : 'inherit'
                            }}>
                            <TableCell sx={{ borderBottom: idx === eleve.records.length - 1 ? undefined : 'none' }}>
                              {idx === 0 && (
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Avatar sx={{ width: 32, height: 32, fontSize: 13, fontWeight: 'bold', bgcolor: avatarColor(eleve.nom) }}>
                                    {eleve.nom?.[0]?.toUpperCase()}
                                  </Avatar>
                                  <Box>
                                    <Typography fontWeight="bold" variant="body2">{eleve.nom} {eleve.prenom}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {eleve.records.length} enregistrement(s)
                                    </Typography>
                                  </Box>
                                </Box>
                              )}
                            </TableCell>
                            <TableCell>{rec.date}</TableCell>
                            {!filterMatiere && (
                              <TableCell>
                                <Typography variant="body2" color="text.secondary">{rec.matiere_nom || '—'}</Typography>
                              </TableCell>
                            )}
                            <TableCell>
                              <Chip
                                label={STATUT_LABEL[rec.statut] || rec.statut}
                                color={STATUT_COLOR[rec.statut] || 'default'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">{rec.motif || '—'}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              {(rec.statut === 'ABSENT' || rec.statut === 'RETARD') ? (
                                <Tooltip title="Marquer comme excusé">
                                  <IconButton size="small" color="info" onClick={() => openJustify(rec)}>
                                    <CheckCircleIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : rec.statut === 'EXCUSE' ? (
                                <Chip label="Justifié" color="info" size="small" variant="outlined" />
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog justification */}
      <Dialog open={justifyOpen} onClose={() => setJustifyOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Justifier l'absence / retard</DialogTitle>
        <DialogContent>
          {selectedRecord && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" mb={2}>
                <strong>{selectedRecord.eleve_nom} {selectedRecord.eleve_prenom}</strong>
                {' — '}{selectedRecord.date}
                {' — '}<Chip label={STATUT_LABEL[selectedRecord.statut]} color={STATUT_COLOR[selectedRecord.statut]} size="small" />
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Motif de justification"
                placeholder="Ex: Certificat médical, raison familiale..."
                value={motif}
                onChange={e => setMotif(e.target.value)}
                autoFocus
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setJustifyOpen(false)} color="inherit">Annuler</Button>
          <Button
            variant="contained"
            color="info"
            startIcon={<CheckCircleIcon />}
            onClick={handleJustify}
            disabled={saving || !motif.trim()}>
            {saving ? 'Enregistrement...' : 'Marquer Excusé'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
