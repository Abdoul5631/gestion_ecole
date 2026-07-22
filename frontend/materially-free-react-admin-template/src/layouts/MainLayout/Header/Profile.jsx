import { useEffect, useState } from 'react';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Popper from '@mui/material/Popper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import { useLocation, useNavigate } from 'react-router-dom';
import MainCard from 'components/cards/MainCard';
import AccountCircleTwoToneIcon from '@mui/icons-material/AccountCircleTwoTone';
import MeetingRoomTwoToneIcon from '@mui/icons-material/MeetingRoomTwoTone';
import PersonTwoToneIcon from '@mui/icons-material/PersonTwoTone';
import SettingsTwoToneIcon from '@mui/icons-material/SettingsTwoTone';
import authService from 'services/auth';

export default function Profile() {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const username = authService.getUsername();
  const role = authService.getRole();

  const getRoleLabel = (role) => {
    if (role === 'ADMIN') return 'Administrateur';
    if (role === 'ENSEIGNANT') return 'Enseignant';
    if (role === 'PARENT') return 'Parent';
    if (role === 'ELEVE') return 'Élève';
    return role;
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    setOpen((prev) => !prev);
  };

  const handleClickAway = () => setOpen(false);

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const canBeOpen = open && Boolean(anchorEl);
  const id = canBeOpen ? 'profile-popper' : undefined;

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box>
        <IconButton size="small" onClick={handleClick}>
          <AccountCircleTwoToneIcon sx={{ fontSize: { sm: 24 }, color: 'background.paper' }} />
        </IconButton>
        <Popper
          id={id}
          open={open}
          anchorEl={anchorEl}
          placement="bottom-start"
          transition
          disablePortal
          modifiers={[{ name: 'offset', options: { offset: [0, 10] } }]}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={100}>
              <MainCard content={false} sx={{ width: 250 }}>
                {/* Infos utilisateur */}
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {username}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getRoleLabel(role)}
                  </Typography>
                </Box>
                <Divider />
                <List>
                  <ListItemButton onClick={() => { setOpen(false); navigate('/dashboard/default'); }}>
                    <ListItemIcon><PersonTwoToneIcon /></ListItemIcon>
                    <ListItemText primary="Mon profil" />
                  </ListItemButton>
                  <ListItemButton onClick={() => { setOpen(false); }}>
                    <ListItemIcon><SettingsTwoToneIcon /></ListItemIcon>
                    <ListItemText primary="Paramètres" />
                  </ListItemButton>
                  <Divider />
                  <ListItemButton onClick={handleLogout} sx={{ color: 'error.main' }}>
                    <ListItemIcon>
                      <MeetingRoomTwoToneIcon color="error" />
                    </ListItemIcon>
                    <ListItemText primary="Se déconnecter" />
                  </ListItemButton>
                </List>
              </MainCard>
            </Fade>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}