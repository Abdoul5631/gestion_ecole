import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Alert, InputAdornment, IconButton
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import api from 'services/api';

export default function ChangePasswordDialog({ open, required = false, onClose, onSuccess }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    if (newPassword.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password/', {
        old_password: oldPassword,
        new_password: newPassword,
        refresh: localStorage.getItem('refresh_token') || undefined,
      });
      localStorage.setItem('must_change_password', '0');
      setOldPassword('');
      setNewPassword('');
      setConfirm('');
      if (onSuccess) onSuccess();
      if (onClose && !required) onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Impossible de changer le mot de passe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={required ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {required ? 'Changez votre mot de passe temporaire' : 'Changer le mot de passe'}
      </DialogTitle>
      <DialogContent>
        {required && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Pour continuer, choisissez un mot de passe personnel (8 caractères au moins, difficile à deviner). Personne ne pourra le changer à votre place : notez-le précieusement.
          </Alert>
        )}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!required && (
          <TextField
            fullWidth margin="dense" label="Mot de passe actuel"
            type={show ? 'text' : 'password'}
            value={oldPassword} onChange={(e) => setOldPassword(e.target.value)}
          />
        )}
        <TextField
          fullWidth margin="dense" label="Nouveau mot de passe"
          type={show ? 'text' : 'password'}
          value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShow((s) => !s)}>
                  {show ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />
        <TextField
          fullWidth margin="dense" label="Confirmer"
          type={show ? 'text' : 'password'}
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!required && <Button onClick={onClose} color="inherit">Annuler</Button>}
        <Button variant="contained" onClick={handleSave} disabled={saving || !newPassword}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
