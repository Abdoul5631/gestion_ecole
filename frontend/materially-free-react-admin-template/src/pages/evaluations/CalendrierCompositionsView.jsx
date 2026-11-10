import { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Card, Chip, CircularProgress, Typography } from '@mui/material';
import QuizIcon from '@mui/icons-material/Quiz';
import DateRangeIcon from '@mui/icons-material/DateRange';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { calendrierCompoService, classeMatiereService, getResults } from 'services/api';

const AVATAR_COLORS = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c62828', '#0288d1', '#00796b', '#5d4037'];
const avatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const hhmm = (t) => (t || '').slice(0, 5);
const jourLong = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function plageDates(debut, fin) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      .formatRange(new Date(`${debut}T00:00:00`), new Date(`${fin}T00:00:00`));
  } catch {
    return `${jourLong(debut)} → ${jourLong(fin)}`;
  }
}

/** Où en est la session : en cours / dans N jours / terminée. */
function statutSession(debut, fin) {
  const jour = new Date(); jour.setHours(0, 0, 0, 0);
  const d = new Date(`${debut}T00:00:00`);
  const f = new Date(`${fin}T00:00:00`);
  if (jour > f) return { label: 'Terminées', color: 'default', fini: true };
  if (jour >= d) return { label: 'En cours', color: 'success' };
  const n = Math.ceil((d - jour) / 86400000);
  return { label: n === 1 ? 'Demain' : `Dans ${n} jours`, color: n <= 7 ? 'warning' : 'info' };
}

