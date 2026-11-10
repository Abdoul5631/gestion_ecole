import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, IconButton, MenuItem, TextField, Tooltip, Typography
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import api from 'services/api';

// où placer le sujet de la photo à côté du texte (le texte est à gauche sur ordinateur)
const CADRAGES = [['8% 40%', 'Sujet à droite du texte'], ['30% 45%', 'Un peu à droite'], ['50% 50%', 'Centré'], ['75% 45%', 'Sujet à gauche']];

/** Page de connexion de la plateforme : le super admin choisit les photos, les textes et la couleur. */
export default function PageAccueil() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ titre: '', sous_titre: '', badge: '', couleur: '#0b3d91' });
  const [credit, setCredit] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const charger = () => api.get('/plateforme/accueil/').then((r) => {
    setData(r.data);
    setForm({ titre: r.data.titre, sous_titre: r.data.sous_titre, badge: r.data.badge, couleur: r.data.couleur });
  }).catch(() => setErreur('Impossible de charger les réglages.'));
  useEffect(() => { charger(); }, []);

  const faire = async (fn, msg) => {
    setEnvoi(true); setErreur(''); setSucces('');
    try { await fn(); if (msg) setSucces(msg); await charger(); }
    catch (e) { const d = e.response?.data; setErreur((d && (d.detail || Object.values(d)[0]?.[0])) || 'Action impossible.'); }
    finally { setEnvoi(false); }
  };

  const ajouterPhoto = (fichier) => {
    if (!fichier) return;
    const fd = new FormData();
    fd.append('image', fichier);
    fd.append('credit', credit);
    faire(() => api.post('/plateforme/accueil/photos/', fd), 'Photo ajoutée : elle est optimisée automatiquement pour charger vite.').then(() => setCredit(''));
  };
  const deplacer = (i, sens) => {
    const ph = data.photos;
    const j = i + sens;
    if (j < 0 || j >= ph.length) return;
    faire(async () => {
      await api.patch(`/plateforme/accueil/photos/${ph[i].id}/`, { ordre: j + 1 });
      await api.patch(`/plateforme/accueil/photos/${ph[j].id}/`, { ordre: i + 1 });
    });
  };

  if (!data) return erreur ? <Alert severity="error">{erreur}</Alert> : <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={1} flexWrap="wrap" mb={2}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Page d&apos;accueil</Typography>
          <Typography variant="body2" color="text.secondary">
            La page de connexion vue par tous les utilisateurs : photos qui défilent, textes et couleur de la plateforme.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<OpenInNewIcon />} href="/login" target="_blank" rel="noopener">Voir la page</Button>
      </Box>
      {erreur && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}
      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2, mb: 2.5 }}>
        <Typography fontWeight={800} mb={0.5}>Photos ({data.photos.length}/8)</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Elles défilent toutes les 6 secondes. Choisissez des photos lumineuses d&apos;élèves, avec l&apos;accord des parents.
          {data.photos_par_defaut && ' Tant que vous n’en ajoutez aucune, les 4 photos livrées avec l’application sont affichées.'}
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, mb: 2 }}>
          {data.photos.map((ph, i) => (
            <Card key={ph.id} sx={{ borderRadius: 2.5, boxShadow: 'none', border: '1px solid', borderColor: 'divider', overflow: 'hidden', opacity: ph.active ? 1 : 0.55 }}>
              <Box component="img" src={ph.url} alt="" sx={{ width: '100%', height: 130, objectFit: 'cover', objectPosition: ph.position, display: 'block' }} />
              <Box sx={{ p: 1.25, display: 'grid', gap: 1 }}>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <Chip size="small" label={`n° ${i + 1}`} />
                  {!ph.active && <Chip size="small" label="Masquée" />}
                  <Box flex={1} />
                  <Tooltip title="Avant"><span><IconButton size="small" disabled={i === 0 || envoi} onClick={() => deplacer(i, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton></span></Tooltip>
                  <Tooltip title="Après"><span><IconButton size="small" disabled={i === data.photos.length - 1 || envoi} onClick={() => deplacer(i, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton></span></Tooltip>
                  <Tooltip title={ph.active ? 'Masquer' : 'Afficher'}>
                    <IconButton size="small" onClick={() => faire(() => api.patch(`/plateforme/accueil/photos/${ph.id}/`, { active: !ph.active }))}>
                      {ph.active ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Retirer">
                    <IconButton size="small" color="error" onClick={() => faire(() => api.delete(`/plateforme/accueil/photos/${ph.id}/`), 'Photo retirée.')}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <TextField select size="small" label="Cadrage" value={CADRAGES.some(([v]) => v === ph.position) ? ph.position : '50% 50%'}
                  onChange={(e) => faire(() => api.patch(`/plateforme/accueil/photos/${ph.id}/`, { position: e.target.value }))}>
                  {CADRAGES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </TextField>
                <TextField size="small" label="Crédit photo" defaultValue={ph.credit}
                  onBlur={(e) => e.target.value !== ph.credit && faire(() => api.patch(`/plateforme/accueil/photos/${ph.id}/`, { credit: e.target.value }))} />
              </Box>
            </Card>
          ))}
        </Box>
        <Box display="flex" gap={1.5} flexWrap="wrap" alignItems="center">
          <TextField size="small" label="Crédit de la nouvelle photo (facultatif)" value={credit} onChange={(e) => setCredit(e.target.value)} sx={{ minWidth: 260 }} />
          <Button component="label" variant="contained" startIcon={envoi ? <CircularProgress size={16} color="inherit" /> : <AddPhotoAlternateIcon />} disabled={envoi || data.photos.length >= 8}>
            Ajouter une photo
            <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { ajouterPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </Button>
          <Typography variant="caption" color="text.secondary">JPEG, PNG ou WebP, 6 Mo au plus. Format paysage conseillé.</Typography>
        </Box>
      </Card>

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider', p: 2 }}>
        <Typography fontWeight={800} mb={1.5}>Textes et couleur</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <TextField size="small" label="Titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })}
            inputProps={{ maxLength: 120 }} helperText="La partie après la virgule s'affiche en dégradé doré." />
          <TextField size="small" label="Badge (au-dessus du titre)" value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })}
            inputProps={{ maxLength: 80 }} helperText="Laissez vide pour ne pas l'afficher." />
          <TextField size="small" label="Phrase sous le titre" value={form.sous_titre} multiline minRows={2} sx={{ gridColumn: { md: '1 / -1' } }}
            onChange={(e) => setForm({ ...form, sous_titre: e.target.value })} inputProps={{ maxLength: 300 }} />
          <Box display="flex" alignItems="center" gap={1.5}>
            <TextField size="small" type="color" label="Couleur de la plateforme" value={form.couleur} sx={{ width: 190 }}
              onChange={(e) => setForm({ ...form, couleur: e.target.value })} />
            <Typography variant="caption" color="text.secondary">Assombrie automatiquement si besoin, pour que le texte reste lisible.</Typography>
          </Box>
        </Box>
        <Box display="flex" justifyContent="flex-end" mt={2}>
          <Button variant="contained" disabled={envoi || !form.titre.trim()} onClick={() => faire(() => api.put('/plateforme/accueil/', form), 'Page d’accueil mise à jour.')}>
            Enregistrer
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
