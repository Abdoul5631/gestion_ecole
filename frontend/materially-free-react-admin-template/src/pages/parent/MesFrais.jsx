import { useEffect, useState } from 'react';
import { dossierService, parametresService, getResults } from 'services/api';
import useSelectedEnfant from 'hooks/useSelectedEnfant';
import EnfantSelector from 'components/EnfantSelector';
import authService from 'services/auth';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, CircularProgress, Button, LinearProgress
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { imprimerRecu, formatDateFr } from 'utils/printRecu';
import { readThrough, CacheKeys, NEVER_CACHED_MSG, cacheGet, cacheSet } from 'offline/cacheStore';

import { estEnLigne } from 'offline/reseau';
const STATUT_COLOR = { SOLDE: 'success', PARTIEL: 'warning', IMPAYE: 'error' };
const fmt = (n) => `${Number(n || 0).toLocaleString('fr-FR')} F`;

export default function MesFrais() {
  const role = authService.getRole();
  const { enfants, selectedId, setSelectedId, loading: loadingEnfants } = useSelectedEnfant();
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [ecole, setEcole] = useState({});

  useEffect(() => {
    readThrough(CacheKeys.parametres(), async () => {
      const res = await parametresService.get();
      return res.data || {};
    }).then((r) => { if (r.data) setEcole(r.data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (role === 'PARENT' && loadingEnfants) return;
    setLoading(true);
    setError('');
    const eleveKey = role === 'PARENT' ? (selectedId || 'none') : 'me';
    const url = role === 'PARENT' && selectedId ? `?eleve_id=${selectedId}` : '';
    readThrough(CacheKeys.frais(eleveKey), async () => {
      const res = await dossierService.getAll(url);
      const items = getResults(res).items.length ? getResults(res).items : (Array.isArray(res.data) ? res.data : []);
      return items;
    })
      .then(async (r) => {
        if (r.neverCached) {
          setError(NEVER_CACHED_MSG);
          setDossiers([]);
          return;
        }
        let items = r.data || [];
        // Fusionner paiements locaux en attente (visibles pour le parent)
        try {
          const pending = (await cacheGet(CacheKeys.frais(`${eleveKey}:pending`))) || [];
          if (pending.length) {
            items = items.map((d) => {
              const extras = pending.filter((p) => p.dossier_id === d.id);
              if (!extras.length) return d;
              const paiements = [...(d.paiements || []), ...extras.map((p) => ({
                id: `local-${p.client_id}`,
                numero_recu: p.numero_recu || 'En attente de sync',
                date_paiement: p.date_paiement,
                montant: p.montant,
                _pending: true,
              }))];
              const ajoute = extras.reduce((s, p) => s + Number(p.montant || 0), 0);
              return {
                ...d,
                montant_paye: Number(d.montant_paye || 0) + ajoute,
                reste: Math.max(0, Number(d.reste || 0) - ajoute),
                paiements,
              };
            });
          }
        } catch { /* ignore */ }
        setDossiers(items);
        setFromCache(r.fromCache);
      })
      .catch(() => setError(estEnLigne() ? 'Impossible de charger les frais.' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, [selectedId, loadingEnfants, role]);

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={2}>
        {role === 'PARENT' ? 'Frais de scolarité' : 'Ma scolarité'}
      </Typography>
      {role === 'PARENT' && (
        <EnfantSelector enfants={enfants} selectedId={selectedId} setSelectedId={setSelectedId} loading={loadingEnfants} />
      )}
      {fromCache && !error && (
        <Alert severity="info" sx={{ mb: 2 }}>Données hors ligne (dernière visite).</Alert>
      )}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : dossiers.length === 0 && !error ? (
        <Alert severity="info">Aucun dossier de scolarité pour cette année.</Alert>
      ) : dossiers.map((d) => {
        const du = Number(d.montant_du || 0);
        const paye = Number(d.montant_paye || 0);
        const pct = du > 0 ? Math.min(100, Math.round((paye / du) * 100)) : 100;
        const solde = d.statut === 'SOLDE' || (du > 0 && paye >= du);
        const couleurBarre = solde ? 'success.main' : paye > 0 ? 'warning.main' : 'error.main';
        return (
          <Card key={d.id} sx={{ mb: 2.5, borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              {/* ── Élève et situation ── */}
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2.5} flexWrap="wrap" gap={1}>
                <Box>
                  <Typography variant="h5" fontWeight={800}>{d.eleve_prenom} {d.eleve_nom}</Typography>
                  <Typography variant="body2" color="text.secondary">{d.classe_nom} · Année {d.annee_libelle}</Typography>
                </Box>
                <Chip label={solde ? 'Soldée' : d.statut_libelle} color={solde ? 'success' : (STATUT_COLOR[d.statut] || 'default')} sx={{ fontWeight: 700 }} />
              </Box>

              {/* ── Avancement du paiement ── */}
              <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'action.hover', mb: 2.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="baseline" flexWrap="wrap" gap={1} mb={1}>
                  <Typography fontWeight={700}>
                    {solde ? 'Scolarité entièrement réglée. Merci !' : `${fmt(paye)} versés sur ${fmt(du)}`}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, color: couleurBarre }}>{pct} %</Typography>
                </Box>
                <LinearProgress variant="determinate" value={pct}
                  sx={{ height: 10, borderRadius: 5, bgcolor: 'divider', '& .MuiLinearProgress-bar': { borderRadius: 5, bgcolor: couleurBarre } }} />
                <Grid container spacing={2} mt={0.5}>
                  {[['À payer', fmt(du), 'text.primary'], ['Déjà versé', fmt(paye), 'success.dark'], ['Reste à payer', fmt(d.reste), d.reste > 0 ? 'error.main' : 'success.main']].map(([l, v, c]) => (
                    <Grid key={l} size={{ xs: 4 }}>
                      <Typography variant="caption" color="text.secondary">{l}</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: { xs: 15, sm: 19 }, color: c }}>{v}</Typography>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* ── Calendrier de paiement : les tranches ── */}
              {(d.tranches || []).length > 0 && (
                <Box mb={2.5}>
                  <Typography fontWeight={800}>Calendrier de paiement</Typography>
                  <Typography variant="body2" color="text.secondary" mb={1.25}>
                    Vous payez le montant que vous voulez, quand vous voulez. Chaque versement s&apos;ajoute au total
                    et remplit les tranches dans l&apos;ordre.
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
                    {d.tranches.map((t) => {
                      const reglee = t.statut === 'SOLDE';
                      const enCours = t.statut === 'PARTIEL';
                      const p = Number(t.montant) > 0 ? Math.min(100, Math.round((Number(t.paye) / Number(t.montant)) * 100)) : 0;
                      return (
                        <Box key={t.numero} sx={{
                          border: '1px solid', borderColor: reglee ? 'success.light' : enCours ? 'warning.light' : 'divider',
                          borderRadius: 2.5, p: 1.75, bgcolor: reglee ? '#f3fbf5' : 'background.paper',
                        }}>
                          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.75}>
                            <Typography fontWeight={800}>{t.libelle}</Typography>
                            <Chip size="small" label={reglee ? 'Réglée' : enCours ? 'En cours' : 'À venir'}
                              color={reglee ? 'success' : enCours ? 'warning' : 'default'} variant={reglee || enCours ? 'filled' : 'outlined'} />
                          </Box>
                          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>{fmt(t.montant)}</Typography>
                          <LinearProgress variant="determinate" value={p} sx={{
                            height: 6, borderRadius: 3, my: 0.75, bgcolor: 'divider',
                            '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: reglee ? 'success.main' : 'warning.main' },
                          }} />
                          <Typography variant="caption" color="text.secondary">
                            {reglee ? 'Entièrement versée' : `${fmt(t.paye)} versés · ${fmt(Number(t.montant) - Number(t.paye))} restants`}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {/* ── Versements effectués ── */}
              <Typography fontWeight={800} mb={1}>Versements effectués</Typography>
              {(d.paiements || []).length === 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>Aucun versement enregistré pour le moment.</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
                  <Table size="small" data-no-stack>
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700, fontSize: 12, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.4, bgcolor: 'action.hover' } }}>
                        <TableCell>N°</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Reçu</TableCell>
                        <TableCell align="right">Montant</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {d.paiements.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{p.versement_libelle || '—'}</TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateFr(p.date_paiement)}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>
                            {p._pending ? 'Disponible après synchronisation' : p.numero_recu}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{fmt(p.montant)}</TableCell>
                          <TableCell align="right">
                            {!p._pending && (
                              <Button size="small" startIcon={<PrintIcon />} sx={{ textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
                                onClick={() => imprimerRecu(p, ecole, { duplicata: true })}>
                                Imprimer le reçu
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

/** Appelé par la caisse pour que le parent voie le paiement en attente hors ligne. */
export async function rememberPendingPaiement(eleveId, paiementLocal) {
  const key = CacheKeys.frais(`${eleveId || 'me'}:pending`);
  const prev = (await cacheGet(key)) || [];
  await cacheSet(key, [...prev.filter((p) => p.client_id !== paiementLocal.client_id), paiementLocal]);
}
