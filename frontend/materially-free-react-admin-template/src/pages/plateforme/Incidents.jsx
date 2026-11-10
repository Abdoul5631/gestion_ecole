import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Collapse, FormControlLabel, IconButton, MenuItem, Switch,
  TextField, Tooltip, Typography
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import api, { ecoleService } from 'services/api';

const quand = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Les erreurs du serveur, regroupées : quelle page, quelle école, qui, combien de fois — pour trouver vite la panne. */
export default function Incidents() {
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState(null);
  const [ecoles, setEcoles] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const ecole = params.get('ecole') || '';
  const niveau = params.get('niveau') || '';
  const resolus = params.get('resolus') === '1';

  const charger = useCallback(() => {
    setItems(null);
    api.get('/plateforme/incidents/', { params: { ecole: ecole || undefined, niveau: niveau || undefined, resolus: resolus ? 1 : undefined } })
      .then((r) => { setItems(r.data.results || []); setErreur(''); })
      .catch(() => { setItems([]); setErreur('Impossible de charger les incidents.'); });
  }, [ecole, niveau, resolus]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { ecoleService.liste().then((r) => setEcoles(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);

  const filtre = (cle, valeur) => {
    const p = new URLSearchParams(params);
    if (valeur) p.set(cle, valeur); else p.delete(cle);
    setParams(p, { replace: true });
  };

  const traiter = async (g) => {
    try {
      const { data } = await api.post('/plateforme/incidents/resoudre/', { ids: g.ids });
      setSucces(`${data.resolus} incident(s) marqué(s) comme traité(s).`);
      charger();
    } catch {
      setErreur('Action impossible.');
    }
  };

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" mb={2}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Incidents</Typography>
          <Typography variant="body2" color="text.secondary">
            Chaque erreur du serveur, chaque page plantée dans le navigateur d&apos;un utilisateur et chaque réponse de plus de 5 secondes,
            avec l&apos;école, l&apos;utilisateur et la page concernés.
            Les erreurs identiques sont regroupées.
          </Typography>
        </Box>
        <Tooltip title="Actualiser"><IconButton onClick={charger}><RefreshIcon /></IconButton></Tooltip>
      </Box>

      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}

      <Box display="flex" gap={1.5} flexWrap="wrap" alignItems="center" mb={2}>
        <TextField select size="small" label="École" value={ecole} onChange={(e) => filtre('ecole', e.target.value)} sx={{ minWidth: 220 }}>
          <MenuItem value="">Toutes</MenuItem>
          {ecoles.map((e) => <MenuItem key={e.id} value={String(e.id)}>{e.nom_ecole}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Type" value={niveau} onChange={(e) => filtre('niveau', e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Tous</MenuItem>
          <MenuItem value="ERREUR">Erreurs</MenuItem>
          <MenuItem value="LENT">Lenteurs</MenuItem>
          <MenuItem value="CLIENT">Erreurs dans le navigateur</MenuItem>
        </TextField>
        <FormControlLabel control={<Switch checked={resolus} onChange={(e) => filtre('resolus', e.target.checked ? '1' : '')} />} label="Afficher aussi les incidents traités" />
      </Box>

      {items === null ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : items.length === 0 ? (
        <Alert severity="success">Aucun incident{ecole || niveau ? ' pour ce filtre' : ''} : la plateforme fonctionne normalement.</Alert>
      ) : items.map((g) => (
        <Card key={`${g.id}`} sx={{
          borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', mb: 1.25,
          borderLeft: '5px solid', borderLeftColor: g.niveau === 'ERREUR' ? 'error.main' : 'warning.main', opacity: g.resolu ? 0.6 : 1,
        }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Box display="flex" gap={0.75} alignItems="center" flexWrap="wrap" mb={0.5}>
                <Chip size="small" color={g.niveau === 'LENT' ? 'warning' : 'error'}
                  label={g.niveau === 'ERREUR' ? `Erreur ${g.statut_http}` : g.niveau === 'CLIENT' ? 'Navigateur' : 'Lenteur'} />
                <Chip size="small" variant="outlined" label={g.ecole} />
                <Chip size="small" variant="outlined" label={`${g.nombre} fois`} />
                {g.resolu && <Chip size="small" color="success" label="Traité" />}
              </Box>
              <Typography fontWeight={700} sx={{ wordBreak: 'break-word' }}>{g.message || 'Erreur sans message'}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{g.methode} {g.chemin}</Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {g.nombre > 1 ? `Du ${quand(g.premiere)} au ${quand(g.derniere)}` : `Le ${quand(g.derniere)}`}
                {g.utilisateurs.length ? ` · ${g.utilisateurs.join(', ')}` : ' · utilisateur non connecté'}
              </Typography>
            </Box>
            <Box display="flex" gap={0.5} alignItems="center">
              {!g.resolu && (
                <Button size="small" startIcon={<TaskAltIcon />} onClick={() => traiter(g)} sx={{ textTransform: 'none' }}>Marquer traité</Button>
              )}
              {g.detail && (
                <Tooltip title="Détail technique">
                  <IconButton size="small" onClick={() => setOuvert(ouvert === g.id ? null : g.id)}
                    sx={{ transform: ouvert === g.id ? 'rotate(180deg)' : 'none', transition: '0.2s' }}><ExpandMoreIcon /></IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
          <Collapse in={ouvert === g.id} unmountOnExit>
            <Box component="pre" sx={{ m: 0, px: 2, py: 1.5, bgcolor: 'grey.900', color: 'grey.100', fontSize: 12, overflowX: 'auto', maxHeight: 320 }}>
              {g.detail}
            </Box>
          </Collapse>
        </Card>
      ))}
    </Box>
  );
}
