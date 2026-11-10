import { useEffect, useRef, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { messageErreur } from 'utils/erreurs';
import { CODE_HORS_LIGNE } from 'offline/cacheHttp';

/**
 * Filet de sécurité : si une action échoue et que l'écran n'affiche rien (erreur non interceptée par la page),
 * l'utilisateur voit quand même une explication claire en français au lieu d'un bouton qui ne fait rien.
 */
export default function ErreurGlobale() {
  const [message, setMessage] = useState('');
  const dernier = useRef({ texte: '', heure: 0 });

  useEffect(() => {
    const surRejet = (e) => {
      const r = e.reason;
      if (!r?.isAxiosError) return;
      const statut = r.response?.status;
      if (statut === 401 || (statut === 503 && r.response?.data?.maintenance)) return; // reconnexion / page de maintenance
      if (r.code === 'ERR_CANCELED' || r.code === CODE_HORS_LIGNE) return; // hors ligne : la page le dit elle-même, pas d'alerte à répétition
      const texte = messageErreur(r);
      const maintenant = Date.now();
      if (dernier.current.texte === texte && maintenant - dernier.current.heure < 4000) return;
      dernier.current = { texte, heure: maintenant };
      setMessage(texte);
    };
    window.addEventListener('unhandledrejection', surRejet);
    return () => window.removeEventListener('unhandledrejection', surRejet);
  }, []);

  return (
    <Snackbar open={Boolean(message)} autoHideDuration={9000} onClose={() => setMessage('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert severity="error" variant="filled" onClose={() => setMessage('')} sx={{ maxWidth: 560 }}>{message}</Alert>
    </Snackbar>
  );
}
