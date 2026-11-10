import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const APP_BASE_URL = `${env.VITE_APP_BASE_URL}`;
  const PORT = 3000;
  // Un seul point d'entrée (utile pour le tunnel Cloudflare) : /api et /media vont vers Django
  const proxy = {
    '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    '/media': { target: 'http://127.0.0.1:8000', changeOrigin: false }
  };

  return {
    server: {
      open: true,
      port: PORT,
      host: true,
      allowedHosts: true,
      proxy
    },
    preview: {
      open: false,
      host: true,
      allowedHosts: true,
      proxy
    },
    define: {
      global: 'window'
    },
    resolve: {
      dedupe: ['react', 'react-dom']
    },
    base: APP_BASE_URL,
    plugins: [
      react(),
      jsconfigPaths(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg'],
        // Manifest déjà fourni dans public/manifest.webmanifest
        manifest: false,
        workbox: {
          // Tous les chunks lazy du build courant → dispo hors ligne après install du SW
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
          runtimeCaching: [
            // Photos et logos envoyés par les écoles : la dernière copie reçue reste affichable hors ligne
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/media/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'media-ecole',
                expiration: {
                  maxEntries: 400,
                  maxAgeSeconds: 60 * 60 * 24 * 60
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            // Navigations / HTML : network-first + fallback cache (pas d'index périmé)
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-network-first',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 32,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /\/index\.html$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'html-network-first',
                networkTimeoutSeconds: 3,
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            // Assets hashés : cache-first (filet si hors precache)
            {
              urlPattern: /\/assets\/.+\.(?:js|css)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'assets-cache-first',
                expiration: {
                  maxEntries: 256,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      })
    ]
  };
});
