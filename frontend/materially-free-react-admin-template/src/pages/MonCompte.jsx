import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockResetIcon from '@mui/icons-material/LockReset';
import api from 'services/api';
import ChangePasswordDialog from 'components/ChangePasswordDialog';

const ROLES = { ADMIN: 'Directeur', SECRETAIRE: 'Secrétaire', COMPTABLE: 'Comptable', SURVEILLANT: 'Surveillant', COMMUNICATION: 'Responsable du site public', ENSEIGNANT: 'Enseignant',
  ELEVE: 'Élève', PARENT: 'Parent', SUPER_ADMIN: 'Super administrateur' };

/** Mon compte : nom, e-mail de connexion, mot de passe. */
export default function MonCompte() {
  const [c, setC] = useState(null);
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', mot_de_passe: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [succes, setSucces] = useState('');
  const [mdpOuvert, setMdpOuvert] = useState(false);

  const charger = (d) => { setC(d); setForm({ prenom: d.prenom || '', nom: d.nom || '', email: d.email || '', mot_de_passe: '' }); };
  useEffect(() => { api.get('/auth/mon-compte/').then((r) => charger(r.data)).catch(() => setErreurs({ detail: 'Impossible de charger votre compte.' })); }, []);

  const emailChange = c && form.email.trim().toLowerCase() !== (c.email || '').toLowerCase();

  const enregistrer = async () => {
    setEnvoi(true); setErreurs({}); setSucces('');
    try {
      const { data } = await api.patch('/auth/mon-compte/', { prenom: form.prenom, nom: form.nom, ...(emailChange ? { email: form.email, mot_de_passe: form.mot_de_passe } : {}) });
      charger(data);
      setSucces(emailChange ? `Votre e-mail est maintenant ${data.email}. Connectez-vous désormais avec cette adresse et le même mot de passe.` : 'Informations enregistrées.');
    } catch (e) {
      const d = e.response?.data || {};
      setErreurs(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])));
    } finally {
      setEnvoi(false);
    }
  };

  if (!c) return erreurs.detail ? <Alert severity="error">{erreurs.detail}</Alert> : <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
        <AccountCircleIcon sx={{ fontSize: 48, color: 'primary.main' }} />
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Mon compte</Typography>
          <Box display="flex" gap={0.75} mt={0.5} flexWrap="wrap">
            <Chip size="small" label={ROLES[c.role] || c.role} />
            {c.ecole && <Chip size="small" variant="outlined" label={c.ecole} />}
          </Box>
        </Box>
      </Box>
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
      {erreurs.detail && <Alert severity="error" sx={{ mb: 2 }}>{erreurs.detail}</Alert>}

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2.5, mb: 2 }}>
        <Typography fontWeight={800} mb={2}>Mes informations</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField label="Prénom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
          <TextField label="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          <TextField label="E-mail" type="email" value={form.email} sx={{ gridColumn: '1 / -1' }}
            onChange={(e) => setForm({ ...form, email: e.target.value })} error={!!erreurs.email}
            helperText={erreurs.email || (c.connexion_par_email ? 'C’est avec cet e-mail que vous vous connectez.' : `Vous vous connectez avec l’identifiant ${c.username}.`)} />
          {emailChange && (
            <>
              <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>
                Après l&apos;enregistrement, vous vous connecterez avec <strong>{form.email.trim().toLowerCase()}</strong> et votre mot de passe
                actuel.{c.role === 'ADMIN' ? ' La plateforme est informée du changement.' : ''}
              </Alert>
              <TextField label="Mot de passe actuel (pour confirmer)" type="password" value={form.mot_de_passe} sx={{ gridColumn: '1 / -1' }}
                onChange={(e) => setForm({ ...form, mot_de_passe: e.target.value })} error={!!erreurs.mot_de_passe} helperText={erreurs.mot_de_passe || ' '}
                autoComplete="current-password" />
            </>
          )}
        </Box>
        <Box display="flex" justifyContent="flex-end" mt={1}>
          <Button variant="contained" onClick={enregistrer} disabled={envoi || (emailChange && !form.mot_de_passe)}>
            {envoi ? <CircularProgress size={20} color="inherit" /> : 'Enregistrer'}
          </Button>
        </Box>
      </Card>

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography fontWeight={800}>Mot de passe</Typography>
          <Typography variant="body2" color="text.secondary">Changez-le régulièrement, et ne le partagez avec personne.</Typography>
        </Box>
        <Button variant="outlined" startIcon={<LockResetIcon />} onClick={() => setMdpOuvert(true)}>Changer le mot de passe</Button>
      </Card>
      <ChangePasswordDialog open={mdpOuvert} onClose={() => setMdpOuvert(false)} />
    </Box>
  );
}
