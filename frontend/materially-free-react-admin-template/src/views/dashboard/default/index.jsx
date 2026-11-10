import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Grid from '@mui/material/Grid';
import { useTheme } from '@mui/material/styles';
import {
  Box, Card, CardContent, Typography, CircularProgress, Button,
  List, ListItem, ListItemText, Divider, Chip, Avatar, LinearProgress, Alert
} from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import LanguageIcon from '@mui/icons-material/Language';
import CampaignIcon from '@mui/icons-material/Campaign';
import SchoolIcon from '@mui/icons-material/School';
import ClassIcon from '@mui/icons-material/Class';
import EventNoteIcon from '@mui/icons-material/EventNote';
import GradeIcon from '@mui/icons-material/Grade';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SmsIcon from '@mui/icons-material/Sms';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ArticleIcon from '@mui/icons-material/Article';
import PaymentsIcon from '@mui/icons-material/Payments';
import api, { getResults, statsService } from 'services/api';
import { accords } from 'utils/couleurs';
import authService from 'services/auth';
import AbsentsDuJour from 'pages/admin/AbsentsDuJour';
import TableauPlateforme from 'pages/plateforme/TableauPlateforme';
import DashboardComptable from 'components/DashboardComptable';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { GRID_SPACING } from 'config';
import { readThrough, scopedKey, NEVER_CACHED_MSG } from 'offline/cacheStore';

// Couleurs avatar basées sur la première lettre
const AVATAR_COLORS = ['#1976d2','#388e3c','#f57c00','#7b1fa2','#c62828','#0288d1','#00796b','#5d4037'];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];


