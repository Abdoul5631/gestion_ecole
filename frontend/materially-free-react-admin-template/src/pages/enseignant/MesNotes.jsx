import { useEffect, useState } from 'react';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  CircularProgress, Chip, TextField, MenuItem, Alert,
  Grid, Divider
} from '@mui/material';
import GradeIcon from '@mui/icons-material/Grade';
import FilterListIcon from '@mui/icons-material/FilterList';

const TYPE_LABELS = { DEVOIR1: 'Devoir 1', DEVOIR2: 'Devoir 2', COMPOSITION: 'Composition', EXAMEN_BLANC: 'Examen Blanc' };
const TYPE_COLORS = { DEVOIR1: 'primary', DEVOIR2: 'secondary', COMPOSITION: 'warning', EXAMEN_BLANC: 'error' };

function fmt(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toFixed(2);
  return val;
}

export default function MesNotes() {
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [error, setError] = useState('');

  const [filterClasse, setFilterClasse] = useState('');
  const [filterTrimestre, setFilterTrimestre] = useState('');
  const [filterEval, setFilterEval] = useState('');

  // Chargement données de référence
  useEffect(() => {
    setLoadingRef(true);
    Promise.all([
      api.get('/classe-matieres/'),
      api.get('/trimestres/'),
    ]).then(([cmRes, triRes]) => {
      setClasseMatieres(cmRes.data);
      setTrimestres(triRes.data);
    }).catch(() => setError('Erreur de chargement des données.')).finally(() => setLoadingRef(false));
  }, []);

  // Chargement évaluations quand classe ou trimestre change
  useEffect(() => {
    setEvaluations([]);
    setFilterEval('');
    setNotes([]);
    if (!filterClasse) return;

    // IDs des ClasseMatiere de cette classe
    const cmIdsDeClasse = classeMatieres
      .filter(cm => String(cm.classe) === String(filterClasse))
      .map(cm => cm.id);

    api.get('/evaluations/').then(res => {
      let evals = res.data.filter(e => cmIdsDeClasse.includes(e.classe_matiere));
      if (filterTrimestre) evals = evals.filter(e => String(e.trimestre) === String(filterTrimestre));
      setEvaluations(evals);
    }).catch(() => {});
  }, [filterClasse, filterTrimestre, classeMatieres]);

  // Chargement notes quand évaluation sélectionnée
  useEffect(() => {
    setNotes([]);
    if (!filterEval) return;
    setLoadingNotes(true);
    api.get(`/evaluations/${filterEval}/notes/`)
      .then(res => setNotes(res.data))
      .catch(() => setError('Erreur de chargement des notes.'))
      .finally(() => setLoadingNotes(false));
  }, [filterEval]);

  // Options de classes (dédupliquées depuis classeMatieres)
  const classeOptions = [
    ...new Map(
      classeMatieres.map(cm => [cm.classe, { id: cm.classe, nom: cm.classe_nom }])
    ).values()
  ];

  const evalSelected = evaluations.find(e => String(e.id) === String(filterEval));

  const moyenne = notes.length > 0
    ? (notes.reduce((s, n) => s + parseFloat(n.valeur || 0), 0) / notes.length).toFixed(2)
    : null;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <GradeIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold">Notes</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Filtres */}
      <Card sx={{ mb: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <FilterListIcon color="action" />
            <Typography variant="subtitle1" fontWeight="bold">Filtres</Typography>
          </Box>
          {loadingRef ? (
            <Box display="flex" justifyContent="center" p={2}><CircularProgress size={24} /></Box>
          ) : (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select fullWidth label="Classe" size="small"
                  value={filterClasse}
                  onChange={e => { setFilterClasse(e.target.value); setFilterTrimestre(''); setFilterEval(''); }}>
                  <MenuItem value="">Toutes les classes</MenuItem>
                  {classeOptions.map(c => (
                    <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select fullWidth label="Trimestre" size="small"
                  value={filterTrimestre}
                  onChange={e => { setFilterTrimestre(e.target.value); setFilterEval(''); }}
                  disabled={!filterClasse}>
                  <MenuItem value="">Tous les trimestres</MenuItem>
                  {trimestres.map(t => (
                    <MenuItem key={t.id} value={t.id}>{t.nom} — {t.annee_libelle}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select fullWidth label="Évaluation (Devoir)" size="small"
                  value={filterEval}
                  onChange={e => setFilterEval(e.target.value)}
                  disabled={!filterClasse || evaluations.length === 0}>
                  <MenuItem value="">Sélectionner une évaluation</MenuItem>
                  {evaluations.map(e => (
                    <MenuItem key={e.id} value={e.id}>
                      {TYPE_LABELS[e.type] || e.type} — {e.matiere_nom}
                      {e.date ? ` (${e.date})` : ''}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Résultat */}
      {!filterClasse && (
        <Box textAlign="center" py={6} color="text.secondary">
          <GradeIcon sx={{ fontSize: 60, opacity: 0.2, mb: 1 }} />
          <Typography>Sélectionnez une classe pour voir les notes.</Typography>
        </Box>
      )}

      {filterClasse && !filterEval && evaluations.length === 0 && !loadingRef && (
        <Alert severity="info">
          Aucune évaluation trouvée pour cette classe
          {filterTrimestre ? ' et ce trimestre' : ''}.
        </Alert>
      )}

      {filterClasse && !filterEval && evaluations.length > 0 && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight="bold" mb={2}>
              {evaluations.length} évaluation(s) — sélectionnez-en une pour voir les notes
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead sx={{ bgcolor: 'grey.100' }}>
                  <TableRow>
                    <TableCell><strong>Matière</strong></TableCell>
                    <TableCell><strong>Type</strong></TableCell>
                    <TableCell><strong>Trimestre</strong></TableCell>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Coef</strong></TableCell>
                    <TableCell><strong>Statut</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {evaluations.map(e => (
                    <TableRow key={e.id} hover
                      sx={{ cursor: 'pointer', bgcolor: !e.is_active ? '#fff8e1' : 'inherit' }}
                      onClick={() => setFilterEval(String(e.id))}>
                      <TableCell><strong>{e.matiere_nom}</strong></TableCell>
                      <TableCell>
                        <Chip label={TYPE_LABELS[e.type] || e.type} color={TYPE_COLORS[e.type] || 'default'} size="small" />
                      </TableCell>
                      <TableCell>{e.trimestre_nom}</TableCell>
                      <TableCell>{e.date || '—'}</TableCell>
                      <TableCell>{e.coefficient}</TableCell>
                      <TableCell>
                        <Chip label={e.is_active ? 'Active' : 'Annulée'}
                          color={e.is_active ? 'success' : 'default'}
                          size="small" variant={e.is_active ? 'filled' : 'outlined'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {filterEval && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <CardContent>
            {/* En-tête évaluation */}
            {evalSelected && (
              <Box mb={2}>
                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                  <Chip label={TYPE_LABELS[evalSelected.type] || evalSelected.type}
                    color={TYPE_COLORS[evalSelected.type] || 'default'} />
                  <Typography variant="h6" fontWeight="bold">{evalSelected.matiere_nom}</Typography>
                  <Typography color="text.secondary">·</Typography>
                  <Typography color="text.secondary">{evalSelected.trimestre_nom}</Typography>
                  {evalSelected.date && (
                    <><Typography color="text.secondary">·</Typography>
                    <Typography color="text.secondary">{evalSelected.date}</Typography></>
                  )}
                  <Typography color="text.secondary">· Coef {evalSelected.coefficient}</Typography>
                </Box>
                {moyenne && (
                  <Box mt={1} display="flex" gap={2}>
                    <Chip
                      label={`Moyenne classe : ${moyenne}/20`}
                      color={parseFloat(moyenne) >= 10 ? 'success' : 'error'}
                      sx={{ fontWeight: 'bold' }}
                    />
                    <Chip label={`${notes.length} note(s) saisie(s)`} variant="outlined" />
                  </Box>
                )}
              </Box>
            )}
            <Divider sx={{ mb: 2 }} />

            {loadingNotes ? (
              <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
            ) : notes.length === 0 ? (
              <Box textAlign="center" py={3}>
                <Typography color="text.secondary">Aucune note saisie pour cette évaluation.</Typography>
                <Typography variant="caption" color="text.secondary">
                  Allez dans Mes Cours pour saisir les notes.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell><strong>#</strong></TableCell>
                      <TableCell><strong>Élève</strong></TableCell>
                      <TableCell><strong>Matricule</strong></TableCell>
                      <TableCell align="center"><strong>Note /20</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {notes.map((n, i) => (
                      <TableRow key={n.id} hover>
                        <TableCell sx={{ color: 'text.secondary', width: 40 }}>{i + 1}</TableCell>
                        <TableCell>
                          <Typography fontWeight="medium" variant="body2">
                            {n.eleve_nom} {n.eleve_prenom}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">{n.eleve_matricule || '—'}</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 56, height: 32, borderRadius: 2, fontWeight: 'bold',
                            bgcolor: parseFloat(n.valeur) >= 10 ? '#e8f5e9' : '#ffebee',
                            color: parseFloat(n.valeur) >= 10 ? '#2e7d32' : '#c62828',
                          }}>
                            {fmt(parseFloat(n.valeur))}
                          </Box>
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
    </Box>
  );
}
