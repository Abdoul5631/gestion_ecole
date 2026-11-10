import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';

// material-ui
import useMediaQuery from '@mui/material/useMediaQuery';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';

// project imports
import Drawer from './Drawer';
import Header from './Header';
import AlerteMessage from 'components/AlerteMessage';
import BandeauAnnonces from 'components/BandeauAnnonces';
import Breadcrumbs from 'components/Breadcrumbs';
import ChangePasswordDialog from 'components/ChangePasswordDialog';
import authService from 'services/auth';
import useStackedTables from 'hooks/useStackedTables';

import { DRAWER_WIDTH } from 'config';
import { handlerDrawerOpen, useGetMenuMaster } from 'states/menu';

// ==============================|| MAIN LAYOUT ||============================== //

export default function MainLayout() {
  const upLG = useMediaQuery((theme) => theme.breakpoints.up('lg'));
  useStackedTables();

  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = menuMaster.isDashboardDrawerOpened;
  const [forcePwd, setForcePwd] = useState(authService.mustChangePassword());

  useEffect(() => {
    handlerDrawerOpen(upLG);
  }, [upLG]);

  // drawer toggle handler on resize window
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawer = useMemo(() => <Drawer />, [drawerOpen]);

  return (
    <Stack direction="row" width={1}>
      <Header />
      <AlerteMessage />
      {drawer}
      <Box
        component="main"
        sx={{
          width: { xs: 1, lg: drawerOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : 1 },
          p: { xs: 2, sm: 3, md: 5 },
          ml: { xs: 0, lg: 'auto' }
        }}
      >
        <Toolbar />
        <Breadcrumbs />
        <BandeauAnnonces />
        <Outlet />
      </Box>
      <ChangePasswordDialog
        open={forcePwd}
        required
        onSuccess={() => setForcePwd(false)}
      />
    </Stack>
  );
}
