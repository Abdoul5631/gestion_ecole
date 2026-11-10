import { useEffect, useMemo, useState } from 'react';
import api, { anneeService, getResults } from 'services/api';
import { readThrough, scopedKey, NEVER_CACHED_MSG } from 'offline/cacheStore';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, InputAdornment, MenuItem,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography
} from '@mui/material';
import GradeIcon from '@mui/icons-material/Grade';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';

const TYPE_LABELS = { DEVOIR1: 'Devoir 1', DEVOIR2: 'Devoir 2', COMPOSITION: 'Composition' };

const couleur = (v) => (v >= 10 ? { bg: '#e8f5e9', fg: '#2e7d32' } : { bg: '#ffebee', fg: '#c62828' });
const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

function Pastille({ valeur }) {
  if (valeur === null || valeur === undefined) return <Typography color="text.disabled">—</Typography>;
  const c = couleur(valeur);
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 52, height: 30,
      px: 1, borderRadius: 2, fontWeight: 700, bgcolor: c.bg, color: c.fg,
    }}>
      {fmt(valeur)}
    </Box>
  );
}

function Stat({ label, value, sub, color = 'primary' }) {
  return (
    <Card sx={{ borderRadius: 3, height: '100%' }}>
      <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="h3" fontWeight="bold" color={`${color}.main`}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
      </CardContent>
    </Card>
  );
}

