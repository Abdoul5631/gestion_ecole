import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, TextField,
  Button, Alert, CircularProgress, InputAdornment, IconButton,
  Divider, Stack
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SchoolIcon from '@mui/icons-material/School';
import authService from '../../services/auth';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authService.login(form.username, form.password);
      // Rediriger selon le rôle vers la page la plus pertinente
      if (data.role === 'ADMIN') navigate('/dashboard/default');
      else if (data.role === 'ENSEIGNANT') navigate('/enseignant/cours');
      else if (data.role === 'ELEVE') navigate('/dashboard/default');
      else if (data.role === 'PARENT') navigate('/dashboard/default');
      else navigate('/dashboard/default');
    } catch (err) {
      setError('Nom d\'utilisateur ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleSubmit();
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
      <Card sx={{ width: 400, borderRadius: 3, boxShadow: 10 }}>
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
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
            <Typography variant="h4" fontWeight="bold" color="primary">
              Gestion École
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Connectez-vous à votre espace
            </Typography>
          </Box>

          {/* Erreur */}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Formulaire */}
          <TextField
            fullWidth
            label="Nom d'utilisateur"
            name="username"
            value={form.username}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            sx={{ mb: 2 }}
            autoFocus
          />
          <TextField
            fullWidth
            label="Mot de passe"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            sx={{ mb: 3 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleSubmit}
            disabled={loading || !form.username || !form.password}
            sx={{ borderRadius: 2, py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Se connecter'}
          </Button>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <Typography
              component={Link}
              to="/forgot-password"
              variant="body2"
              color="primary"
              sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              Mot de passe oublié ?
            </Typography>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Button
            fullWidth
            variant="outlined"
            size="large"
            component={Link}
            to="/register"
            sx={{ borderRadius: 2, py: 1.5 }}
          >
            Créer un compte
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}