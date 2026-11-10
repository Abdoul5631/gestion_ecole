import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Collapse, Grid, IconButton,
  LinearProgress, MenuItem, TextField, Tooltip, Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import api, { classeService, getResults } from 'services/api';
import { readThrough, scopedKey, NEVER_CACHED_MSG } from 'offline/cacheStore';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function isoLocal(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function decaler(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return isoLocal(d);
}

function libelleDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${JOURS[d.getDay()]} ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;
}

function Stat({ label, value, color, icon, detail, progression }) {
  return (
    <Card sx={{
      borderRadius: 3, height: '100%', position: 'relative', overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)', transition: 'transform 0.15s, box-shadow 0.15s',
      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 18px rgba(0,0,0,0.09)' },
      '&::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, bgcolor: `${color}.main` },
    }}>
      <CardContent sx={{ p: { xs: 1.75, sm: 2.25 }, '&:last-child': { pb: { xs: 1.75, sm: 2.25 } } }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Box sx={(t) => ({
            width: { xs: 40, sm: 48 }, height: { xs: 40, sm: 48 }, borderRadius: 2.5, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: alpha(t.palette[color].main, 0.12), color: `${color}.main`,
          })}>
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: 24, sm: 30 }, lineHeight: 1.1 }}>{value ?? 0}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.25 }}>{label}</Typography>
          </Box>
        </Box>
        {progression !== undefined && (
          <LinearProgress variant="determinate" value={progression}
            sx={(t) => ({ mt: 1.5, height: 6, borderRadius: 3, bgcolor: alpha(t.palette[color].main, 0.12),
              '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: `${color}.main` } })} />
        )}
        {detail && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: progression !== undefined ? 0.5 : 1 }}>{detail}</Typography>}
      </CardContent>
    </Card>
  );
}

