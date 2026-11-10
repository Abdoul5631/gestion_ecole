import { useState } from 'react';
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
import ChangePasswordDialog from 'components/ChangePasswordDialog';

export default function Profile() {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [pwdOpen, setPwdOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const username = authService.getUsername();

  const getRoleLabel = (role) => {
    if (role === 'SUPER_ADMIN') return 'Super administrateur';
    if (role === 'ADMIN') return 'Administrateur';
    if (role === 'ENSEIGNANT') return 'Enseignant';
    if (role === 'SECRETAIRE') return 'Secrétaire';
    if (role === 'COMPTABLE') return 'Comptable';
    if (role === 'SURVEILLANT') return 'Surveillant';
    if (role === 'COMMUNICATION') return 'Responsable du site public';
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
                    {authService.getRoles().map(getRoleLabel).join(' · ')}
                  </Typography>
                </Box>
                <Divider />
                <List>
                  <ListItemButton onClick={() => { setOpen(false); navigate(authService.getRole() === 'ENSEIGNANT' ? '/enseignant/mon-profil' : '/mon-compte'); }}>
                    <ListItemIcon><PersonTwoToneIcon /></ListItemIcon>
                    <ListItemText primary="Mon profil" />
                  </ListItemButton>
                  <ListItemButton onClick={() => { setOpen(false); setPwdOpen(true); }}>
                    <ListItemIcon><SettingsTwoToneIcon /></ListItemIcon>
                    <ListItemText primary="Changer le mot de passe" />
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
        <ChangePasswordDialog open={pwdOpen} onClose={() => setPwdOpen(false)} />
      </Box>
    </ClickAwayListener>
  );
}