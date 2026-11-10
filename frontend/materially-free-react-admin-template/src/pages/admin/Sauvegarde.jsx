import { useState } from 'react';
import authService from 'services/auth';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Button, Alert, CircularProgress
} from '@mui/material';
import BackupIcon from '@mui/icons-material/Backup';
import DownloadIcon from '@mui/icons-material/Download';

export default function Sauvegarde() {
  const isPlateforme = authService.isPlateforme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const telecharger = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.get('/sauvegarde/', { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallback = isPlateforme
        ? `sauvegarde_complete_${Date.now()}.bin`
        : `sauvegarde_ecole_${Date.now()}.json`;
      const filename = match?.[1] || fallback;
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSuccess(
        isPlateforme
          ? 'Sauvegarde complète téléchargée.'
          : 'Sauvegarde de votre école téléchargée.'
      );
    } catch (err) {
      let msg = 'Échec de la sauvegarde.';
      const data = err?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const parsed = JSON.parse(text);
          msg = parsed.detail || msg;
        } catch {
          /* ignore */
        }
      } else if (data?.detail) {
        msg = data.detail;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxWidth={720}>
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <BackupIcon color="primary" sx={{ fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Sauvegarde
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        {isPlateforme
          ? 'Téléchargez une copie de toute la base (mysqldump si disponible, sinon export JSON). Conservez ce fichier en lieu sûr.'
          : 'Téléchargez un fichier JSON contenant uniquement les données de VOTRE école (élèves, notes, caisse, etc.). Les autres établissements ne sont pas inclus.'}
      </Alert>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="body1" mb={2}>
            {isPlateforme
              ? 'Superadmin : sauvegarde complète de la plateforme.'
              : 'Administrateur : sauvegarde limitée à votre établissement.'}
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
            onClick={telecharger}
            disabled={loading}
          >
            Sauvegarder
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