function LigneCours({ cours }) {
  const [ouvert, setOuvert] = useState(false);
  const aSuivre = cours.a_suivre || [];
  return (
    <Box sx={{ py: 1.25, borderBottom: '1px dashed', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1} flexWrap="wrap">
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={700}>{cours.matiere_nom}</Typography>
          <Typography variant="body2" color="text.secondary">
            {cours.horaires.length ? `${cours.horaires.join(', ')} · ` : ''}{cours.enseignant_nom || 'Enseignant non affecté'}
          </Typography>
        </Box>
        {cours.fait ? (
          <Box display="flex" gap={0.75} flexWrap="wrap" alignItems="center">
            <Chip size="small" icon={<CheckCircleIcon />} color="success" label="Appel fait" />
            <Chip size="small" variant="outlined" color="success" label={`${cours.presents} présent${cours.presents > 1 ? 's' : ''}`} />
            <Chip size="small" variant={cours.absents ? 'filled' : 'outlined'} color={cours.absents ? 'error' : 'default'}
              label={`${cours.absents} absent${cours.absents > 1 ? 's' : ''}`} />
            {cours.retards > 0 && <Chip size="small" color="warning" label={`${cours.retards} retard${cours.retards > 1 ? 's' : ''}`} />}
            {aSuivre.length > 0 && (
              <Tooltip title={ouvert ? 'Masquer la liste' : 'Voir les absents'}>
                <IconButton size="small" onClick={() => setOuvert(!ouvert)} aria-label="Voir les absents"
                  sx={{ transform: ouvert ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
                  <ExpandMoreIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ) : (
          <Chip size="small" icon={<HourglassEmptyIcon />} color="warning" variant="outlined" label="Appel pas encore fait" />
        )}
      </Box>
      <Collapse in={ouvert}>
        <Box sx={{ mt: 1, pl: 1 }}>
          {aSuivre.map((e) => (
            <Box key={`${e.eleve_id}-${e.statut}`} display="flex" justifyContent="space-between" gap={1} py={0.25}>
              <Typography variant="body2">{e.nom} <Typography component="span" variant="caption" color="text.secondary">({e.matricule})</Typography></Typography>
              <Chip size="small" color={e.statut === 'ABSENT' ? 'error' : 'warning'} label={e.statut === 'ABSENT' ? 'Absent' : 'Retard'} />
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function AppelDuJour() {
  const [date, setDate] = useState(() => isoLocal(new Date()));
  const [classeId, setClasseId] = useState('');
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    classeService.getAll().then((res) => setClasses(getResults(res).items)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    const q = `?date=${date}${classeId ? `&classe_id=${classeId}` : ''}`;
    readThrough(scopedKey(`appel-du-jour:${date}:${classeId || 'all'}`), async () => (await api.get(`/presences/appel-du-jour/${q}`)).data)
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        setData(r.data);
      })
      .catch(() => setError("Impossible de charger l'appel du jour."))
      .finally(() => setLoading(false));
  }, [date, classeId]);

  const resume = data?.resume;
  const classesJour = useMemo(() => data?.classes || [], [data]);
  const estWeekEnd = data && !data.jour;

  return (
    <Box>
      <Typography variant="h3" fontWeight="bold" sx={{ mb: 0.5 }}>Appel du jour</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Les appels faits par les enseignants pendant leurs cours, par classe et par matière.
      </Typography>

      <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={2}>
        <IconButton onClick={() => setDate(decaler(date, -1))} aria-label="Jour précédent"><ChevronLeftIcon /></IconButton>
        <TextField type="date" size="small" value={date} onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value >= '2000-01-01' && setDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ minWidth: 170 }} />
        <IconButton onClick={() => setDate(decaler(date, 1))} aria-label="Jour suivant"><ChevronRightIcon /></IconButton>
        <TextField select size="small" label="Classe" value={classeId} onChange={(e) => setClasseId(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Toutes les classes</MenuItem>
          {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom_complet || c.nom}</MenuItem>)}
        </TextField>
      </Box>
      <Typography fontWeight={600} sx={{ mb: 2, textTransform: 'capitalize' }}>{libelleDate(date)}</Typography>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : (
        <>
          {resume && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {(() => {
                const prevus = resume.cours_prevus || 0;
                const pct = prevus ? Math.round(((resume.cours_appeles || 0) / prevus) * 100) : 0;
                return (
                  <>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Stat label="Cours prévus" value={prevus} color="primary" icon={<MenuBookIcon />} detail="Selon l'emploi du temps" />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Stat label="Appels faits" value={resume.cours_appeles} color="success" icon={<CheckCircleIcon />}
                        progression={pct} detail={prevus ? `${pct} % des cours` : 'Aucun cours prévu'} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Stat label="Appels manquants" value={resume.cours_non_appeles} color="warning" icon={<HourglassEmptyIcon />}
                        detail={resume.cours_non_appeles ? 'Enseignants à relancer' : 'Tout est à jour'} />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Stat label="Absences" value={resume.absences} color="error" icon={<PersonOffIcon />}
                        detail={resume.absences ? 'Élèves signalés absents' : 'Aucun absent signalé'} />
                    </Grid>
                  </>
                );
              })()}
            </Grid>
          )}

          {classesJour.length === 0 ? (
            <Card sx={{ borderRadius: 3 }}>
              <CardContent sx={{ textAlign: 'center', py: 5 }}>
                <Typography color="text.secondary">
                  {estWeekEnd ? 'Pas de cours le dimanche.' : "Aucun cours prévu ni aucun appel enregistré ce jour-là."}
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Box display="flex" flexDirection="column" gap={2}>
              {classesJour.map((c) => (
                <Card key={c.classe_id} sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={1} flexWrap="wrap">
                      <Typography variant="h5" fontWeight={700}>{c.classe_nom}</Typography>
                      <Chip size="small" variant="outlined" label={`${c.effectif} élève${c.effectif > 1 ? 's' : ''}`} />
                    </Box>
                    {c.cours.map((cours) => <LigneCours key={cours.classe_matiere_id} cours={cours} />)}
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
