import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainRoutes from './MainRoutes';
import PagesRoutes from './PagesRoutes';
import Login from 'pages/auth/Login';
import Register from 'pages/auth/Register';
import ForgotPassword from 'pages/auth/ForgotPassword';
import NotFound from 'pages/errors/NotFound';
import ProtectedRoute from './ProtectedRoute';
import authService from 'services/auth';

// Wrapper pour protéger toutes les routes principales
const ProtectedMainRoutes = {
  ...MainRoutes,
  element: (
    <ProtectedRoute>
      {MainRoutes.element}
    </ProtectedRoute>
  )
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: authService.isAuthenticated()
      ? <Navigate to="/dashboard/default" replace />
      : <Login />
  },
  {
    path: '/register',
    element: authService.isAuthenticated()
      ? <Navigate to="/dashboard/default" replace />
      : <Register />
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />
  },
  {
    path: '/',
    element: <Navigate to="/login" replace />
  },
  ProtectedMainRoutes,
  PagesRoutes,
  { path: '*', element: <NotFound /> }
], {
  basename: import.meta.env.VITE_APP_BASE_URL
});

export default router;