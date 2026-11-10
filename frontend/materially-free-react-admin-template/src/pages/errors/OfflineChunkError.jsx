import { Box, Button, Typography } from '@mui/material';
import { useNavigate, useRouteError, isRouteErrorResponse } from 'react-router-dom';

import { estEnLigne } from 'offline/reseau';
import { signalerErreur } from 'utils/signalerErreur';
export const OFFLINE_CHUNK_MSG =
  "Cette page n'est pas disponible hors ligne. Ouvrez-la une fois avec internet, puis réessayez.";

export function isChunkLoadError(error) {
  if (!error) return false;
  const msg = String(error.message || error);
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Loading chunk') ||
    error?.name === 'ChunkLoadError'
  );
}

/** UI partagée (Loadable + errorElement). */
export function OfflineChunkFallback({ message = OFFLINE_CHUNK_MSG, showBack = false }) {
  return (
    <Box
      sx={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 3,
        textAlign: 'center'
      }}
    >
      <Typography variant="h5" fontWeight={600} color="text.primary">
        Page indisponible
      </Typography>
      <Typography variant="body1" color="text.secondary" maxWidth={480}>
        {message}
      </Typography>
      {showBack ? <OfflineBackButton /> : null}
      <Button variant="text" onClick={() => window.location.reload()}>
        Recharger
      </Button>
    </Box>
  );
}

function OfflineBackButton() {
  const navigate = useNavigate();
  return (
    <Button variant="contained" onClick={() => navigate(-1)}>
      Retour
    </Button>
  );
}

/**
 * errorElement React Router — message FR à la place de « Unexpected Application Error ».
 */
export default function OfflineChunkError() {
  const error = useRouteError();

  const offlineOrChunk =
    (typeof navigator !== 'undefined' && !estEnLigne()) || isChunkLoadError(error);

  let message = OFFLINE_CHUNK_MSG;
  if (!offlineOrChunk && error) {
    message = isRouteErrorResponse(error) && error.status === 404
      ? "Cette page n'existe pas. Vérifiez l'adresse ou revenez à l'accueil."
      : "Un problème est survenu sur cette page. L'erreur a été signalée à l'équipe technique. "
        + 'Rechargez la page ; si le problème continue, contactez votre administrateur.';
    if (!isRouteErrorResponse(error)) signalerErreur(error, 'Page plantée');
  }

  return <OfflineChunkFallback message={message} showBack />;
}
