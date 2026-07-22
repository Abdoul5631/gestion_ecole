import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, TextField,
  Button, Alert, CircularProgress, Stack, Divider,
  MenuItem, InputAdornment, IconButton
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SchoolIcon from '@mui/icons-material/School';
import api from '../../services/api';

const ROLES = [
  { value: 'ENSEIGNANT', label: 'Enseignant' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'ELEVE', label: 'Élève' },
];

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'ELEVE' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/users/', form);
      navigate('/login');
    } catch (err) {
      const data = err.response?.data;
      if (data?.username) setError(`Nom d'utilisateur : ${data.username[0]}`);
      else if (data?.email) setError(`Email : ${data.email[0]}`);
      else setError('Une erreur est survenue. Veuillez réessayer.');
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
            <Typography variant="h4" fontWeight="bold" color="primary">
              Créer un compte
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Rejoignez Gestion École
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            fullWidth label="Nom d'utilisateur" name="username"
            value={form.username} onChange={handleChange} sx={{ mb: 2 }} autoFocus
          />
          <TextField
            fullWidth label="Adresse email" name="email" type="email"
            value={form.email} onChange={handleChange} sx={{ mb: 2 }}
          />
          <TextField
            fullWidth label="Mot de passe" name="password"
            type={showPassword ? 'text' : 'password'}
            value={form.password} onChange={handleChange} sx={{ mb: 2 }}
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
          <TextField
            fullWidth select label="Rôle" name="role"
            value={form.role} onChange={handleChange} sx={{ mb: 3 }}
          >
            {ROLES.map((r) => (
              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
            ))}
          </TextField>

          <Button
            fullWidth variant="contained" size="large"
            onClick={handleSubmit}
            disabled={loading || !form.username || !form.password}
            sx={{ borderRadius: 2, py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Créer mon compte'}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" justifyContent="center" spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Déjà un compte ?
            </Typography>
            <Typography
              component={Link} to="/login" variant="body2" color="primary"
              sx={{ textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
            >
              Se connecter
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
