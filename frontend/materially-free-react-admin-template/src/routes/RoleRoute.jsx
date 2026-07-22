import { Navigate } from 'react-router-dom';
import authService from 'services/auth';

/**
 * Route protégée par rôle.
 * Si l'utilisateur n'a pas le bon rôle, il est redirigé vers le dashboard par défaut.
 */
export default function RoleRoute({ children, roles }) {
  const role = authService.getRole();

  // L'admin a accès à toutes les pages sans restriction
  if (role === 'ADMIN' || roles.includes(role)) {
    return children;
  }

  return <Navigate to="/dashboard/default" replace />;
}
