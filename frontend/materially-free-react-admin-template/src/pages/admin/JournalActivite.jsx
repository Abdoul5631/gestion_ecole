import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, InputAdornment, MenuItem, Paper, TextField, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HistoryIcon from '@mui/icons-material/History';
import { journalService } from 'services/api';
import { useIsOnline } from 'offline/RequireOnline';
import authService from 'services/auth';

const ROLES = {
  SUPER_ADMIN: 'Super administrateur', ADMIN: 'Directeur', SECRETAIRE: 'Secrétaire', COMPTABLE: 'Comptable', SURVEILLANT: 'Surveillant', COMMUNICATION: 'Responsable du site public',
  ENSEIGNANT: 'Enseignant', PARENT: 'Parent', ELEVE: 'Élève',
};
const ACTIONS = {
  CREATION: { verbe: 'a ajouté', couleur: 'success' },
  MODIFICATION: { verbe: 'a modifié', couleur: 'primary' },
  SUSPENSION: { verbe: 'a suspendu', couleur: 'warning' },
  REACTIVATION: { verbe: 'a réactivé', couleur: 'success' },
  SUPPRESSION: { verbe: 'a supprimé', couleur: 'error' },
  CONNEXION: { verbe: 's’est connecté(e)', couleur: 'default' },
  AUTRE: { verbe: '', couleur: 'default' },
};
const PERIODES = [
  ['aujourdhui', "Aujourd'hui"], ['7', '7 derniers jours'], ['30', '30 derniers jours'], ['tout', 'Tout'], ['dates', 'Choisir les dates'],
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const libelleRole = (r) => String(r || '').split(' + ').map((x) => ROLES[x] || x).join(' + ');
const initiales = (nom) => String(nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase();

function libelleJour(date) {
  const j = new Date(date);
  const auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (iso(j) === iso(auj)) return "Aujourd'hui";
  if (iso(j) === iso(hier)) return 'Hier';
  const t = j.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function JournalActivite() {
  const online = useIsOnline();
  const plateforme = authService.isPlateforme(); // super admin : toutes les écoles
  const [lignes, setLignes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [plus, setPlus] = useState(false);
  const [erreur, setErreur] = useState('');
  const [options, setOptions] = useState({ personnes: [], types: [], actions: [], ecoles: [] });
  const [f, setF] = useState({ periode: '7', du: '', au: '', ecole: '', utilisateur: '', action: '', objet_type: '', q: '' });
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    journalService.filtres().then((r) => setOptions(r.data)).catch(() => {});
  }, []);

  // la recherche part 400 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, q: recherche })), 400);
    return () => clearTimeout(t);
  }, [recherche]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    const auj = new Date();
    if (f.periode === 'aujourdhui') p.set('du', iso(auj));
    if (f.periode === '7' || f.periode === '30') {
      const d = new Date(); d.setDate(auj.getDate() - Number(f.periode) + 1); p.set('du', iso(d));
    }
    if (f.periode === 'dates') { if (f.du) p.set('du', f.du); if (f.au) p.set('au', f.au); }
    ['ecole', 'utilisateur', 'action', 'objet_type', 'q'].forEach((k) => { if (f[k]) p.set(k, f[k]); });
    return p;
  }, [f]);

  const charger = async (n) => {
    const p = new URLSearchParams(params);
    p.set('page', n);
    if (n === 1) setLoading(true); else setPlus(true);
    setErreur('');
    try {
      const r = await journalService.getAll(`?${p.toString()}`);
      setLignes((l) => (n === 1 ? r.data.results : [...l, ...r.data.results]));
      setTotal(r.data.count);
      setPage(n);
    } catch {
      setErreur(online ? 'Impossible de charger l’historique des actions.' : 'Connexion requise pour consulter l’historique des actions.');
    } finally {
      setLoading(false); setPlus(false);
    }
  };
  useEffect(() => { charger(1); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // regroupement par jour
  const jours = useMemo(() => {
    const m = new Map();
    lignes.forEach((l) => {
      const k = iso(new Date(l.date));
      if (!m.has(k)) m.set(k, { date: l.date, lignes: [] });
      m.get(k).lignes.push(l);
    });
    return [...m.values()];
  }, [lignes]);

  const champ = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <Avatar variant="rounded" sx={{ bgcolor: 'primary.lighter', color: 'primary.main', width: 44, height: 44, borderRadius: 2 }}><HistoryIcon /></Avatar>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Historique des actions</Typography>
          <Typography variant="body2" color="text.secondary">
            {plateforme ? 'Qui a fait quoi, dans toutes les écoles' : 'Qui a fait quoi dans l’école'}, et quand. Personne ne peut modifier ni effacer cet historique.
          </Typography>
        </Box>
      </Box>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <TextField select fullWidth size="small" label="Période" value={f.periode} onChange={champ('periode')}>
                {PERIODES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
            </Grid>
            {f.periode === 'dates' && (
              <>
                <Grid size={{ xs: 6, md: 2 }}>
                  <TextField fullWidth size="small" type="date" label="Du" value={f.du} onChange={champ('du')} InputLabelProps={{ shrink: true }} />
                </Grid>
                <Grid size={{ xs: 6, md: 2 }}>
                  <TextField fullWidth size="small" type="date" label="Au" value={f.au} onChange={champ('au')} InputLabelProps={{ shrink: true }} />
                </Grid>
              </>
            )}
            {plateforme && (
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <TextField select fullWidth size="small" label="École" value={f.ecole} onChange={champ('ecole')}>
                  <MenuItem value="">Toutes les écoles</MenuItem>
                  <MenuItem value="plateforme">Plateforme (hors école)</MenuItem>
                  {(options.ecoles || []).map((e) => <MenuItem key={e.id} value={e.id}>{e.nom_ecole}</MenuItem>)}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <TextField select fullWidth size="small" label="Personne" value={f.utilisateur} onChange={champ('utilisateur')}>
                <MenuItem value="">Tout le monde</MenuItem>
                {options.personnes.map((p) => <MenuItem key={p.id} value={p.id}>{p.nom} · {libelleRole(p.role)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <TextField select fullWidth size="small" label="Action" value={f.action} onChange={champ('action')}>
                <MenuItem value="">Toutes</MenuItem>
                {options.actions.map((a) => <MenuItem key={a.code} value={a.code}>{a.libelle}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
              <TextField select fullWidth size="small" label="Élément" value={f.objet_type} onChange={champ('objet_type')}>
                <MenuItem value="">Tous</MenuItem>
                {options.types.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: f.periode === 'dates' ? 12 : 2.4 }}>
              <TextField fullWidth size="small" placeholder="Rechercher (nom, matricule…)" value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {erreur && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : lignes.length === 0 ? (
        <Alert severity="info">Aucune activité pour ces critères.</Alert>
      ) : (
        <>
          {jours.map((j) => (
            <Box key={j.date} sx={{ mb: 2.5 }}>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={700} sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>
                {libelleJour(j.date)}
              </Typography>
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                {j.lignes.map((l, i) => {
                  const a = ACTIONS[l.action] || ACTIONS.AUTRE;
                  return (
                    <Box key={l.id} sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.25, borderTop: i ? '1px solid' : 'none', borderColor: 'divider' }}>
                      <Typography variant="body2" color="text.secondary" sx={{ width: 44, flexShrink: 0, pt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(l.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: 'primary.main', flexShrink: 0 }}>{initiales(l.nom_utilisateur)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                          <strong>{l.nom_utilisateur || 'Compte supprimé'}</strong>
                          <Typography component="span" variant="caption" color="text.secondary"> ({libelleRole(l.role)}{plateforme ? ` · ${l.ecole_nom || 'Plateforme'}` : ''})</Typography>
                          {' '}{a.verbe}{l.action !== 'CONNEXION' && l.objet_type ? <> {l.action === 'AUTRE' ? '' : <>· {l.objet_type} </>}</> : null}
                          {l.objet_libelle && <strong> {l.action === 'AUTRE' ? l.objet_libelle : `« ${l.objet_libelle} »`}</strong>}
                        </Typography>
                        {l.details?.length > 0 && (
                          <Box sx={{ mt: 0.5, pl: 1.25, borderLeft: '3px solid', borderColor: 'divider' }}>
                            {l.details.map((d) => (
                              <Typography key={d.champ} variant="caption" display="block" color="text.secondary">
                                {d.champ} : <span style={{ textDecoration: 'line-through' }}>{d.avant}</span> → <strong style={{ color: 'inherit' }}>{d.apres}</strong>
                              </Typography>
                            ))}
                          </Box>
                        )}
                      </Box>
                      <Chip size="small" label={(options.actions.find((x) => x.code === l.action) || {}).libelle || l.action}
                        color={a.couleur} variant={a.couleur === 'default' ? 'outlined' : 'filled'}
                        sx={{ flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }} />
                    </Box>
                  );
                })}
              </Paper>
            </Box>
          ))}
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
            <Typography variant="caption" color="text.secondary">{lignes.length} sur {total} activité{total > 1 ? 's' : ''}</Typography>
            {lignes.length < total && (
              <Button variant="outlined" size="small" disabled={plus} onClick={() => charger(page + 1)}>
                {plus ? 'Chargement…' : 'Voir plus'}
              </Button>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
