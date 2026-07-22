import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import SchoolIcon from '@mui/icons-material/School';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center"
      minHeight="80vh" textAlign="center" px={3}>
      <SchoolIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2, opacity: 0.4 }} />
      <Typography variant="h1" fontWeight="bold" color="text.secondary">404</Typography>
      <Typography variant="h5" mb={1}>Page introuvable</Typography>
      <Typography color="text.secondary" mb={4}>
        Cette page n'existe pas ou vous n'avez pas accès à ce contenu.
      </Typography>
      <Box display="flex" gap={2}>
        <Button variant="contained" onClick={() => navigate('/dashboard/default')}>
          Tableau de bord
        </Button>
        <Button variant="outlined" onClick={() => navigate(-1)}>
          Retour
        </Button>
      </Box>
    </Box>
  );
}
