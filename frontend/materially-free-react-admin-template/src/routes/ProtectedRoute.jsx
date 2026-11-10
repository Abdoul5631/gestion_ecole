import { Navigate, useLocation } from 'react-router-dom';
import authService from '../services/auth';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!authService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const path = location.pathname;
  const plateforme = authService.isPlateforme();
  const statut = authService.getEcoleStatut();

  if (plateforme) {
    // pages ouvertes au super admin : établissements, tableau de bord, journal d'activité, sauvegarde
    const permises = ['/plateforme', '/dashboard', '/admin/journal', '/admin/sauvegarde', '/mon-compte'];
    if (!permises.some((p) => path.startsWith(p))) {
      return <Navigate to="/plateforme/ecoles" replace />;
    }
    return children;
  }

  if (statut === 'EN_ATTENTE') {
    if (path !== '/attente-validation') {
      return <Navigate to="/attente-validation" replace />;
    }
    return children;
  }

  if (path === '/attente-validation' || path.startsWith('/plateforme')) {
    return <Navigate to="/dashboard/default" replace />;
  }

  return children;
}
