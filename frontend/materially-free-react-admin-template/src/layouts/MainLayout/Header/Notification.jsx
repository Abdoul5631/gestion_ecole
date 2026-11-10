import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Badge from '@mui/material/Badge';
import Chip from '@mui/material/Chip';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Popper from '@mui/material/Popper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

import MainCard from 'components/cards/MainCard';
import SimpleBar from 'components/third-party/SimpleBar';
import { notificationService } from 'services/api';
import authService from 'services/auth';

import NotificationsNoneTwoToneIcon from '@mui/icons-material/NotificationsNoneTwoTone';
import AccessTimeTwoToneIcon from '@mui/icons-material/AccessTimeTwoTone';

const TYPE_COLOR = {
  ABSENCE: 'error',
  FRAIS: 'warning',
  BULLETIN: 'success',
  INFO: 'primary',
};

function tempsRelatif(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const j = Math.round(h / 24);
  return `${j} j`;
}

export default function Notification() {
  const navigate = useNavigate();
  const role = authService.getRole();
  const hasMessagesPage = !!role && role !== 'PLATEFORME';
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = () => {
    if (authService.getEcoleStatut() === 'EN_ATTENTE') return; // le super admin a lui aussi ses notifications
    notificationService
      .nonLues()
      .then((res) => {
        setUnread(res.data.count || 0);
        setItems(res.data.results || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('notifications:refresh', load);
    return () => { clearInterval(t); window.removeEventListener('notifications:refresh', load); };
  }, []);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
    setOpen((prev) => !prev);
    if (!open) {
      notificationService
        .getAll()
        .then((res) => {
          const data = Array.isArray(res.data) ? res.data : res.data.results ?? [];
          setItems(data.slice(0, 20));
        })
        .catch(() => {});
    }
  };

  const handleClickAway = () => setOpen(false);

  const ouvrir = async (n) => {
    if (!n.lu) {
      try {
        await notificationService.lire(n.id);
        setUnread((u) => Math.max(0, u - 1));
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    if (n.lien) navigate(n.lien);
  };

  const toutLire = async () => {
    try {
      await notificationService.toutLire();
      setUnread(0);
      setItems((prev) => prev.map((x) => ({ ...x, lu: true })));
    } catch {
      /* ignore */
    }
  };

  const canBeOpen = open && Boolean(anchorEl);
  const id = canBeOpen ? 'notification-popper' : undefined;

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
      <Box>
        <IconButton size="small" onClick={handleClick} aria-label="Notifications">
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsNoneTwoToneIcon sx={{ fontSize: { sm: 24 }, color: 'background.paper' }} />
          </Badge>
        </IconButton>

        <Popper
          id={id}
          open={open}
          anchorEl={anchorEl}
          placement="bottom-end"
          transition
          disablePortal
          modifiers={[{ name: 'offset', options: { offset: [0, 10] } }]}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={100}>
              <MainCard content={false} sx={{ width: 340 }}>
                <Stack direction="row" sx={{ px: 2, py: 1.5, justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Notifications
                  </Typography>
                  {unread > 0 && (
                    <Button size="small" onClick={toutLire}>
                      Tout lu
                    </Button>
                  )}
                </Stack>
                <SimpleBar sx={{ height: 360 }}>
                  <List disablePadding>
                    {items.length === 0 ? (
                      <Box sx={{ p: 3 }}>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Aucun message pour le moment
                        </Typography>
                      </Box>
                    ) : (
                      items.map((n) => (
                        <ListItemButton key={n.id} onClick={() => ouvrir(n)} sx={{ opacity: n.lu ? 0.7 : 1, alignItems: 'flex-start' }}>
                          <ListItemText
                            primary={
                              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                                <Chip label={n.type_libelle || n.type} size="small" color={TYPE_COLOR[n.type] || 'default'} />
                                <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
                                  <AccessTimeTwoToneIcon sx={{ fontSize: 11 }} />
                                  <Typography variant="caption">{tempsRelatif(n.created_at)}</Typography>
                                </Stack>
                              </Stack>
                            }
                            secondary={
                              <>
                                <Typography variant="subtitle2" fontWeight={n.lu ? 400 : 700}>
                                  {n.titre}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {n.message}
                                </Typography>
                              </>
                            }
                          />
                        </ListItemButton>
                      ))
                    )}
                  </List>
                </SimpleBar>
                {hasMessagesPage && (
                  <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
                    <Button
                      fullWidth
                      size="small"
                      onClick={() => {
                        setOpen(false);
                        navigate('/messages');
                      }}
                    >
                      Voir tous les messages
                    </Button>
                  </Box>
                )}
              </MainCard>
            </Fade>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
