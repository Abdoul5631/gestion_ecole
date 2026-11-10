import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { eleveService } from 'services/api';
import authService from 'services/auth';
import {
  Box, Card, CardContent, Typography, Avatar, Button, Alert,
  CircularProgress, Grid, Divider
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PersonIcon from '@mui/icons-material/Person';
import PiecesDossier from './PiecesDossier';
import { useIsOnline } from 'offline/RequireOnline';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';

import { estEnLigne } from 'offline/reseau';
export default function DossierEleve() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef();
  const role = authService.getRole();
  const gereDossier = role === 'ADMIN' || authService.aLeRole('SECRETAIRE');
  const canEditPhoto = gereDossier;
  const online = useIsOnline();

  const [eleve, setEleve] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preview, setPreview] = useState(null);

  const load = () => {
    setLoading(true);
    setError('');
    readThrough(CacheKeys.elevesDetail(id), async () => {
      const res = await eleveService.getById(id);
      return res.data;
    })
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        else setEleve(r.data);
      })
      .catch(() => setError(estEnLigne() ? 'Impossible de charger le dossier élève.' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const onPickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    uploadPhoto(file);
  };

  const uploadPhoto = async (file) => {
    if (!estEnLigne()) {
      setError('Connexion requise pour envoyer une photo.');
      setPreview(null);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await eleveService.patch(id, fd);
      setEleve(res.data);
      setPreview(null);
      setSuccess('Photo enregistrée.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Erreur lors de l’envoi de la photo.');
      setPreview(null);
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (!eleve) {
    return (
      <Box>
        <Alert severity="error">{error || 'Élève introuvable.'}</Alert>
        <Button sx={{ mt: 2 }} startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
          Retour
        </Button>
      </Box>
    );
  }

  const photoSrc = preview || eleve.photo_url;
  const parentNom = [eleve.prenom_parent, eleve.nom_parent].filter(Boolean).join(' ') || '—';

  return (
    <Box maxWidth={720} mx="auto">
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
        Retour
      </Button>

      <Typography variant="h4" fontWeight="bold" mb={2} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
        Dossier élève
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        <CardContent>
          <Box display="flex" gap={3} flexWrap="wrap" alignItems="flex-start">
            <Box textAlign="center">
              <Avatar
                src={photoSrc || undefined}
                sx={{ width: 120, height: 120, bgcolor: 'primary.main', fontSize: 40, mx: 'auto' }}
              >
                {!photoSrc && <PersonIcon sx={{ fontSize: 56 }} />}
              </Avatar>
              {canEditPhoto && (
                <Button
                  sx={{ mt: 1.5 }}
                  size="small"
                  variant="outlined"
                  startIcon={<PhotoCameraIcon />}
                  disabled={saving || !online}
                  title={!online ? 'Connexion requise' : ''}
                  onClick={() => fileRef.current?.click()}
                >
                  {!online ? 'Connexion requise' : (eleve.photo_url ? 'Changer la photo' : 'Ajouter une photo')}
                </Button>
              )}
              <input ref={fileRef} type="file" hidden accept="image/*" onChange={onPickPhoto} />
            </Box>

            <Box flex={1} minWidth={220}>
              <Typography variant="h5" fontWeight="bold">
                {eleve.prenom} {eleve.nom}
              </Typography>
              <Typography color="text.secondary" mb={2}>
                Matricule : <strong>{eleve.matricule}</strong>
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={1.5}>
                {[
                  ['Classe', eleve.classe_actuelle],
                  ['Niveau', eleve.niveau_actuel],
                  ['Date de naissance', eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString('fr-FR') : ''],
                  ['Âge', eleve.age != null ? `${eleve.age} an${eleve.age > 1 ? 's' : ''}` : ''],
                  ['Lieu de naissance', eleve.lieu_naissance],
                  ['Sexe', eleve.sexe === 'M' ? 'Garçon' : eleve.sexe === 'F' ? 'Fille' : ''],
                  ['Statut', eleve.is_active === false ? 'Suspendu' : 'Actif'],
                  ['Parent', parentNom === '—' ? '' : parentNom],
                  ['Téléphone parent', eleve.telephone_parent],
                  ...(role === 'ADMIN' ? [['Identifiant de connexion', eleve.username || 'Pas de compte']] : []),
                ].map(([etiquette, valeur]) => (
                  <Grid key={etiquette} size={{ xs: 12, sm: 6 }}>
                    <Typography variant="caption" color="text.secondary">{etiquette}</Typography>
                    <Typography fontWeight="medium" sx={{ wordBreak: 'break-word' }}>{valeur || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {gereDossier && <PiecesDossier eleveId={id} />}

      {role === 'ADMIN' && (
        <Button component={Link} to="/eleves" sx={{ mt: 2 }} variant="text">
          Liste des élèves
        </Button>
      )}
    </Box>
  );
}
