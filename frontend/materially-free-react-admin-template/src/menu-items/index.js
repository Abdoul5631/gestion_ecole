import dashboard from './dashboard';
import getEcoleMenu from './ecole';
import authService from 'services/auth';

export function getMenuItems(role, hasExamenBlanc = false) {
  if (authService.isPlateforme() || role === 'SUPER_ADMIN') {
    return { items: [dashboard, ...getEcoleMenu('SUPER_ADMIN', hasExamenBlanc)] };
  }
  if (authService.getEcoleStatut() === 'EN_ATTENTE') {
    return { items: [] };
  }
  return {
    items: [dashboard, ...getEcoleMenu(role, hasExamenBlanc, authService.getRoles())]
  };
}

const menuItems = {
  items: [dashboard, ...getEcoleMenu(authService.getRole())]
};
export default menuItems;
