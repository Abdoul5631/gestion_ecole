import { useEffect, useState } from 'react';
import api from 'services/api';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import {
  Box, Typography, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Chip, Alert
} from '@mui/material';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';

import { estEnLigne } from 'offline/reseau';
const TYPE_LABELS = {
  DEVOIR1: 'Devoir 1',
  DEVOIR2: 'Devoir 2',
  COMPOSITION: 'Composition',
  EXAMEN_BLANC: 'Examen blanc',
  INTERROGATION: 'Interrogation',
  INTERRO: 'Interrogation'
};

const TYPE_ORDER = {
  DEVOIR1: 1,
  DEVOIR2: 2,
  INTERROGATION: 3,
  INTERRO: 3,
  COMPOSITION: 4,
  EXAMEN_BLANC: 5
};

function typeCode(n) {
  return n.type_evaluation || n.type || '';
}

function trimestreNom(n) {
  return n.trimestre_nom || n.trimestre || 'Trimestre';
}

function trimestreIndex(nom) {
  const digits = String(nom || '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 99;
}

function noteSur(n) {
  const sur = parseFloat(n.note_sur ?? n.evaluation_note_sur);
  return sur > 0 ? sur : 20;
}

function valeurSur20(n) {
  const v = parseFloat(n.valeur);
  if (Number.isNaN(v)) return 0;
  return (v / noteSur(n)) * 20;
}

function coefficient(n) {
  const c = parseFloat(n.coefficient);
  return c > 0 ? c : 1;
}

function moyennePonderee(notes) {
  let total = 0;
  let coefs = 0;
  notes.forEach((n) => {
    const c = coefficient(n);
    total += valeurSur20(n) * c;
    coefs += c;
  });
  return coefs ? total / coefs : 0;
}

function typeAffiche(n) {
  return (
    TYPE_LABELS[typeCode(n)]
    || n.type_libelle
    || n.evaluation_libelle
    || n.evaluation_type
    || n.type_evaluation
    || 'Évaluation'
  ).toString().trim();
}

function libelleNote(n, used) {
  const base = typeAffiche(n);

  let label = base || 'Évaluation';
  const court = (() => {
    const idx = trimestreIndex(trimestreNom(n));
    return idx >= 1 && idx <= 3 ? `T${idx}` : '';
  })();
  if (court && !label.toUpperCase().includes(court)) {
    label = `${label} ${court}`;
  }

  if (used.has(label) && n.date) {
    label = `${label} (${formatDate(n.date)})`;
  }
  let unique = label;
  let i = 2;
  while (used.has(unique)) {
    unique = `${label} (${i})`;
    i += 1;
  }
  used.add(unique);
  return unique;
}

function formatDate(value) {
  if (!value) return '';
  const parts = String(value).split('T')[0].split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(value);
}

function sortNotes(a, b) {
  const ta = trimestreIndex(trimestreNom(a)) - trimestreIndex(trimestreNom(b));
  if (ta !== 0) return ta;
  const da = a.date || '';
  const db = b.date || '';
  if (da !== db) return da < db ? -1 : 1;
  return (TYPE_ORDER[typeCode(a)] || 9) - (TYPE_ORDER[typeCode(b)] || 9);
}

function grouperParTrimestre(notes) {
  const groups = {};
  notes.forEach((n) => {
    const key = trimestreNom(n);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });
  return Object.entries(groups).sort(
    (a, b) => trimestreIndex(a[0]) - trimestreIndex(b[0])
  );
}

export default function MesNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const role = authService.getRole();
  const { enfants, selectedId: enfantId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  useEffect(() => {
    if (role === 'PARENT' && loadingEnfants) return;
    if (role === 'PARENT' && !enfantId) { setLoading(false); setNotes([]); return; }

    setLoading(true);
    setError('');
    const eleveKey = role === 'PARENT' ? enfantId : 'me';
    const url = role === 'PARENT'
      ? `/notes/?eleve_id=${enfantId}&page_size=500`
      : '/notes/?page_size=500';
    readThrough(CacheKeys.notesEleve(eleveKey), async () => {
      const res = await api.get(url);
      return Array.isArray(res.data) ? res.data : res.data.results ?? [];
    })
      .then((r) => {
        if (r.neverCached) {
          setError(NEVER_CACHED_MSG);
          setNotes([]);
        } else {
          setNotes(r.data || []);
        }
      })
      .catch(() => setError(estEnLigne() ? 'Erreur de chargement' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, [enfantId, loadingEnfants, role]);

  const grouped = notes.reduce((acc, n) => {
    const key = n.matiere || n.matiere_nom || 'Inconnu';
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={2}>
        {role === 'PARENT' ? 'Notes de mes enfants' : 'Mes Notes par Matière'}
      </Typography>

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={enfantId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {role === 'PARENT' && !loadingEnfants && enfants.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Aucun enfant lié à votre compte. Contactez l'administration pour lier vos enfants.
        </Alert>
      )}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : notes.length === 0 ? (
        <Alert severity="info">Aucune note enregistrée pour le moment.</Alert>
      ) : (
        <Grid container spacing={3}>
          {Object.entries(grouped).map(([matiere, mNotes]) => {
            const sorted = [...mNotes].sort(sortNotes);
            const avg = moyennePonderee(sorted);
            const usedLabels = new Set();
            const trimestres = grouperParTrimestre(sorted);
            return (
              <Grid size={{ xs: 12, md: 6 }} key={matiere}>
                <Card elevation={2}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5} gap={1}>
                      <Typography variant="h6" fontWeight="bold">{matiere}</Typography>
                      <Chip label={`Moyenne : ${avg.toFixed(2)} / 20`} color={avg >= 10 ? 'success' : 'error'} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={2}>
                      Moyenne de la matière : chaque note est ramenée sur 20 puis pondérée par son coefficient
                      (une composition compte souvent double).
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead sx={{ bgcolor: 'grey.50' }}>
                          <TableRow>
                            <TableCell>Type</TableCell>
                            <TableCell align="right">Note</TableCell>
                            <TableCell align="right">Sur</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {trimestres.map(([trimestre, tNotes]) => {
                            const moyT = moyennePonderee(tNotes);
                            return [
                              <TableRow key={`${matiere}-${trimestre}-h`}>
                                <TableCell colSpan={3} sx={{ bgcolor: 'grey.100', py: 0.75 }}>
                                  <Box display="flex" justifyContent="space-between" alignItems="center">
                                    <Typography variant="subtitle2" fontWeight="bold">{trimestre}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Moyenne {trimestreIndex(trimestre) <= 3 ? `T${trimestreIndex(trimestre)}` : ''} : {moyT.toFixed(2)} / 20
                                    </Typography>
                                  </Box>
                                </TableCell>
                              </TableRow>,
                              ...tNotes.map((n) => (
                                <TableRow key={n.id}>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight="medium">
                                      {libelleNote(n, usedLabels)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {[formatDate(n.date), `coef ${coefficient(n)}`].filter(Boolean).join(' · ')}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right"><strong>{n.valeur ?? '—'}</strong></TableCell>
                                  <TableCell align="right">/{noteSur(n)}</TableCell>
                                </TableRow>
                              ))
                            ];
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
