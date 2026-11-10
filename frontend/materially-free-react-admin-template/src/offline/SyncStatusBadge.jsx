import { useEffect, useState } from 'react';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import LockIcon from '@mui/icons-material/Lock';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { subscribeSync, SyncStatus, flushOutbox, discardFailed, discardItem, listOutboxItems } from './syncManager';

export default function SyncStatusBadge() {
  const [state, setState] = useState({
    status: SyncStatus.UP_TO_DATE,
    pending: 0,
    online: true,
    lastError: null,
  });
  const [toast, setToast] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [items, setItems] = useState([]);

  const refreshItems = () => listOutboxItems().then(setItems).catch(() => setItems([]));
  useEffect(() => { if (detailOpen) refreshItems(); }, [detailOpen, state.pending, state.lastError]);

  useEffect(() => subscribeSync(setState), []);

  useEffect(() => {
    if (state.lastError) setToast(state.lastError);
  }, [state.lastError]);

  let label = 'À jour';
  let color = 'success';
  let icon = <CloudDoneIcon />;
  let tip = 'Données synchronisées';

  if (state.lastError && state.online && state.status !== SyncStatus.SYNCING) {
    label = state.pending > 0 ? `Erreur sync (${state.pending})` : 'Erreur sync';
    color = 'error';
    icon = <ErrorOutlineIcon />;
    tip = `${state.lastError} — cliquez pour abandonner l'action en erreur`;
  } else if (state.status === SyncStatus.OFFLINE || !state.online) {
    label = state.pending > 0 ? `Hors ligne (${state.pending})` : 'Hors ligne';
    color = 'warning';
    icon = <CloudOffIcon />;
    tip = state.pending > 0
      ? `${state.pending} modification(s) en attente d'envoi`
      : 'Mode hors ligne — les saisies seront envoyées à la reconnexion';
  } else if (state.status === SyncStatus.SYNCING) {
    label = state.pending > 0 ? `Synchronisation… (${state.pending})` : 'Synchronisation…';
    color = 'info';
    icon = <SyncIcon />;
    tip = 'Envoi des données en attente';
  } else if (state.status === SyncStatus.AUTH_PAUSED) {
    label = state.pending > 0 ? `Reconnectez-vous (${state.pending})` : 'Reconnectez-vous';
    color = 'error';
    icon = <LockIcon />;
    tip = 'Session expirée — reconnectez-vous. La file d’attente est conservée.';
  } else if (state.pending > 0) {
    label = `À envoyer (${state.pending})`;
    color = 'info';
    icon = <SyncIcon />;
    tip = 'Cliquez pour synchroniser';
  }

  return (
    <>
      <Tooltip title={tip}>
        <Chip
          size="small"
          color={color}
          icon={icon}
          label={label}
          onClick={() => {
            if (!state.online) return;
            if (state.lastError && state.status !== SyncStatus.AUTH_PAUSED) {
              setDetailOpen(true);
              return;
            }
            flushOutbox();
          }}
          sx={{
            fontWeight: 600,
            maxWidth: { xs: 150, sm: 220 },
            '& .MuiChip-label': { px: 0.75 },
            cursor: state.online ? 'pointer' : 'default',
          }}
        />
      </Tooltip>
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Actions non synchronisées ({items.length})</DialogTitle>
        <DialogContent dividers>
          {items.length === 0 && <Typography>Plus rien en attente.</Typography>}
          {items.map((it) => (
            <Box key={it.id} sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px dashed', borderColor: 'divider' }}>
              <Typography fontWeight={700} fontSize={14}>{it.label}</Typography>
              <Typography fontSize={13} color={it.last_error ? 'error' : 'text.secondary'}>
                {it.last_error || 'En attente d’envoi'}{it.last_status ? ` (code ${it.last_status})` : ''}
              </Typography>
              {it.last_detail && (
                <Typography fontSize={11} color="text.secondary" sx={{ wordBreak: 'break-all' }}>{it.last_detail}</Typography>
              )}
              <Button size="small" color="error" onClick={() => discardItem(it.id).then(refreshItems)} sx={{ mt: 0.5 }}>
                Abandonner cette action
              </Button>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { flushOutbox(); setDetailOpen(false); }}>Réessayer</Button>
          <Button color="error" onClick={() => { discardFailed().then(() => setDetailOpen(false)); }}>Tout abandonner</Button>
          <Button onClick={() => setDetailOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!toast}
        autoHideDuration={8000}
        onClose={() => setToast('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setToast('')} variant="filled" sx={{ width: '100%' }}>
          {toast}
        </Alert>
      </Snackbar>
    </>
  );
}
