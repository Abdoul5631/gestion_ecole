import { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { equipeService } from 'services/api';

export default function MessageSecretariat() {
  const [form, setForm] = useState({ titre: '', message: '' });
  const [envoi, setEnvoi] = useState(false);
  const [succes, setSucces] = useState('');
  const [erreur, setErreur] = useState('');

  const envoyer = async () => {
    setErreur('');
    setSucces('');
    if (!form.titre.trim() || !form.message.trim()) {
      setErreur('Écrivez un titre et un message.');
      return;
    }
    setEnvoi(true);
    try {
      const res = await equipeService.messageSecretariat({ titre: form.titre.trim(), message: form.message.trim() });
      setSucces(res.data?.detail || 'Message envoyé à la secrétaire.');
      setForm({ titre: '', message: '' });
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible d'envoyer le message.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={1} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Écrire à la secrétaire
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Une absence à signaler, un document à préparer, une question sur un élève : la secrétaire reçoit
        votre message tout de suite en haut de son écran.
      </Typography>
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField fullWidth size="small" label="Objet" value={form.titre}
            onChange={(e) => setForm({ ...form, titre: e.target.value })} inputProps={{ maxLength: 120 }} />
          <TextField fullWidth multiline minRows={5} label="Message" value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            inputProps={{ maxLength: 2000 }} helperText={`${form.message.length}/2000`} />
          <Box>
            <Button variant="contained" startIcon={<SendIcon />} onClick={envoyer} disabled={envoi}>
              Envoyer
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
