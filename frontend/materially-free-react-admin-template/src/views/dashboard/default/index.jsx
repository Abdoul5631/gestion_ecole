import { useEffect, useState } from 'react';
import Grid from '@mui/material/Grid';
import {
  Box, Card, CardContent, Typography, CircularProgress,
  List, ListItem, ListItemText, Divider, Chip, Avatar, LinearProgress, Alert
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import ClassIcon from '@mui/icons-material/Class';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GradeIcon from '@mui/icons-material/Grade';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import api from 'services/api';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { GRID_SPACING } from 'config';

// Couleurs avatar basées sur la première lettre
const AVATAR_COLORS = ['#1976d2','#388e3c','#f57c00','#7b1fa2','#c62828','#0288d1','#00796b','#5d4037'];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const TYPE_COLORS = { DEVOIR1: 'primary', DEVOIR2: 'secondary', COMPOSITION: 'warning', EXAMEN_BLANC: 'error' };
const TYPE_LABELS = { DEVOIR1: 'Devoir 1', DEVOIR2: 'Devoir 2', COMPOSITION: 'Compo', EXAMEN_BLANC: 'Examen Blanc' };

function StatCard({ title, value, icon, gradient, loading }) {
  return (
    <Card sx={{
      background: gradient, color: 'white', height: '100%',
      borderRadius: 3, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-4px)' }
    }}>
      <CardContent sx={{ p: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 500, mb: 0.5 }}>
              {title}
            </Typography>
            {loading
              ? <CircularProgress size={28} sx={{ color: 'white', mt: 0.5 }} />
              : <Typography variant="h3" fontWeight="bold" color="white" lineHeight={1.2}>{value}</Typography>
            }
          </Box>
          <Box sx={{
            bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2.5,
            width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Dashboard Admin ───────────────────────
function DashboardAdmin() {
  const [stats, setStats] = useState({ eleves: 0, enseignants: 0, matieres: 0, classes: 0 });
  const [eleves, setEleves] = useState([]);
  const [presences, setPresences] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [allPresences, setAllPresences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/eleves/'),
      api.get('/enseignants/'),
      api.get('/matieres/'),
      api.get('/classes/'),
      api.get('/presences/'),
    ]).then(([elevRes, ensRes, matRes, clsRes, presRes]) => {
      setStats({
        eleves: elevRes.data.length,
        enseignants: ensRes.data.length,
        matieres: matRes.data.length,
        classes: clsRes.data.length,
      });
      setEleves(elevRes.data.slice(0, 5));
      setAllPresences(presRes.data);
      setPresences(presRes.data.slice(0, 5));
    }).finally(() => setLoading(false));

    api.get('/evaluations/').then(res => setEvaluations(res.data.slice(0, 5))).catch(() => {});
  }, []);

  const presents = allPresences.filter(p => p.statut === 'PRESENT').length;
  const tauxPresence = allPresences.length > 0
    ? Math.round((presents / allPresences.length) * 100)
    : 0;

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Box>
      {/* Bandeau de bienvenue */}
      <Card sx={{
        mb: 3, background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #42a5f5 100%)',
        borderRadius: 3, boxShadow: '0 8px 32px rgba(25,118,210,0.3)', overflow: 'hidden', position: 'relative'
      }}>
        <CardContent sx={{ p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h5" fontWeight="bold" color="white">Tableau de bord</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.8)', mt: 0.5, fontSize: 14 }}>
                {today.charAt(0).toUpperCase() + today.slice(1)}
              </Typography>
            </Box>
            <Box sx={{ opacity: 0.15, position: 'absolute', right: 24 }}>
              <SchoolIcon sx={{ fontSize: 100, color: 'white' }} />
            </Box>
            <Box display="flex" gap={2}>
              <Box sx={{ textAlign: 'center', bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2, px: 2, py: 1 }}>
                <Typography variant="h5" fontWeight="bold" color="white">{tauxPresence}%</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Taux de présence</Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={GRID_SPACING}>
        {/* Stat cards */}
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Total Élèves" value={stats.eleves}
            icon={<PeopleIcon sx={{ color: 'white', fontSize: 26 }} />}
            gradient="linear-gradient(135deg, #1976d2, #42a5f5)" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Enseignants" value={stats.enseignants}
            icon={<SchoolIcon sx={{ color: 'white', fontSize: 26 }} />}
            gradient="linear-gradient(135deg, #2e7d32, #66bb6a)" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Classes" value={stats.classes}
            icon={<ClassIcon sx={{ color: 'white', fontSize: 26 }} />}
            gradient="linear-gradient(135deg, #7b1fa2, #ba68c8)" loading={loading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard title="Matières" value={stats.matieres}
            icon={<GradeIcon sx={{ color: 'white', fontSize: 26 }} />}
            gradient="linear-gradient(135deg, #e65100, #ffa726)" loading={loading} />
        </Grid>

        {/* Taux de présence global */}
        <Grid size={12}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Box display="flex" alignItems="center" gap={1}>
                  <TrendingUpIcon color="primary" />
                  <Typography variant="subtitle1" fontWeight="bold">Taux de présence global</Typography>
                </Box>
                <Typography variant="h6" fontWeight="bold"
                  color={tauxPresence >= 75 ? 'success.main' : tauxPresence >= 50 ? 'warning.main' : 'error.main'}>
                  {tauxPresence}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate" value={tauxPresence}
                sx={{
                  height: 10, borderRadius: 5,
                  bgcolor: 'grey.200',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    background: tauxPresence >= 75
                      ? 'linear-gradient(90deg, #2e7d32, #66bb6a)'
                      : tauxPresence >= 50
                      ? 'linear-gradient(90deg, #f57c00, #ffa726)'
                      : 'linear-gradient(90deg, #c62828, #ef5350)',
                  }
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {presents} présences sur {allPresences.length} enregistrées
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Derniers élèves */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', height: '100%',
            borderTop: '4px solid #1976d2' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <PeopleIcon sx={{ color: '#1976d2' }} />
                <Typography variant="h6" fontWeight="bold">Derniers Élèves</Typography>
              </Box>
              {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
                <List dense disablePadding>
                  {eleves.length === 0
                    ? <Typography color="text.secondary" variant="body2">Aucun élève</Typography>
                    : eleves.map((e, i) => (
                      <Box key={e.id}>
                        <ListItem sx={{ px: 0 }}>
                          <Avatar sx={{
                            mr: 1.5, width: 38, height: 38, fontSize: 15, fontWeight: 'bold',
                            bgcolor: avatarColor(e.prenom)
                          }}>
                            {e.prenom?.[0]?.toUpperCase() || '?'}
                          </Avatar>
                          <ListItemText
                            primary={<Typography fontWeight="medium" variant="body2">{e.nom} {e.prenom}</Typography>}
                            secondary={<Typography variant="caption" color="text.secondary">{e.matricule}</Typography>}
                          />
                          {e.niveau_actuel && (
                            <Chip label={e.niveau_actuel} size="small"
                              sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 'bold', fontSize: 11 }} />
                          )}
                        </ListItem>
                        {i < eleves.length - 1 && <Divider />}
                      </Box>
                    ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Dernières évaluations */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', height: '100%',
            borderTop: '4px solid #7b1fa2' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <AssignmentIcon sx={{ color: '#7b1fa2' }} />
                <Typography variant="h6" fontWeight="bold">Dernières Évaluations</Typography>
              </Box>
              {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
                <List dense disablePadding>
                  {evaluations.length === 0
                    ? <Typography color="text.secondary" variant="body2">Aucune évaluation</Typography>
                    : evaluations.map((ev, i) => (
                      <Box key={ev.id}>
                        <ListItem sx={{ px: 0 }}>
                          <Box sx={{
                            width: 4, height: 40, borderRadius: 2, mr: 1.5, flexShrink: 0,
                            bgcolor: ev.type === 'EXAMEN_BLANC' ? '#d32f2f' : ev.type === 'COMPOSITION' ? '#f57c00' : ev.type === 'DEVOIR2' ? '#7b1fa2' : '#1976d2'
                          }} />
                          <ListItemText
                            primary={<Typography fontWeight="medium" variant="body2">{ev.matiere_nom} — {ev.classe_nom}</Typography>}
                            secondary={<Typography variant="caption" color="text.secondary">{ev.trimestre_nom} · Coef {ev.coefficient}</Typography>}
                          />
                          <Chip
                            label={TYPE_LABELS[ev.type] || ev.type}
                            color={TYPE_COLORS[ev.type] || 'default'}
                            size="small" sx={{ fontSize: 11 }}
                          />
                        </ListItem>
                        {i < evaluations.length - 1 && <Divider />}
                      </Box>
                    ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Dernières présences */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', height: '100%',
            borderTop: '4px solid #2e7d32' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <EventNoteIcon sx={{ color: '#2e7d32' }} />
                <Typography variant="h6" fontWeight="bold">Dernières Présences</Typography>
              </Box>
              {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
                <List dense disablePadding>
                  {presences.length === 0
                    ? <Typography color="text.secondary" variant="body2">Aucune présence</Typography>
                    : presences.map((p, i) => (
                      <Box key={p.id}>
                        <ListItem sx={{ px: 0 }}>
                          <Avatar sx={{
                            mr: 1.5, width: 34, height: 34, fontSize: 13,
                            bgcolor: avatarColor(p.eleve_nom)
                          }}>
                            {p.eleve_nom?.[0]?.toUpperCase() || '?'}
                          </Avatar>
                          <ListItemText
                            primary={<Typography fontWeight="medium" variant="body2">{p.eleve_nom} {p.eleve_prenom}</Typography>}
                            secondary={<Typography variant="caption" color="text.secondary">{p.date}</Typography>}
                          />
                          <Chip
                            label={p.statut === 'PRESENT' ? 'Présent' : p.statut === 'ABSENT' ? 'Absent' : p.statut === 'RETARD' ? 'Retard' : 'Excusé'}
                            color={p.statut === 'PRESENT' ? 'success' : p.statut === 'ABSENT' ? 'error' : p.statut === 'RETARD' ? 'warning' : 'info'}
                            size="small" sx={{ fontSize: 11 }}
                          />
                        </ListItem>
                        {i < presences.length - 1 && <Divider />}
                      </Box>
                    ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ─── Dashboard Enseignant ──────────────────
function DashboardEnseignant() {
  const [classeMatieres, setClasseMatieres] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [presences, setPresences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/classe-matieres/'),
      api.get('/evaluations/'),
      api.get('/presences/'),
    ]).then(([cmRes, evalRes, presRes]) => {
      setClasseMatieres(cmRes.data);
      setEvaluations(evalRes.data.slice(0, 5));
      setPresences(presRes.data.slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  const tauxPresence = presences.length > 0
    ? Math.round((presences.filter(p => p.statut === 'PRESENT').length / presences.length) * 100)
    : 0;

  return (
    <Grid container spacing={GRID_SPACING}>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title="Mes Cours" value={classeMatieres.length} icon={<ClassIcon sx={{ color: 'white', fontSize: 26 }} />} gradient="linear-gradient(135deg, #1976d2, #42a5f5)" loading={loading} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title="Évaluations" value={evaluations.length} icon={<AssignmentIcon sx={{ color: 'white', fontSize: 26 }} />} gradient="linear-gradient(135deg, #7b1fa2, #ba68c8)" loading={loading} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title="Présences" value={presences.length} icon={<EventNoteIcon sx={{ color: 'white', fontSize: 26 }} />} gradient="linear-gradient(135deg, #2e7d32, #66bb6a)" loading={loading} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
        <StatCard title="Taux Présence" value={`${tauxPresence}%`} icon={<GradeIcon sx={{ color: 'white', fontSize: 26 }} />} gradient="linear-gradient(135deg, #e65100, #ffa726)" loading={loading} />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderTop: '4px solid #1976d2' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ClassIcon sx={{ color: '#1976d2' }} />
              <Typography variant="h6" fontWeight="bold">Mes Cours Assignés</Typography>
            </Box>
            {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
              <List dense disablePadding>
                {classeMatieres.length === 0
                  ? <Typography color="text.secondary" variant="body2">Aucun cours assigné</Typography>
                  : classeMatieres.slice(0, 5).map((cm, i) => (
                    <Box key={cm.id}>
                      <ListItem sx={{ px: 0 }}>
                        <Avatar sx={{ mr: 1.5, bgcolor: avatarColor(cm.matiere_nom), width: 36, height: 36, fontSize: 14, fontWeight: 'bold' }}>
                          {cm.matiere_nom?.[0]?.toUpperCase()}
                        </Avatar>
                        <ListItemText
                          primary={<Typography fontWeight="medium" variant="body2">{cm.matiere_nom}</Typography>}
                          secondary={<Typography variant="caption" color="text.secondary">{cm.classe_nom || cm.niveau_nom}</Typography>}
                        />
                        <Chip label={`Coef ${cm.coef}`} size="small" variant="outlined" />
                      </ListItem>
                      {i < Math.min(classeMatieres.length, 5) - 1 && <Divider />}
                    </Box>
                  ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderTop: '4px solid #7b1fa2' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <AssignmentIcon sx={{ color: '#7b1fa2' }} />
              <Typography variant="h6" fontWeight="bold">Dernières Évaluations</Typography>
            </Box>
            {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
              <List dense disablePadding>
                {evaluations.length === 0
                  ? <Typography color="text.secondary" variant="body2">Aucune évaluation</Typography>
                  : evaluations.map((e, i) => (
                    <Box key={e.id}>
                      <ListItem sx={{ px: 0 }}>
                        <Box sx={{ width: 4, height: 40, borderRadius: 2, mr: 1.5, flexShrink: 0,
                          bgcolor: e.type === 'EXAMEN_BLANC' ? '#d32f2f' : e.type === 'COMPOSITION' ? '#f57c00' : '#1976d2' }} />
                        <ListItemText
                          primary={<Typography fontWeight="medium" variant="body2">{e.matiere_nom} — {e.classe_nom}</Typography>}
                          secondary={<Typography variant="caption" color="text.secondary">{e.trimestre_nom} · Coef {e.coefficient}</Typography>}
                        />
                        <Chip label={TYPE_LABELS[e.type] || e.type} color={TYPE_COLORS[e.type] || 'default'} size="small" sx={{ fontSize: 11 }} />
                      </ListItem>
                      {i < evaluations.length - 1 && <Divider />}
                    </Box>
                  ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

// ─── Dashboard Elève/Parent ────────────────
function DashboardEleveParent() {
  const [notes, setNotes] = useState([]);
  const [presences, setPresences] = useState([]);
  const [eleveInfo, setEleveInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eleveDirectId, setEleveDirectId] = useState(null);
  const role = authService.getRole();

  // Pour PARENT : sélecteur d'enfant M2M
  const { enfants, selectedId: enfantId, selectedEnfant, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();
  const eleveId = role === 'PARENT' ? enfantId : eleveDirectId;

  // Pour ELEVE : récupérer son propre ID depuis me()
  useEffect(() => {
    if (role !== 'PARENT') {
      api.get('/auth/me/').then(res => {
        if (res.data.eleve) setEleveDirectId(res.data.eleve);
        else setLoading(false);
      });
    }
  }, [role]);

  useEffect(() => {
    if (role === 'PARENT' && loadingEnfants) return;
    if (!eleveId) { setLoading(false); return; }

    setLoading(true);
    Promise.all([
      api.get(`/eleves/${eleveId}/`),
      api.get(`/eleves/${eleveId}/presences/`),
      api.get(`/notes/?eleve_id=${eleveId}`),
    ]).then(([elevRes, presRes, notesRes]) => {
      setEleveInfo(elevRes.data);
      setPresences(presRes.data.slice(0, 5));
      const notesData = Array.isArray(notesRes.data) ? notesRes.data : notesRes.data.results ?? [];
      setNotes(notesData.slice(0, 5));
    }).finally(() => setLoading(false));
  }, [eleveId, loadingEnfants]);

  const presents = presences.filter(p => p.statut === 'PRESENT').length;
  const taux = presences.length > 0 ? Math.round((presents / presences.length) * 100) : 0;

  return (
    <Grid container spacing={GRID_SPACING}>
      {/* Sélecteur d'enfant pour PARENT */}
      {role === 'PARENT' && (
        <Grid size={12}>
          <EnfantSelector enfants={enfants} selectedId={enfantId} setSelectedId={setSelectedId} loading={loadingEnfants} />
          {!loadingEnfants && enfants.length === 0 && (
            <Alert severity="warning">
              Aucun enfant lié à votre compte. Contactez l'administration.
            </Alert>
          )}
        </Grid>
      )}

      <Grid size={12}>
        <Card sx={{ background: 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #42a5f5 100%)', borderRadius: 3, boxShadow: '0 8px 32px rgba(25,118,210,0.3)' }}>
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ width: 64, height: 64, bgcolor: 'rgba(255,255,255,0.2)', color: 'white', fontSize: 28, fontWeight: 'bold', border: '2px solid rgba(255,255,255,0.4)' }}>
                {eleveInfo ? eleveInfo.prenom?.[0]?.toUpperCase() : '?'}
              </Avatar>
              <Box>
                <Typography variant="h5" fontWeight="bold" color="white">
                  {role === 'PARENT' ? `Suivi de ${eleveInfo?.prenom || '...'}` : 'Mon Profil'}
                </Typography>
                {eleveInfo && (
                  <>
                    <Typography variant="h6" color="white">{eleveInfo.prenom} {eleveInfo.nom}</Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                      Matricule : {eleveInfo.matricule}
                      {eleveInfo.niveau_actuel && ` · ${eleveInfo.niveau_actuel}`}
                    </Typography>
                  </>
                )}
                {!eleveInfo && !loading && role === 'PARENT' && enfantId && (
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>Chargement...</Typography>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title="Notes enregistrées" value={notes.length} icon={<GradeIcon sx={{ color: 'white', fontSize: 26 }} />} gradient="linear-gradient(135deg, #7b1fa2, #ba68c8)" loading={loading} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title="Présences" value={presences.length} icon={<EventNoteIcon sx={{ color: 'white', fontSize: 26 }} />} gradient="linear-gradient(135deg, #2e7d32, #66bb6a)" loading={loading} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <StatCard title="Taux Présence" value={`${taux}%`}
          icon={<PeopleIcon sx={{ color: 'white', fontSize: 26 }} />}
          gradient={taux >= 80 ? 'linear-gradient(135deg, #2e7d32, #66bb6a)' : 'linear-gradient(135deg, #c62828, #ef5350)'} loading={loading} />
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderTop: '4px solid #7b1fa2' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <GradeIcon sx={{ color: '#7b1fa2' }} />
              <Typography variant="h6" fontWeight="bold">Dernières Notes</Typography>
            </Box>
            {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
              <List dense disablePadding>
                {notes.length === 0
                  ? <Typography color="text.secondary" variant="body2">Aucune note enregistrée</Typography>
                  : notes.map((n, i) => (
                    <Box key={n.id}>
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText
                          primary={<Typography fontWeight="medium" variant="body2">{n.matiere || n.type_evaluation}</Typography>}
                          secondary={<Typography variant="caption" color="text.secondary">Coef {n.coefficient} · {n.type_evaluation}</Typography>}
                        />
                        <Chip
                          label={n.valeur}
                          color={n.valeur >= 10 ? 'success' : 'error'}
                          size="small" sx={{ fontWeight: 'bold' }}
                        />
                      </ListItem>
                      {i < notes.length - 1 && <Divider />}
                    </Box>
                  ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, md: 6 }}>
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderTop: '4px solid #2e7d32' }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <EventNoteIcon sx={{ color: '#2e7d32' }} />
              <Typography variant="h6" fontWeight="bold">Dernières Présences</Typography>
            </Box>
            {loading ? <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box> : (
              <List dense disablePadding>
                {presences.length === 0
                  ? <Typography color="text.secondary" variant="body2">Aucune présence enregistrée</Typography>
                  : presences.map((p, i) => (
                    <Box key={p.id}>
                      <ListItem sx={{ px: 0 }}>
                        <ListItemText
                          primary={<Typography fontWeight="medium" variant="body2">{p.matiere_nom || '—'}</Typography>}
                          secondary={<Typography variant="caption" color="text.secondary">{p.date}</Typography>}
                        />
                        <Chip
                          label={p.statut === 'PRESENT' ? 'Présent' : p.statut === 'ABSENT' ? 'Absent' : p.statut === 'RETARD' ? 'Retard' : 'Excusé'}
                          color={p.statut === 'PRESENT' ? 'success' : p.statut === 'ABSENT' ? 'error' : p.statut === 'RETARD' ? 'warning' : 'info'}
                          size="small"
                        />
                      </ListItem>
                      {i < presences.length - 1 && <Divider />}
                    </Box>
                  ))}
              </List>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

// ─── Dashboard principal ───────────────────
export default function Default() {
  const role = authService.getRole();
  return (
    <Box>
      {role === 'ADMIN' && <DashboardAdmin />}
      {role === 'ENSEIGNANT' && <DashboardEnseignant />}
      {(role === 'ELEVE' || role === 'PARENT') && <DashboardEleveParent />}
    </Box>
  );
}
