import dashboard from './dashboard';
import getEcoleMenu from './ecole';
import authService from 'services/auth';

export function getMenuItems(role, hasExamenBlanc = false) {
  return {
    items: [dashboard, ...getEcoleMenu(role, hasExamenBlanc)]
  };
}

const menuItems = {
  items: [dashboard, ...getEcoleMenu(authService.getRole())]
};
export default menuItems;