export default function MesNotes() {
  const [cours, setCours] = useState([]);
  const [trimestres, setTrimestres] = useState([]);
  const [coursId, setCoursId] = useState('');
  const [trimestreId, setTrimestreId] = useState('');
  const [carnet, setCarnet] = useState(null);
  const [loadingRef, setLoadingRef] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState('nom'); // 'nom' | 'moyenne'

  // Cours de l'enseignant + trimestres de l'année en cours
  useEffect(() => {
    (async () => {
      try {
        const [cmRes, anRes] = await Promise.all([api.get('/classe-matieres/'), anneeService.getActive().catch(() => null)]);
        const cms = getResults(cmRes).items.filter((c) => c.classe);
        cms.sort((a, b) => `${a.classe_nom}${a.matiere_nom}`.localeCompare(`${b.classe_nom}${b.matiere_nom}`));
        const anneeId = anRes?.data?.id;
        const trRes = await api.get(`/trimestres/${anneeId ? `?annee_id=${anneeId}` : ''}`);
        const tris = getResults(trRes).items;
        setCours(cms);
        setTrimestres(tris);
        if (tris.length) setTrimestreId(String(tris[0].id));
        // Ouvre directement le premier cours qui a déjà des évaluations
        let premier = cms[0];
        if (tris.length) {
          try {
            const evRes = await api.get(`/evaluations/?trimestre_id=${tris[0].id}`);
            const avecEval = new Set(getResults(evRes).items.map((e) => e.classe_matiere));
            premier = cms.find((c) => avecEval.has(c.id)) || cms[0];
          } catch { /* on garde le premier cours */ }
        }
        if (premier) setCoursId(String(premier.id));
      } catch {
        setError('Erreur de chargement des données.');
      } finally {
        setLoadingRef(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!coursId || !trimestreId) return;
    setLoading(true);
    setError('');
    readThrough(scopedKey(`carnet:${coursId}:${trimestreId}`), async () => (
      (await api.get(`/evaluations/carnet/?classe_matiere_id=${coursId}&trimestre_id=${trimestreId}`)).data
    ))
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        setCarnet(r.data);
      })
      .catch(() => setError('Impossible de charger le carnet de notes.'))
      .finally(() => setLoading(false));
  }, [coursId, trimestreId]);

  const eleves = useMemo(() => {
    let list = carnet?.eleves || [];
    const q = recherche.trim().toLowerCase();
    if (q) list = list.filter((e) => `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(q));
    if (tri === 'moyenne') {
      list = [...list].sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));
    }
    return list;
  }, [carnet, recherche, tri]);

  const exporterCsv = () => {
    if (!carnet) return;
    const evs = carnet.evaluations;
    const entete = ['Rang', 'Matricule', 'Nom', 'Prénom', ...evs.map((e) => `${TYPE_LABELS[e.type] || e.type}${e.date ? ` (${e.date})` : ''}`), 'Moyenne /20'];
    const lignes = carnet.eleves.map((e) => [
      e.rang ?? '', e.matricule, e.nom, e.prenom, ...evs.map((ev) => e.notes[String(ev.id)] ?? ''), e.moyenne ?? '',
    ]);
    const csv = [entete, ...lignes].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notes-${carnet.classe_matiere.classe_nom}-${carnet.classe_matiere.matiere_nom}-${carnet.trimestre.nom}.csv`.replace(/\s+/g, '_');
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const stats = carnet?.stats;
  const evs = carnet?.evaluations || [];

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={0.5}>
        <GradeIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold">Carnet de notes</Typography>
      </Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Choisissez votre cours : tous les élèves de la classe s&apos;affichent avec leurs notes, leur moyenne et leur rang.
      </Typography>

      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
        <CardContent>
          {loadingRef ? (
            <Box display="flex" justifyContent="center" p={1}><CircularProgress size={24} /></Box>
          ) : cours.length === 0 ? (
            <Alert severity="info">
              Aucune classe ne vous est affectée pour le moment. Demandez à la direction de vous affecter une matière dans une classe.
            </Alert>
          ) : (
            <Grid container spacing={2} alignItems="center">
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select fullWidth size="small" label="Mon cours (classe — matière)" value={coursId}
                  onChange={(e) => setCoursId(e.target.value)}>
                  {cours.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.classe_nom} — {c.matiere_nom}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField select fullWidth size="small" label="Trimestre" value={trimestreId}
                  onChange={(e) => setTrimestreId(e.target.value)}>
                  {trimestres.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.nom}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : carnet && (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Stat label="Moyenne de la classe" value={stats.moyenne_classe === null ? '—' : fmt(stats.moyenne_classe)}
                sub="sur 20" color={stats.moyenne_classe >= 10 ? 'success' : 'error'} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Stat label="Taux de réussite" value={stats.taux_reussite === null ? '—' : `${stats.taux_reussite}%`} sub="moyenne ≥ 10" color="primary" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Stat label="Meilleure moyenne" value={fmt(stats.meilleure)} color="success" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Stat label="Plus faible" value={fmt(stats.plus_faible)} color="warning" />
            </Grid>
          </Grid>

          {evs.length === 0 ? (
            <Alert severity="info">
              Aucune évaluation pour {carnet.classe_matiere.matiere_nom} en {carnet.classe_matiere.classe_nom} ce trimestre.
              Les notes saisies depuis « Mes cours » apparaîtront ici.
            </Alert>
          ) : (
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} mb={2}>
                  <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                    <Typography variant="h5" fontWeight={700}>
                      {carnet.classe_matiere.classe_nom} — {carnet.classe_matiere.matiere_nom}
                    </Typography>
                    <Chip size="small" variant="outlined" label={`${stats.effectif} élève${stats.effectif > 1 ? 's' : ''}`} />
                    {stats.sans_note > 0 && <Chip size="small" color="warning" variant="outlined" label={`${stats.sans_note} sans note`} />}
                  </Box>
                  <Box display="flex" gap={1} flexWrap="wrap">
                    <TextField size="small" placeholder="Rechercher un élève…" value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                    <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exporterCsv}>Télécharger</Button>
                  </Box>
                </Box>

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'grey.100' }}>
                      <TableRow>
                        <TableCell><strong>Élève</strong></TableCell>
                        {evs.map((e) => (
                          <TableCell key={e.id} align="center">
                            <strong>{TYPE_LABELS[e.type] || e.type}</strong>
                            <Typography variant="caption" display="block" color="text.secondary">
                              {e.date ? new Date(`${e.date}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : ''} · coef {e.coefficient}
                            </Typography>
                          </TableCell>
                        ))}
                        <TableCell align="center">
                          <TableSortLabel active={tri === 'moyenne'} direction="desc"
                            onClick={() => setTri(tri === 'moyenne' ? 'nom' : 'moyenne')}>
                            <strong>Moyenne</strong>
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="center"><strong>Rang</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {eleves.length === 0 ? (
                        <TableRow><TableCell colSpan={evs.length + 3} align="center">Aucun élève trouvé</TableCell></TableRow>
                      ) : eleves.map((e) => (
                        <TableRow key={e.eleve_id} hover>
                          <TableCell>
                            <Typography fontWeight={600} variant="body2">{e.prenom} {e.nom}</Typography>
                            <Typography variant="caption" color="text.secondary">{e.matricule}</Typography>
                          </TableCell>
                          {evs.map((ev) => (
                            <TableCell key={ev.id} align="center"><Pastille valeur={e.notes[String(ev.id)]} /></TableCell>
                          ))}
                          <TableCell align="center"><Pastille valeur={e.moyenne} /></TableCell>
                          <TableCell align="center">{e.rang ? `${e.rang}${e.rang === 1 ? 'er' : 'e'}` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  La moyenne est pondérée par les coefficients des évaluations, sur 20. Cliquez sur « Moyenne » pour classer du meilleur au plus faible.
                </Typography>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
