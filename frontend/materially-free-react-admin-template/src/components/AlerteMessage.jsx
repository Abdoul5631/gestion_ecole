import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertTitle, Button, Snackbar, Typography } from '@mui/material';
import { notificationService } from 'services/api';
import authService from 'services/auth';

const INTERVALLE = 30000;

/** Bandeau en haut de l'écran dès qu'un nouveau message arrive (partout dans l'application). */
export default function AlerteMessage() {
  const navigate = useNavigate();
  const [notif, setNotif] = useState(null);
  const [autres, setAutres] = useState(0);
  const dejaVu = useRef(null);

  const cle = () => `notif_banniere_${authService.getUsername() || ''}`;

  const verifier = () => {
    if (authService.getEcoleStatut() === 'EN_ATTENTE') return;
    notificationService.nonLues().then((res) => {
      const nouvelles = (res.data?.results || []).filter((n) => !n.lu);
      if (dejaVu.current === null) {
        let v = 0;
        try { v = Number(sessionStorage.getItem(cle())) || 0; } catch { /* ignore */ }
        dejaVu.current = v;
      }
      const inedites = nouvelles.filter((n) => n.id > dejaVu.current);
      if (inedites.length) {
        const plusRecente = inedites.reduce((a, b) => (b.id > a.id ? b : a));
        dejaVu.current = plusRecente.id;
        try { sessionStorage.setItem(cle(), String(plusRecente.id)); } catch { /* ignore */ }
        setAutres(inedites.length - 1);
        setNotif(plusRecente);
        window.dispatchEvent(new Event('notifications:refresh'));
      }
    }).catch(() => {});
  };

  useEffect(() => {
    verifier();
    const t = setInterval(verifier, INTERVALLE);
    const surRetour = () => { if (document.visibilityState === 'visible') verifier(); };
    document.addEventListener('visibilitychange', surRetour);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', surRetour); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ouvrir = async () => {
    const n = notif;
    setNotif(null);
    if (!n) return;
    try { await notificationService.lire(n.id); } catch { /* ignore */ }
    window.dispatchEvent(new Event('notifications:refresh'));
    navigate(n.lien || '/messages');
  };

  return (
    <Snackbar
      open={!!notif}
      autoHideDuration={12000}
      onClose={(_, raison) => { if (raison !== 'clickaway') setNotif(null); }}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 64, sm: 72 }, maxWidth: 560, width: 'calc(100% - 24px)' }}
    >
      <Alert
        severity="info" variant="filled" onClose={() => setNotif(null)} sx={{ width: '100%', alignItems: 'flex-start' }}
        action={<Button color="inherit" size="small" onClick={ouvrir} sx={{ fontWeight: 700 }}>Voir</Button>}
      >
        <AlertTitle sx={{ mb: 0.25 }}>{notif?.titre}</AlertTitle>
        <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-line' }}>
          {notif?.message}
        </Typography>
        {autres > 0 && <Typography variant="caption">+ {autres} autre{autres > 1 ? 's' : ''} message{autres > 1 ? 's' : ''}</Typography>}
      </Alert>
    </Snackbar>
  );
}
