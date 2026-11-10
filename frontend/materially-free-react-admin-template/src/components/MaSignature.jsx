import { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import api from 'services/api';

/**
 * Réglage fait une seule fois par le comptable : nom, prénom et image de sa signature.
 * Ils sont ensuite imprimés automatiquement sur chaque reçu qu'il délivre.
 */
export default function MaSignature({ open, onClose }) {
  const fichierRef = useRef(null);
  const [etat, setEtat] = useState(null);
  const [form, setForm] = useState({ first_name: '', last_name: '' });
  const [fichier, setFichier] = useState(null);
  const [apercu, setApercu] = useState('');
  const [chargement, setChargement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  useEffect(() => {
    if (!open) return;
    setErreur('');
    setSucces('');
    setFichier(null);
    setApercu('');
    setChargement(true);
    api.get('/caisse/ma-signature/')
      .then((r) => {
        setEtat(r.data);
        setForm({ first_name: r.data.first_name || '', last_name: r.data.last_name || '' });
      })
      .catch((err) => setErreur(err.response?.data?.detail || 'Impossible de charger votre signature.'))
      .finally(() => setChargement(false));
  }, [open]);

  const choisir = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setErreur('Choisissez une image PNG, JPEG ou WEBP.');
      return;
    }
    if (f.size > 1_500_000) {
      setErreur('Image trop lourde (1,5 Mo maximum).');
      return;
    }
    setErreur('');
    setFichier(f);
    setApercu(URL.createObjectURL(f));
  };

  const enregistrer = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setErreur('Indiquez votre prénom et votre nom : ils figurent sur les reçus.');
      return;
    }
    setEnvoi(true);
    setErreur('');
    try {
      const data = new FormData();
      data.append('first_name', form.first_name.trim());
      data.append('last_name', form.last_name.trim());
      if (fichier) data.append('signature', fichier);
      const r = await api.post('/caisse/ma-signature/', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEtat(r.data);
      setFichier(null);
      setApercu('');
      setSucces('Enregistré : vos reçus porteront automatiquement ce nom et cette signature.');
    } catch (err) {
      setErreur(err.response?.data?.detail || "Impossible d'enregistrer.");
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    if (!window.confirm('Retirer votre signature des reçus ?')) return;
    setEnvoi(true);
    try {
      const r = await api.delete('/caisse/ma-signature/');
      setEtat(r.data);
      setSucces('Signature retirée.');
    } catch (err) {
      setErreur(err.response?.data?.detail || 'Impossible de retirer la signature.');
    } finally {
      setEnvoi(false);
    }
  };

  const image = apercu || etat?.signature_url;

  return (
    <Dialog open={open} onClose={() => !envoi && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>Ma signature sur les reçus</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          À régler une seule fois. Votre nom, votre prénom et votre signature sont imprimés automatiquement sur
          chaque reçu que vous délivrez. Le cachet de l’école est celui des paramètres de l’école.
        </Typography>
        {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
        {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
        {chargement ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
          <Box display="grid" gap={2}>
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
              <TextField size="small" label="Prénom" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              <TextField size="small" label="Nom" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </Box>
            <Box>
              <Typography variant="subtitle2" mb={1}>Signature (image)</Typography>
              <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 2, minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#fff', mb: 1 }}>
                {image
                  ? <img src={image} alt="Signature" style={{ maxHeight: 100, maxWidth: '100%' }} />
                  : <Typography variant="body2" color="text.secondary">Aucune signature enregistrée</Typography>}
              </Box>
              <input ref={fichierRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choisir} />
              <Box display="flex" gap={1} flexWrap="wrap">
                <Button variant="outlined" size="small" onClick={() => fichierRef.current?.click()}>
                  {etat?.signature_url || fichier ? 'Changer l’image' : 'Choisir une image'}
                </Button>
                {etat?.signature_url && !fichier && (
                  <Button size="small" color="error" onClick={retirer} disabled={envoi}>Retirer</Button>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Signez sur une feuille blanche, photographiez-la et recadrez serré autour de la signature
                (PNG avec fond transparent idéal). 1,5 Mo maximum.
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={envoi}>Fermer</Button>
        <Button variant="contained" onClick={enregistrer} disabled={envoi || chargement}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
