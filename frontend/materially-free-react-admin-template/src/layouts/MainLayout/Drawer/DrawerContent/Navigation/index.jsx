// material-ui
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

// project imports
import { getMenuItems } from 'menu-items';
import NavGroup from './NavGroup';
import authService from 'services/auth';
import useHasExamenBlancAccess from 'hooks/useHasExamenBlancAccess';

// ==============================|| DRAWER CONTENT - RESPONSIVE DRAWER ||============================== //

export default function NavigationDrawer() {
  // Lire le rôle à chaque rendu pour que le menu se mette à jour après login
  const role = authService.getRole();
  const { hasAccess: hasExamenBlanc } = useHasExamenBlancAccess();
  const menuItems = getMenuItems(role, hasExamenBlanc);

  const navGroups = menuItems.items.map((item, index) => {
    switch (item.type) {
      case 'group':
        return <NavGroup key={index} item={item} />;
      default:
        return (
          <Typography key={index} variant="h6" color="error" align="center">
            Fix - Navigation Group
          </Typography>
        );
    }
  });

  return <Box sx={{ transition: 'all 0.3s ease-in-out' }}>{navGroups}</Box>;
}
