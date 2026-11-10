import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { subscribeSync } from './syncManager';

import { estEnLigne } from './reseau';
/** Affiche "Connexion requise" et bloque le contenu si hors ligne. */
export default function RequireOnline({ children, message = 'Connexion requise' }) {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : estEnLigne());

  useEffect(() => subscribeSync((s) => setOnline(s.online)), []);

  if (!online) {
    return (
      <Box>
        <Alert severity="warning" sx={{ mb: 2 }}>
          {message}. Cette fonctionnalité n’est pas disponible hors ligne.
        </Alert>
      </Box>
    );
  }

  return children;
}

export function useIsOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : estEnLigne());
  useEffect(() => subscribeSync((s) => setOnline(s.online)), []);
  return online;
}
