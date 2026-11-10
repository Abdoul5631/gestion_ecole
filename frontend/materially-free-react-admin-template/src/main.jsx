import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';

import { startSyncManager } from 'offline/syncManager';
import { ecouterErreursNavigateur } from 'utils/signalerErreur';
import { registerSW } from 'virtual:pwa-register';
import { demarrerPrechargement } from 'offline/prechargement';

/**
 * En dev, un SW qui met en cache les chunks Vite (/.vite/deps) provoque
 * souvent « Cannot read properties of null (reading 'useContext') » :
 * anciennes et nouvelles copies de React se mélangent.
 * Offline / PWA : SW Workbox uniquement en build de production.
 */
async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore
    }
    return;
  }

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      // Vérifie périodiquement s'il y a un nouveau build (nouveaux hashes)
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);
      }
    }
  });
}

setupServiceWorker();
startSyncManager();
demarrerPrechargement();
ecouterErreursNavigateur();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
