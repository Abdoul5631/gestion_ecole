import { useEffect, useState } from 'react';
import api, { emploiService } from 'services/api';
import { Box, Card, CardContent, Typography, CircularProgress, Chip, Alert } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import authService from 'services/auth';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';

import { estEnLigne } from 'offline/reseau';
const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const JOURS_LABELS = { LUNDI: 'Lundi', MARDI: 'Mardi', MERCREDI: 'Mercredi', JEUDI: 'Jeudi', VENDREDI: 'Vendredi', SAMEDI: 'Samedi' };
const CRENEAUX = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const COLORS = ['#1976d2','#388e3c','#f57c00','#7b1fa2','#c62828','#00838f','#5d4037','#e91e63'];
const colorMap = {};
function getColor(id) {
  if (!colorMap[id]) colorMap[id] = COLORS[Object.keys(colorMap).length % COLORS.length];
  return colorMap[id];
}
function fmt(t) { return t ? t.slice(0, 5) : ''; }

export default function MonEmploiDuTemps() {
  const [emplois, setEmplois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const role = authService.getRole();
  const { enfants, selectedId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();

  useEffect(() => {
    if (role === 'PARENT' && loadingEnfants) return;
    const load = async () => {
      try {
        const cacheParam = role === 'PARENT' ? `eleve:${selectedId || 'aucun'}` : (role === 'ELEVE' ? 'eleve' : 'enseignant');
        const result = await readThrough(CacheKeys.emploi(cacheParam), async () => {
          let url = '/emploi-du-temps/';
          if (role === 'ELEVE' || role === 'PARENT') {
            // parent : l'enfant choisi ; élève : lui-même. Jamais l'emploi du temps de toute l'école.
            const eleveId = role === 'PARENT' ? selectedId : (await api.get('/auth/me/')).data.eleve;
            if (!eleveId) return [];
            {
              const insc = await api.get(`/eleves/${eleveId}/inscriptions/`);
              const data = Array.isArray(insc.data) ? insc.data : insc.data.results ?? [];
              const active = data.find(i => i.is_active || !Object.prototype.hasOwnProperty.call(i, 'is_active'));
              if (!active?.classe) return [];
              url = `/emploi-du-temps/?classe_id=${active.classe}`;
            }
          }
          const res = await api.get(url);
          return Array.isArray(res.data) ? res.data : res.data.results ?? [];
        });
        if (result.neverCached) {
          setError(NEVER_CACHED_MSG);
          setEmplois([]);
        } else {
          setEmplois(result.data || []);
        }
      } catch {
        setError(estEnLigne() ? "Impossible de charger l'emploi du temps." : NEVER_CACHED_MSG);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [role, selectedId, loadingEnfants]);

  const grille = {};
  JOURS.forEach(j => { grille[j] = {}; });
  emplois.forEach(e => {
    const h = e.heure_debut.slice(0, 5);
    if (!grille[e.jour][h]) grille[e.jour][h] = [];
    grille[e.jour][h].push(e);
  });

  // Ne montrer que les jours qui ont au moins un créneau
  const joursActifs = JOURS.filter(j => Object.values(grille[j]).some(arr => arr.length > 0));
  const displayJours = joursActifs.length > 0 ? joursActifs : JOURS.slice(0, 5);

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <CalendarMonthIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Mon Emploi du Temps
        </Typography>
      </Box>

      {role === 'PARENT' && <EnfantSelector enfants={enfants} selectedId={selectedId} setSelectedId={setSelectedId} loading={loadingEnfants} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {emplois.length === 0 && !error ? (
        <Box textAlign="center" py={8} color="text.secondary">
          <CalendarMonthIcon sx={{ fontSize: 64, opacity: 0.2, mb: 2 }} />
          <Typography>Aucun créneau enregistré pour le moment.</Typography>
        </Box>
      ) : (
        <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <CardContent sx={{ p: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ width: 65, border: '1px solid #e0e0e0', padding: '8px', background: '#f5f5f5', fontSize: 12 }}>Heure</th>
                  {displayJours.map(j => (
                    <th key={j} style={{ border: '1px solid #e0e0e0', padding: '8px 4px', background: '#f5f5f5', fontSize: 13, fontWeight: 'bold' }}>
                      {JOURS_LABELS[j]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CRENEAUX.map(heure => {
                  const hasContent = displayJours.some(j => (grille[j][heure] || []).length > 0);
                  if (!hasContent) return null;
                  return (
                    <tr key={heure}>
                      <td style={{ border: '1px solid #e0e0e0', padding: '4px 8px', fontSize: 11, color: '#666', textAlign: 'center', background: '#fafafa' }}>
                        {heure}
                      </td>
                      {displayJours.map(jour => {
                        const slots = grille[jour][heure] || [];
                        return (
                          <td key={jour} style={{ border: '1px solid #e0e0e0', padding: 4, verticalAlign: 'top', minWidth: 100 }}>
                            {slots.map(emp => (
                              <Box key={emp.id} sx={{
                                bgcolor: getColor(emp.classe_matiere), color: 'white',
                                borderRadius: 1, p: '5px 7px', mb: 0.5, fontSize: 11
                              }}>
                                <Typography fontSize={12} fontWeight="bold" lineHeight={1.3}>{emp.matiere_nom}</Typography>
                                {role === 'ADMIN' && emp.classe_nom && (
                                  <Typography fontSize={10} sx={{ opacity: 0.9 }}>{emp.classe_nom}</Typography>
                                )}
                                {role !== 'ENSEIGNANT' && emp.enseignant_nom && (
                                  <Typography fontSize={10} sx={{ opacity: 0.9 }}>{emp.enseignant_nom}</Typography>
                                )}
                                <Typography fontSize={10} sx={{ opacity: 0.85 }}>
                                  {fmt(emp.heure_debut)} – {fmt(emp.heure_fin)}
                                  {emp.salle ? ` · ${emp.salle}` : ''}
                                </Typography>
                              </Box>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
