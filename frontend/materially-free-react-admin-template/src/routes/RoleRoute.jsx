import { Navigate } from 'react-router-dom';
import authService from 'services/auth';

export default function RoleRoute({ children, roles = [], plateformeOnly = false, plateformeOk = false, sansDirecteur = false }) {
  if (plateformeOnly) {
    return authService.isPlateforme()
      ? children
      : <Navigate to="/dashboard/default" replace />;
  }

  if (plateformeOk && authService.isPlateforme()) {
    return children;
  }

  const role = authService.getRole();
  if ((role === 'ADMIN' && !sansDirecteur) || roles.some((r) => authService.getRoles().includes(r))) {
    return children;
  }

  return <Navigate to="/dashboard/default" replace />;
}