function BigActionButtons({ actions }) {
  return (
    <Grid container spacing={1.5} sx={{ mb: 2 }}>
      {actions.map((a) => (
        <Grid key={a.to + a.title} size={{ xs: 6, sm: 6, md: 3 }}>
          <Card
            component={Link}
            to={a.to}
            sx={{
              textDecoration: 'none',
              height: { xs: 72, sm: 80 },
              borderRadius: 2,
              background: a.color,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 1,
              px: 1.5,
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              transition: 'transform 0.15s, opacity 0.15s',
              '&:hover': { opacity: 0.92, transform: 'translateY(-1px)' },
            }}
          >
            {a.icon}
            <Typography fontWeight="bold" textAlign="center" sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, lineHeight: 1.2 }}>
              {a.title}
            </Typography>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

const ACTIONS_ADMIN = [
  { title: 'Appel du jour', to: '/appel-du-jour', icon: <EventNoteIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #1565c0, #42a5f5)' },
  { title: 'Saisir une note', to: '/admin/notes-par-classe', icon: <GradeIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #6a1b9a, #ab47bc)' },
  { title: 'Messages', to: '/admin/sms', icon: <SmsIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #e65100, #ff9800)' },
];

const ACTIONS_PARENT = [
  { title: 'Notes', to: '/mes-notes', icon: <GradeIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #6a1b9a, #ab47bc)' },
  { title: 'Bulletin', to: '/mon-bulletin', icon: <ArticleIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #1565c0, #42a5f5)' },
  { title: 'Frais', to: '/mes-frais', icon: <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #2e7d32, #66bb6a)' },
  { title: 'Messages', to: '/messages', icon: <MailOutlineIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #e65100, #ff9800)' },
];

const ACTIONS_ELEVE = [
  { title: 'Mes notes', to: '/mes-notes', icon: <GradeIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #6a1b9a, #ab47bc)' },
  { title: 'Mon bulletin', to: '/mon-bulletin', icon: <ArticleIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #1565c0, #42a5f5)' },
  { title: 'Emploi du temps', to: '/mon-emploi-du-temps', icon: <CalendarMonthIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #00695c, #26a69a)' },
  { title: 'Messages', to: '/messages', icon: <MailOutlineIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #e65100, #ff9800)' },
];

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
  const [allPresencesCount, setAllPresencesCount] = useState(0);
  const [presentsCount, setPresentsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statsService.dashboard()
      .then(res => {
        const d = res.data || {};
        setStats({
          eleves: d.eleves ?? 0,
          enseignants: d.enseignants ?? 0,
          matieres: d.matieres ?? 0,
          classes: d.classes ?? 0,
        });
        setAllPresencesCount(d.presence_total ?? 0);
        setPresentsCount(d.presence_presents ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const presents = presentsCount;
  const tauxPresence = allPresencesCount > 0
    ? Math.round((presents / allPresencesCount) * 100)
    : 0;

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Box>
      {!loading && (stats.classes === 0 || stats.eleves === 0) && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Box display="flex" gap={1}>
              <Button color="inherit" size="small" component={Link} to="/admin/setup-ecole">Configurer</Button>
              <Button color="inherit" size="small" component={Link} to="/admin/parametres">Paramètres</Button>
            </Box>
          }
        >
          Votre école est créée. Ajoutez les niveaux et les classes pour commencer.
          Vous pourrez tout modifier plus tard dans Configuration → Paramètres de l&apos;école.
        </Alert>
      )}
      {/* Bandeau de bienvenue */}
      <Card sx={{
        mb: 2, background: (t) => `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 50%, ${t.palette.primary.light} 100%)`,
        borderRadius: 3, boxShadow: (t) => `0 8px 32px ${t.palette.primary.main}4d`, overflow: 'hidden', position: 'relative'
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

      <BigActionButtons actions={ACTIONS_ADMIN} />

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
                {presents} présences sur {allPresencesCount} enregistrées
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ─── Dashboard Enseignant ──────────────────
function DashboardEnseignant() {
  const theme = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    readThrough(scopedKey('dashboard-enseignant'), async () => (await api.get('/emploi-du-temps/aujourdhui/')).data)
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        setData(r.data);
      })
      .catch(() => setError('Impossible de charger vos cours du jour.'))
      .finally(() => setLoading(false));
  }, []);

  const resume = data?.resume || {};
  const cours = data?.cours || [];
  const dateTxt = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  // couleurs accordées à celle de l'école, mais différentes entre elles pour que chaque bloc se distingue
  const nuances = accords(theme.palette.primary.main);
  const actions = [
    { title: "Faire l'appel", to: '/enseignant/cours', icon: <EventNoteIcon sx={{ fontSize: 22 }} />, color: nuances[0] },
    { title: 'Carnet de notes', to: '/enseignant/notes', icon: <GradeIcon sx={{ fontSize: 22 }} />, color: nuances[1] },
    { title: 'Emploi du temps', to: '/enseignant/emploi-du-temps', icon: <CalendarMonthIcon sx={{ fontSize: 22 }} />, color: nuances[2] },
    { title: 'Messages', to: '/messages', icon: <MailOutlineIcon sx={{ fontSize: 22 }} />, color: nuances[3] },
  ];

  return (
    <Box>
      <BigActionButtons actions={actions} />
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={GRID_SPACING}>
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard title="Cours aujourd'hui" value={resume.cours_du_jour ?? 0} icon={<CalendarMonthIcon sx={{ color: 'white', fontSize: 26 }} />} gradient={nuances[0]} loading={loading} />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard title="Appels à faire" value={resume.appels_a_faire ?? 0} icon={<EventNoteIcon sx={{ color: 'white', fontSize: 26 }} />} gradient={nuances[1]} loading={loading} />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard title="Mes classes" value={resume.classes ?? 0} icon={<ClassIcon sx={{ color: 'white', fontSize: 26 }} />} gradient={nuances[2]} loading={loading} />
        </Grid>
        <Grid size={{ xs: 6, lg: 3 }}>
          <StatCard title="Mes élèves" value={resume.eleves ?? 0} icon={<PeopleIcon sx={{ color: 'white', fontSize: 26 }} />} gradient={nuances[3]} loading={loading} />
        </Grid>

        <Grid size={12}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderTop: '4px solid', borderTopColor: 'primary.main' }}>
            <CardContent>
              <Box display="flex" alignItems="baseline" justifyContent="space-between" flexWrap="wrap" gap={1} mb={1.5}>
                <Box display="flex" alignItems="center" gap={1}>
                  <CalendarMonthIcon sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight="bold">Mes cours d&apos;aujourd&apos;hui</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{dateTxt}</Typography>
              </Box>
              {loading ? (
                <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box>
              ) : cours.length === 0 ? (
                <Box textAlign="center" py={2}>
                  <Typography color="text.secondary">
                    {data?.jour ? 'Aucun cours prévu aujourd\'hui dans votre emploi du temps.' : 'Pas de cours le dimanche.'}
                  </Typography>
                  <Button component={Link} to="/enseignant/emploi-du-temps" size="small" sx={{ mt: 1 }}>Voir mon emploi du temps</Button>
                </Box>
              ) : (
                <List disablePadding>
                  {cours.map((c, i) => (
                    <Box key={c.classe_matiere_id}>
                      <ListItem sx={{ px: 0, py: 1.25, gap: 1.5, flexWrap: 'wrap' }}>
                        <Box sx={{ minWidth: 92 }}>
                          <Typography fontWeight={700} variant="body2">{c.horaires.join(', ')}</Typography>
                        </Box>
                        <Avatar sx={{ bgcolor: avatarColor(c.matiere_nom), width: 36, height: 36, fontSize: 14, fontWeight: 'bold' }}>
                          {c.matiere_nom?.[0]?.toUpperCase()}
                        </Avatar>
                        <ListItemText
                          sx={{ flex: '1 1 160px', m: 0 }}
                          primary={<Typography fontWeight="medium" variant="body2">{c.matiere_nom} — {c.classe_nom}</Typography>}
                          secondary={<Typography variant="caption" color="text.secondary">{c.effectif} élève{c.effectif > 1 ? 's' : ''}</Typography>}
                        />
                        {c.appel_fait ? (
                          <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap">
                            <Chip size="small" color="success" label="Appel fait" />
                            {c.absents > 0 && <Chip size="small" color="error" label={`${c.absents} absent${c.absents > 1 ? 's' : ''}`} />}
                            <Button component={Link} to={`/enseignant/marquer-presences/${c.classe_matiere_id}`} size="small">Modifier</Button>
                          </Box>
                        ) : (
                          <Button component={Link} to={`/enseignant/marquer-presences/${c.classe_matiere_id}`} variant="contained" size="small" startIcon={<EventNoteIcon />}>
                            Faire l&apos;appel
                          </Button>
                        )}
                      </ListItem>
                      {i < cours.length - 1 && <Divider />}
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
      setPresences(getResults(presRes).items.slice(0, 5));
      const notesData = getResults(notesRes).items;
      setNotes(notesData.slice(0, 5));
    }).finally(() => setLoading(false));
  }, [eleveId, loadingEnfants]);

  const presents = presences.filter(p => p.statut === 'PRESENT').length;
  const taux = presences.length > 0 ? Math.round((presents / presences.length) * 100) : 0;
  const actions = role === 'PARENT' ? ACTIONS_PARENT : ACTIONS_ELEVE;

  return (
    <Box>
      <BigActionButtons actions={actions} />
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
        <Card sx={{ background: (t) => `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 50%, ${t.palette.primary.light} 100%)`, borderRadius: 3, boxShadow: (t) => `0 8px 32px ${t.palette.primary.main}4d` }}>
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
    </Box>
  );
}

// ─── Dashboard du personnel (secrétaire, comptable, surveillant) ───────────────
const ACTIONS_PERSONNEL = {
  SECRETAIRE: {
    titre: 'Secrétariat',
    texte: "Inscrivez les élèves, tenez leurs dossiers à jour et traitez les inscriptions en ligne.",
    actions: [
      { title: 'Élèves', to: '/eleves', icon: <PeopleIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #1565c0, #42a5f5)' },
      { title: 'Liste des classes', to: '/admin/classes', icon: <ClassIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #00695c, #26a69a)' },
      { title: 'Affectation en classe', to: '/admin/inscriptions', icon: <ArticleIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #6a1b9a, #ab47bc)' },
      { title: 'Inscriptions en ligne', to: '/admin/dossiers', icon: <MailOutlineIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #e65100, #ff9800)' },
    ],
  },
  COMPTABLE: {
    titre: 'Caisse',
    texte: 'Encaissez les frais de scolarité, notez les dépenses et suivez l’état financier de l’école.',
    actions: [
      { title: 'Encaisser', to: '/admin/caisse', icon: <PaymentsIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #2e7d32, #66bb6a)' },
      { title: 'Noter une dépense', to: '/admin/finances', icon: <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #c62828, #ef5350)' },
      { title: 'Liste des classes', to: '/admin/classes', icon: <ClassIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #1565c0, #42a5f5)' },
    ],
  },
  COMMUNICATION: {
    titre: 'Site public',
    texte: "Tenez la vitrine de l'école à jour : présentation, photo, contacts et actualités. Les visiteurs et futurs parents la voient en premier.",
    actions: [
      { title: 'Site public', to: '/admin/site-public', icon: <LanguageIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #6a1b9a, #ab47bc)' },
      { title: 'Actualités du site', to: '/admin/actualites', icon: <CampaignIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #e65100, #ff9800)' },
    ],
  },
  SURVEILLANT: {
    titre: 'Vie scolaire',
    texte: "Les élèves absents ou en retard aujourd'hui apparaissent ci-dessous, classe par classe, dès qu'un enseignant les signale.",
    actions: [
      { title: 'Liste des classes', to: '/admin/classes', icon: <ClassIcon sx={{ fontSize: 22 }} />, color: 'linear-gradient(135deg, #1565c0, #42a5f5)' },
    ],
  },
};

function DashboardPersonnel({ role }) {
  const cfg = ACTIONS_PERSONNEL[role];

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return (
    <Box>
      <Card sx={{ mb: 3, background: (t) => `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 50%, ${t.palette.primary.light} 100%)`, borderRadius: 3, boxShadow: (t) => `0 8px 32px ${t.palette.primary.main}4d` }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h5" fontWeight="bold" color="white">{cfg.titre}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.85)', mt: 0.5 }}>{cfg.texte}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', mt: 1, fontSize: 13 }}>{today.charAt(0).toUpperCase() + today.slice(1)}</Typography>
        </CardContent>
      </Card>
      <BigActionButtons actions={cfg.actions} />
      {role === 'SURVEILLANT' && <AbsentsDuJour integre />}
    </Box>
  );
}

// ─── Dashboard principal ───────────────────
export default function Default() {
  const role = authService.getRole();
  const roles = authService.getRoles();
  const isPlateforme = authService.isPlateforme() || role === 'SUPER_ADMIN';
  return (
    <Box>
      {isPlateforme && <TableauPlateforme />}
      {role === 'ADMIN' && <DashboardAdmin />}
      {role === 'ENSEIGNANT' && <DashboardEnseignant />}
      {(role === 'ELEVE' || role === 'PARENT') && <DashboardEleveParent />}
      {roles.filter((r) => ACTIONS_PERSONNEL[r] && r !== 'COMPTABLE').map((r) => (
        <Box key={r} sx={{ mb: 3 }}><DashboardPersonnel role={r} /></Box>
      ))}
      {roles.includes('COMPTABLE') && <DashboardComptable />}
    </Box>
  );
}
