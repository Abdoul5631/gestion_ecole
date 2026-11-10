import { useEffect, useState } from 'react';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useNavigate } from 'react-router-dom';
import { notificationService, getResults } from 'services/api';
import {
  Box, Typography, Card, CardContent, Chip, Alert, Button,
  CircularProgress, Stack
} from '@mui/material';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';
import { useIsOnline } from 'offline/RequireOnline';

import { estEnLigne } from 'offline/reseau';
const TYPE_COLOR = {
  ABSENCE: 'error',
  FRAIS: 'warning',
  BULLETIN: 'success',
  INFO: 'primary',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MesMessages() {
  const navigate = useNavigate();
  const online = useIsOnline();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    readThrough(CacheKeys.messages(), async () => {
      const res = await notificationService.getAll({ page_size: 500 });
      return getResults(res).items;
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

  useEffect(() => { load(); }, []);

  const marquerLu = async (n) => {
    if (n.lu || String(n.id).startsWith('local-')) return;
    try {
      if (online) {
        await notificationService.lire(n.id);
      } else {
        await sendOrQueue({
          kind: 'http',
          label: 'Marquer message lu',
          payload: { method: 'POST', url: `/notifications/${n.id}/lire/`, data: {} },
        });
        setInfo(QUEUED_MSG);
      }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
    } catch {
      setError('Impossible de marquer ce message comme lu.');
    }
  };

  const ouvrir = async (n) => {
    if (!n.lu && !String(n.id).startsWith('local-')) {
      try {
        if (online) {
          await notificationService.lire(n.id);
        } else {
          await sendOrQueue({
            kind: 'http',
            label: 'Marquer message lu',
            payload: { method: 'POST', url: `/notifications/${n.id}/lire/`, data: {} },
          });
          setInfo(QUEUED_MSG);
        }
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
      } catch {
        /* ignore */
      }
    }
    if (n.lien) navigate(n.lien);
  };

  const toutLire = async () => {
    try {
      if (online) {
        await notificationService.toutLire();
      } else {
        await sendOrQueue({
          kind: 'http',
          label: 'Tout marquer lu',
          payload: { method: 'POST', url: '/notifications/tout-lire/', data: {} },
        });
        setInfo(QUEUED_MSG);
      }
      setItems((prev) => prev.map((x) => ({ ...x, lu: true })));
    } catch {
      /* ignore */
    }
  };

  const nonLus = items.filter((n) => !n.lu).length;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Messages
        </Typography>
        <Button size="small" variant="outlined" startIcon={<DoneAllIcon />} onClick={toutLire} disabled={nonLus === 0}>
          {nonLus > 0 ? `Tout marquer comme lu (${nonLus})` : 'Tout est lu'}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Les messages de l’école (absences, frais, bulletin) apparaissent ici.
      </Typography>

      {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo('')}>{info}</Alert>}
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
      ) : items.length === 0 && !error ? (
        <Alert severity="info">Aucun message pour le moment</Alert>
      ) : (
        items.map((n) => (
          <Card
            key={n.id}
            sx={{
              mb: 1.5,
              cursor: n.lien ? 'pointer' : 'default',
              borderLeft: n.lu ? '3px solid transparent' : '3px solid',
              borderLeftColor: n.lu ? 'transparent' : 'primary.main',
              bgcolor: n.lu ? 'background.paper' : 'action.hover',
            }}
            onClick={() => ouvrir(n)}
          >
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" mb={0.5}>
                <Chip
                  size="small"
                  label={n.type_libelle || n.type}
                  color={TYPE_COLOR[n.type] || 'default'}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={n.lu ? 'Lu' : 'Non lu'}
                  color={n.lu ? 'default' : 'primary'}
                />
                <Typography variant="caption" color="text.secondary">
                  {formatDate(n.created_at)}
                </Typography>
                {!n.lu && (
                  <Button size="small" startIcon={<DoneIcon />} sx={{ ml: 'auto !important', textTransform: 'none', fontWeight: 600 }}
                    onClick={(e) => { e.stopPropagation(); marquerLu(n); }}>
                    Marquer comme lu
                  </Button>
                )}
                {n.eleve_nom && (
                  <Typography variant="caption" color="text.secondary">
                    · {n.eleve_nom}
                  </Typography>
                )}
              </Stack>
              <Typography variant="subtitle1" fontWeight={n.lu ? 500 : 700}>
                {n.titre}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {n.message}
              </Typography>
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
}
