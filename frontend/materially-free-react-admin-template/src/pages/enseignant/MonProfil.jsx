import { useEffect, useState, useRef } from 'react';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Button, Alert,
  CircularProgress, Divider, Avatar
} from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import SaveIcon from '@mui/icons-material/Save';
import DrawIcon from '@mui/icons-material/Draw';
import PersonIcon from '@mui/icons-material/Person';

export default function MonProfil() {
  const sigRef = useRef();

  const [enseignant, setEnseignant] = useState(null);
  const [currentSigUrl, setCurrentSigUrl] = useState(null);
  const [sigFile, setSigFile]     = useState(null);
  const [sigPreview, setSigPreview] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/auth/me/')
      .then(res => {
        const enseignantId = res.data.enseignant;
        if (!enseignantId) {
          setError("Profil enseignant introuvable.");
          setLoading(false);
          return;
        }
        return api.get(`/enseignants/${enseignantId}/`);
      })
      .then(res => {
        if (!res) return;
        setEnseignant(res.data);
        setCurrentSigUrl(res.data.signature_url || null);
      })
      .catch(() => setError("Impossible de charger votre profil."))
      .finally(() => setLoading(false));
  }, []);

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setSigFile(file);
    setSigPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!sigFile || !enseignant) return;
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('signature', sigFile);
      const res = await api.patch('/enseignants/ma-signature/', fd);
      setCurrentSigUrl(res.data.signature_url || null);
      setSigFile(null);
      setSigPreview(null);
      setSuccess('Signature enregistrée avec succès !');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      const detail = err?.response?.data?.detail
        || (err?.response?.data ? JSON.stringify(err.response.data) : null)
        || err?.message
        || "Erreur lors de l'enregistrement.";
      setError(`Erreur ${err?.response?.status || ''}: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  const sigSrc = sigPreview || currentSigUrl;

  return (
    <Box maxWidth={600} mx="auto">
      <Box display="flex" alignItems="center" gap={1.5} mb={3}>
        <PersonIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Mon Profil
        </Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Infos enseignant */}
      {enseignant && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)', mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontSize: '1.4rem' }}>
                {enseignant.prenom?.[0]}{enseignant.nom?.[0]}
              </Avatar>
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  {enseignant.prenom} {enseignant.nom}
                </Typography>
                {enseignant.email && (
                  <Typography variant="body2" color="text.secondary">{enseignant.email}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">Enseignant</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Signature */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <DrawIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">Ma Signature</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Votre signature apparaîtra sur les bulletins de notes de vos élèves, dans la colonne
            correspondant à votre matière.
          </Typography>

          <Divider sx={{ mb: 3 }} />

          {/* Zone aperçu */}
          <Box
            sx={{
              width: '100%', height: 130, border: '2px dashed',
              borderColor: sigSrc ? 'primary.main' : 'grey.300',
              borderRadius: 2, display: 'flex', alignItems: 'center',
              justifyContent: 'center', overflow: 'hidden', cursor: 'pointer',
              bgcolor: sigSrc ? 'transparent' : 'grey.50',
              mb: 2,
              '&:hover': { borderColor: 'primary.main' },
              // damier transparent pour montrer le fond
              backgroundImage: sigSrc
                ? 'repeating-conic-gradient(#e0e0e0 0% 25%, #fff 0% 50%)'
                : 'none',
              backgroundSize: '16px 16px',
            }}
            onClick={() => sigRef.current.click()}
          >
            {sigSrc ? (
              <Box
                component="img"
                src={sigSrc}
                alt="Signature"
                sx={{ maxWidth: '80%', maxHeight: 110, objectFit: 'contain' }}
              />
            ) : (
              <Box textAlign="center" color="text.secondary">
                <DrawIcon sx={{ fontSize: 40, opacity: 0.25 }} />
                <Typography variant="caption" display="block" mt={0.5}>
                  Cliquer pour sélectionner votre signature (PNG transparent)
                </Typography>
              </Box>
            )}
          </Box>

          <input ref={sigRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFileChange} />

          <Box display="flex" gap={2} flexWrap="wrap">
            <Button variant="outlined" startIcon={<PhotoCameraIcon />}
              onClick={() => sigRef.current.click()}>
              {sigSrc ? 'Changer la signature' : 'Sélectionner un fichier'}
            </Button>

            {sigFile && (
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            )}
          </Box>

          <Alert severity="info" sx={{ mt: 2 }} icon={false}>
            <Typography variant="caption">
              <strong>Conseil :</strong> Utilisez une image PNG avec fond transparent pour un meilleur rendu sur les bulletins.
              Vous pouvez dessiner votre signature avec l'outil fourni par l'administrateur.
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    </Box>
  );
}
