import { useEffect, useState } from 'react';
import { smsService, classeService } from 'services/api';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, CircularProgress, Alert, TextField, MenuItem, Card, CardContent, Grid,
  Button, IconButton, Collapse
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import SendIcon from '@mui/icons-material/Send';
import CampaignIcon from '@mui/icons-material/Campaign';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';

import { estEnLigne } from 'offline/reseau';
const STATUT_COLOR = {
  SIMULATED: 'info',
  SENT: 'success',
  PENDING: 'warning',
  FAILED: 'error',
};

const LIBELLE_STATUT = { SIMULATED: 'Simulé', SENT: 'Envoyé', PENDING: 'En attente', FAILED: 'Échec' };

export default function FileSms() {
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statut, setStatut] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [config, setConfig] = useState(null);
  const [sending, setSending] = useState(false);
  const [ouvert, setOuvert] = useState(true); // liste des messages envoyés dépliée
  const [form, setForm] = useState({ destinataires: 'tous', classe_id: '', titre: '', message: '', type: 'INFO' });

  const ok = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 8000); };

  const loadSms = () => {
    setLoading(true);
    const params = statut ? { statut } : {};
    const key = CacheKeys.smsOutbox(`envois-${statut || 'all'}`);
    readThrough(key, async () => {
      const res = await smsService.envois(params);
      return res.data?.results || [];
    })
      .then((r) => {
        if (r.neverCached) {
          setError(NEVER_CACHED_MSG);
          setItems([]);
        } else {
          setItems(r.data || []);
        }
      })
      .catch(() => setError(estEnLigne() ? 'Impossible de charger les messages.' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    readThrough(CacheKeys.classes(), async () => {
      const res = await classeService.getAll();
      return Array.isArray(res.data) ? res.data : res.data?.results ?? [];
    }).then((r) => { if (!r.neverCached) setClasses(r.data || []); }).catch(() => {});
    if (estEnLigne()) {
      smsService.config().then((res) => setConfig(res.data)).catch(() => setConfig(null));
    }
  }, []);

  useEffect(() => { loadSms(); }, [statut]);

  const envoyer = async () => {
    if (!form.titre.trim() || !form.message.trim()) {
      setError('Écrivez un titre et un texte.');
      return;
    }
    if (form.destinataires === 'classe' && !form.classe_id) {
      setError('Choisissez une classe.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const payload = {
        titre: form.titre.trim(),
        message: form.message.trim(),
        type: form.type,
        destinataires: form.destinataires,
        classe_id: form.destinataires === 'classe' ? form.classe_id : undefined,
      };
      const result = await sendOrQueue({
        kind: 'message',
        label: `Message: ${payload.titre}`,
        payload,
      });
      if (result.queued) {
        ok(QUEUED_MSG);
      } else {
        const d = result.data || {};
        ok(d.message_ui || `Message envoyé à ${d.parents || d.notifications || 0} parent(s). Ils le voient dans Messages.`);
        loadSms();
      }
      setForm({ ...form, titre: '', message: '' });
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible d'envoyer le message.");
    } finally {
      setSending(false);
    }
  };

  const relancer = async () => {
    setSending(true);
    setError('');
    try {
      const result = await sendOrQueue({
        kind: 'http',
        label: 'Relance frais SMS',
        payload: { method: 'POST', url: '/sms/relancer/', data: {} },
      });
      if (result.queued) {
        ok(QUEUED_MSG);
      } else {
        const d = result.data || {};
        ok(`${d.envoyes || 0} relance(s) de frais envoyée(s). Les parents voient le message dans Messages.`);
        loadSms();
      }
    } catch {
      setError('Impossible d’envoyer les relances.');
    } finally {
      setSending(false);
    }
  };

  const simule = config && !config.configured;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={1} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Messages
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Écrivez un message et envoyez-le à tous les parents, ou seulement aux parents d’une classe.
        Chaque parent le retrouve dans son espace, menu Messages.
      </Typography>

      {simule && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Sans API SMS, le parent voit le message dans son espace. Le SMS est seulement simulé.
        </Alert>
      )}
      {config?.configured && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Passerelle SMS active ({config.provider}) · expéditeur {config.sender}.
        </Alert>
      )}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight="bold" mb={2}>Écrire un message</Typography>
          <Grid container spacing={2} alignItems="flex-start">
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select fullWidth size="small" label="Destinataires"
                value={form.destinataires}
                onChange={(e) => setForm({ ...form, destinataires: e.target.value })}
              >
                <MenuItem value="tous">Tous les parents</MenuItem>
                <MenuItem value="classe">Une classe</MenuItem>
              </TextField>
            </Grid>
            {form.destinataires === 'classe' && (
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select fullWidth size="small" label="Classe"
                  value={form.classe_id}
                  onChange={(e) => setForm({ ...form, classe_id: e.target.value })}
                >
                  <MenuItem value="">— Choisir —</MenuItem>
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth size="small" label="Type"
                value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <MenuItem value="INFO">Information</MenuItem>
                <MenuItem value="FRAIS">Frais</MenuItem>
                <MenuItem value="ABSENCE">Absence</MenuItem>
                <MenuItem value="BULLETIN">Bulletin</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth size="small" label="Titre"
                value={form.titre}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
                placeholder="Ex. Réunion des parents"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth size="small" multiline minRows={3} label="Texte"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                inputProps={{ maxLength: 800 }}
                helperText={`${form.message.length}/800`}
              />
            </Grid>
            <Grid size={{ xs: 12 }} display="flex" gap={1} flexWrap="wrap">
              <Button
                variant="contained" startIcon={<SendIcon />}
                onClick={envoyer} disabled={sending}
              >
                Envoyer
              </Button>
              <Button
                variant="outlined" startIcon={<CampaignIcon />}
                onClick={relancer} disabled={sending}
              >
                Relancer les impayés
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField select fullWidth size="small" label="Statut SMS" value={statut}
                onChange={(e) => setStatut(e.target.value)}>
                <MenuItem value="">Tous</MenuItem>
                <MenuItem value="SIMULATED">Simulé</MenuItem>
                <MenuItem value="SENT">Envoyé</MenuItem>
                <MenuItem value="PENDING">En attente</MenuItem>
                <MenuItem value="FAILED">Échec</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Paper sx={{ overflow: 'hidden' }}>
        <Box onClick={() => setOuvert((o) => !o)} sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.25,
          cursor: 'pointer', bgcolor: 'grey.100', '&:hover': { bgcolor: 'grey.200' },
        }}>
          <Typography fontWeight={700}>
            Messages envoyés{!loading && ` (${items.length})`}
          </Typography>
          <IconButton size="small" aria-label={ouvert ? 'Fermer la liste' : 'Ouvrir la liste'}>
            {ouvert ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </Box>
        <Collapse in={ouvert} timeout="auto">
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell>Envoyé à</TableCell>
                    <TableCell>Statut</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        Aucun envoi pour l’instant. Utilisez « Envoyer » ci-dessus.
                      </TableCell>
                    </TableRow>
                  ) : items.map((g) => (
                    <TableRow key={g.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{g.date ? new Date(g.date).toLocaleString('fr-FR') : '—'}</TableCell>
                      <TableCell>{g.type_libelle}</TableCell>
                      <TableCell sx={{ maxWidth: 360 }}>{g.message}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{g.total} parent{g.total > 1 ? 's' : ''}</TableCell>
                      <TableCell>
                        {Object.entries(g.statuts).map(([k, n]) => (
                          <Chip key={k} size="small" sx={{ mr: 0.5, mb: 0.5 }} color={STATUT_COLOR[k] || 'default'}
                            label={`${LIBELLE_STATUT[k] || k} : ${n}`} />
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Collapse>
      </Paper>
    </Box>
  );
}
