import { Link } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Alert, Stack
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function ForgotPassword() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        p: 2,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
      }}
    >
      <Card sx={{ width: "100%", maxWidth: 420, borderRadius: 3, boxShadow: 10 }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Box display="flex" flexDirection="column" alignItems="center" mb={3}>
            <Box
              sx={{
                backgroundColor: '#1976d2',
                borderRadius: '50%',
                width: 70, height: 70,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mb: 2
              }}
            >
              <SchoolIcon sx={{ color: 'white', fontSize: 40 }} />
            </Box>
            <Typography variant="h5" fontWeight="bold" color="primary">
              Mot de passe oublié
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 2 }}>
            Pour votre sécurité, ni le directeur ni le personnel de l&apos;école ne peuvent changer votre mot de passe.
            Contactez le support de la plateforme : après vérification de votre identité, il vous donnera un mot de passe
            provisoire que vous changerez dès votre connexion.
          </Alert>

          <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ mt: 2 }}>
            <ArrowBackIcon fontSize="small" color="primary" />
            <Typography
              component={Link} to="/login" variant="body2" color="primary"
              sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Retour à la connexion
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
