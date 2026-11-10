// material-ui
import Stack from '@mui/material/Stack';

// project imports
import NavigationDrawer from './Navigation';
import SimpleBar from 'components/third-party/SimpleBar';
import { AppBar, Toolbar } from '@mui/material';
import MarqueEcole from 'components/MarqueEcole';

// ==============================|| DRAWER - CONTENT ||============================== //

export default function DrawerContent() {
  const contentHeight = `calc(100vh - 64px)`;

  return (
    <>
      <AppBar sx={{ position: 'absolute', display: { xs: 'block', lg: 'none' } }}>
        <Toolbar>
          <MarqueEcole largeurMax={240} />
        </Toolbar>
      </AppBar>
      <Toolbar sx={{ zIndex: -1 }} />
      <SimpleBar sx={{ height: contentHeight }}>
        <Stack sx={{ minHeight: contentHeight, p: 1.25, justifyContent: 'space-between' }}>
          <NavigationDrawer />
        </Stack>
      </SimpleBar>
    </>
  );
}
