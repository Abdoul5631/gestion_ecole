import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, TextField,
  Button, Alert, CircularProgress, Stack
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      // Endpoint à implémenter côté backend
      // await api.post('/auth/password-reset/', { email });
      setSuccess(true);
    } catch {
      setError('Aucun compte trouvé avec cette adresse email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)',
      }}
    >
      <Card sx={{ width: 420, borderRadius: 3, boxShadow: 10 }}>
        <CardContent sx={{ p: 4 }}>
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
            <Typography variant="body2" color="text.secondary" mt={1} textAlign="center">
              Entrez votre email pour recevoir un lien de réinitialisation
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {success ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Si un compte existe avec cette adresse, un email de réinitialisation a été envoyé.
            </Alert>
          ) : (
            <>
              <TextField
                fullWidth
                label="Adresse email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                sx={{ mb: 3 }}
                autoFocus
              />
              <Button
                fullWidth variant="contained" size="large"
                onClick={handleSubmit}
                disabled={loading || !email}
                sx={{ borderRadius: 2, py: 1.5 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Envoyer le lien'}
              </Button>
            </>
          )}

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