/** Calendrier des compositions, en lecture : enseignants, élèves et parents voient celui de leurs niveaux. */
export default function CalendrierCompositionsView() {
  const role = authService.getRole();
  const [calendriers, setCalendriers] = useState([]);
  const [mesMatieres, setMesMatieres] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // parent : uniquement la classe de l'enfant choisi
  const { enfants, selectedId, selectedEnfant, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  useEffect(() => {
    if (role === 'PARENT' && (loadingEnfants || !selectedId)) {
      if (!loadingEnfants) { setCalendriers([]); setLoading(false); }
      return;
    }
    setLoading(true);
    calendrierCompoService.getAll(role === 'PARENT' ? `?eleve_id=${selectedId}` : '')
      .then((res) => setCalendriers(getResults(res).items))
      .catch(() => setError('Impossible de charger le calendrier des compositions.'))
      .finally(() => setLoading(false));
  }, [role, selectedId, loadingEnfants]);

  useEffect(() => {
    if (role === 'ENSEIGNANT') {
      classeMatiereService.getAll()
        .then((res) => setMesMatieres(new Set(getResults(res).items.map((cm) => cm.matiere))))
        .catch(() => {});
    }
  }, [role]);

  // à venir et en cours d'abord, les sessions terminées ensuite
  const tries = [...calendriers].sort((a, b) => {
    const fa = statutSession(a.date_debut, a.date_fin).fini ? 1 : 0;
    const fb = statutSession(b.date_debut, b.date_fin).fini ? 1 : 0;
    return fa - fb || String(a.date_debut).localeCompare(String(b.date_debut)) || String(a.niveau_nom).localeCompare(String(b.niveau_nom));
  });

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <Box sx={{
          width: 48, height: 48, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'primary.lighter', color: 'primary.dark',
        }}>
          <QuizIcon fontSize="medium" />
        </Box>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Calendrier des compositions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {role === 'ENSEIGNANT' ? 'Jour et heure de chaque épreuve dans les niveaux où vous enseignez'
              : role === 'PARENT' ? `Jour et heure de chaque épreuve pour la classe de ${selectedEnfant?.prenom || 'votre enfant'}`
                : 'Jour et heure de chaque épreuve de ta classe'}
          </Typography>
        </Box>
      </Box>

      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={selectedId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : tries.length === 0 ? (
        <Alert severity="info">Le calendrier des compositions n&apos;est pas encore publié par la direction.</Alert>
      ) : tries.map((cal) => {
        const statut = statutSession(cal.date_debut, cal.date_fin);
        const programmes = [...(cal.programmes || [])].sort((x, y) =>
          String(x.date_composition || '9999').localeCompare(String(y.date_composition || '9999'))
          || String(x.heure_debut || '').localeCompare(String(y.heure_debut || ''))
          || String(x.matiere_nom).localeCompare(String(y.matiere_nom)));
        // les épreuves regroupées par jour ; celles sans date à la fin
        const jours = [];
        programmes.forEach((pr) => {
          const cle = pr.date_composition || '';
          let j = jours.find((x) => x.cle === cle);
          if (!j) { j = { cle, epreuves: [] }; jours.push(j); }
          j.epreuves.push(pr);
        });
        return (
          <Card key={cal.id} sx={{ mb: 3, borderRadius: 3, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', opacity: statut.fini ? 0.75 : 1 }}>
            <Box sx={{
              px: { xs: 2, sm: 3 }, py: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider',
              borderLeft: '6px solid', borderLeftColor: statut.fini ? 'grey.400' : 'primary.main',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5,
            }}>
              <Box>
                <Typography variant="h5" fontWeight={700} lineHeight={1.2}>{cal.niveau_nom}</Typography>
                <Typography variant="body2" color="text.secondary">{cal.annee_libelle} — {cal.trimestre_nom}</Typography>
              </Box>
              <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                <Chip icon={<DateRangeIcon />} variant="outlined" label={plageDates(cal.date_debut, cal.date_fin)}
                  sx={{ fontWeight: 600, height: 34, '& .MuiChip-label': { whiteSpace: 'normal' } }} />
                <Chip size="small" color={statut.color} label={statut.label} sx={{ fontWeight: 600 }} />
              </Box>
            </Box>

            <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
              {programmes.length === 0 ? (
                <Alert severity="info" variant="outlined">Les jours et heures des épreuves ne sont pas encore renseignés.</Alert>
              ) : jours.map((j) => (
                <Box key={j.cle || 'sans-date'} sx={{ mb: 2, '&:last-child': { mb: 0 } }}>
                  <Typography variant="subtitle2" fontWeight={800} color={j.cle ? 'primary.main' : 'text.disabled'}
                    sx={{ textTransform: 'capitalize', mb: 1 }}>
                    {j.cle ? jourLong(j.cle) : 'Date à préciser'}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
                    {j.epreuves.map((pr) => {
                      const mienne = mesMatieres.has(pr.matiere);
                      return (
                        <Box key={pr.id} sx={{
                          display: 'flex', gap: 1.5, alignItems: 'center', p: 1.25, borderRadius: 2, border: '1px solid',
                          borderColor: mienne ? 'primary.main' : 'divider', bgcolor: mienne ? 'primary.lighter' : 'transparent',
                        }}>
                          <Avatar sx={{ width: 36, height: 36, fontSize: 14, fontWeight: 'bold', bgcolor: avatarColor(pr.matiere_nom) }}>
                            {pr.matiere_nom?.[0]?.toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography fontWeight={700} variant="body2">
                              {pr.matiere_nom}
                              {pr.classe_nom && <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75, fontWeight: 600 }}>· {pr.classe_nom}</Typography>}
                            </Typography>
                            <Typography variant="body2" color={pr.heure_debut ? 'text.primary' : 'text.disabled'}>
                              {pr.heure_debut ? `${hhmm(pr.heure_debut)}${pr.heure_fin ? ` – ${hhmm(pr.heure_fin)}` : ''}` : 'Heure à préciser'}
                            </Typography>
                          </Box>
                          {mienne && <Chip size="small" color="primary" label="Votre matière" sx={{ fontWeight: 700 }} />}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              ))}
            </Box>
          </Card>
        );
      })}
    </Box>
  );
}
