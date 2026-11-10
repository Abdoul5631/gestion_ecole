import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainRoutes from './MainRoutes';
import PagesRoutes from './PagesRoutes';
import Login from 'pages/auth/Login';
import Register from 'pages/auth/Register';
import ForgotPassword from 'pages/auth/ForgotPassword';
import NotFound from 'pages/errors/NotFound';
import OfflineChunkError from 'pages/errors/OfflineChunkError';
import ProtectedRoute from './ProtectedRoute';
import authService, { homeForUser } from 'services/auth';
import VitrineEcole from 'pages/public/VitrineEcole';
import FormulaireDossier from 'pages/public/FormulaireDossier';

const offlineErrorElement = <OfflineChunkError />;

// Wrapper pour protéger toutes les routes principales
const ProtectedMainRoutes = {
  ...MainRoutes,
  element: (
    <ProtectedRoute>
      {MainRoutes.element}
    </ProtectedRoute>
  ),
  errorElement: offlineErrorElement
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: authService.isAuthenticated()
      ? <Navigate to={homeForUser()} replace />
      : <Login />,
    errorElement: offlineErrorElement
  },
  {
    path: '/register',
    element: authService.isAuthenticated()
      ? <Navigate to={homeForUser()} replace />
      : <Register />,
    errorElement: offlineErrorElement
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />,
    errorElement: offlineErrorElement
  },
  {
    path: '/ecole/:slug',
    element: <VitrineEcole />,
    errorElement: offlineErrorElement
  },
  {
    path: '/ecole/:slug/connexion',
    element: authService.isAuthenticated()
      ? <Navigate to={homeForUser()} replace />
      : <Login />,
    errorElement: offlineErrorElement
  },
  {
    path: '/ecole/:slug/dossier',
    element: <FormulaireDossier />,
    errorElement: offlineErrorElement
  },
  {
    path: '/',
    element: <Navigate to="/login" replace />
  },
  ProtectedMainRoutes,
  { ...PagesRoutes, errorElement: offlineErrorElement },
  { path: '*', element: <NotFound />, errorElement: offlineErrorElement }
], {
  basename: import.meta.env.VITE_APP_BASE_URL
});

export default router;