import { useEffect, useState } from 'react';
import { actualiteService, parametresService, getResults } from 'services/api';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, IconButton, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CampaignIcon from '@mui/icons-material/Campaign';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ImageIcon from '@mui/icons-material/Image';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PushPinIcon from '@mui/icons-material/PushPin';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CloseIcon from '@mui/icons-material/Close';
import CollectionsIcon from '@mui/icons-material/Collections';

const VIDE = {
  titre: '', contenu: '', publie: true, epingle: false, image: null, retirer_image: false, apercu: '',
  photos: [], nouvelles: [], retirees: [], // galerie : photos déjà en ligne, à ajouter, à retirer
};
const MAX_PHOTOS = 20;
const TAILLE_MAX = 5 * 1024 * 1024;

const formatDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  : '');

export default function ActualitesEcole() {
  const [liste, setListe] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [slug, setSlug] = useState('');
  const [vitrineActive, setVitrineActive] = useState(true);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(VIDE);
  const [saving, setSaving] = useState(false);

  const charger = () => {
    setLoading(true);
    actualiteService.getAll()
      .then((res) => setListe(getResults(res).items))
      .catch(() => setError('Impossible de charger les actualités.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    charger();
    parametresService.get().then((res) => {
      setSlug(res.data?.slug || '');
      setVitrineActive(res.data?.vitrine_active !== false);
    }).catch(() => {});
  }, []);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const ouvrir = (a) => {
    setError('');
    if (a) {
      setEditId(a.id);
      setForm({ ...VIDE, titre: a.titre, contenu: a.contenu, publie: a.publie, epingle: a.epingle, apercu: a.image_url || '', photos: a.photos || [] });
    } else {
      setEditId(null);
      setForm(VIDE);
    }
    setOpen(true);
  };

  const choisirImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setForm((prev) => ({ ...prev, image: f, retirer_image: false, apercu: URL.createObjectURL(f) }));
  };

  // galerie : plusieurs photos à la fois, 20 au plus, 5 Mo chacune
  const photosRestantes = form.photos.filter((p) => !form.retirees.includes(p.id));
  const nbGalerie = photosRestantes.length + form.nouvelles.length;
  const ajouterPhotos = (e) => {
    const choisis = [...(e.target.files || [])];
    e.target.value = '';
    const trop = choisis.filter((f) => f.size > TAILLE_MAX);
    const bons = choisis.filter((f) => f.size <= TAILLE_MAX).slice(0, Math.max(0, MAX_PHOTOS - nbGalerie));
    if (trop.length) setError(`${trop.length} photo(s) dépassent 5 Mo et n'ont pas été ajoutées.`);
    else if (bons.length < choisis.length) setError(`${MAX_PHOTOS} photos au plus par actualité.`);
    setForm((prev) => ({ ...prev, nouvelles: [...prev.nouvelles, ...bons.map((f) => ({ fichier: f, apercu: URL.createObjectURL(f) }))] }));
  };

  const enregistrer = async () => {
    if (!form.titre.trim() || !form.contenu.trim()) {
      setError('Le titre et le texte sont obligatoires.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('titre', form.titre.trim());
      fd.append('contenu', form.contenu);
      fd.append('publie', form.publie ? 'true' : 'false');
      fd.append('epingle', form.epingle ? 'true' : 'false');
      if (form.image) fd.append('image', form.image);
      if (form.retirer_image) fd.append('retirer_image', 'true');
      form.nouvelles.forEach((n) => fd.append('photos', n.fichier));
      form.retirees.forEach((id) => fd.append('retirer_photos', id));
      if (editId) await actualiteService.update(editId, fd);
      else await actualiteService.create(fd);
      setOpen(false);
      flash(editId ? 'Actualité modifiée.' : (form.publie ? 'Actualité publiée sur la page de l\'école.' : 'Brouillon enregistré.'));
      charger();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.photos?.[0] || d?.image?.[0] || d?.titre?.[0] || d?.detail || "Impossible d'enregistrer l'actualité.");
    } finally {
      setSaving(false);
    }
  };

  const basculer = async (a, champ) => {
    try {
      const fd = new FormData();
      fd.append(champ, a[champ] ? 'false' : 'true');
      await actualiteService.update(a.id, fd);
      charger();
    } catch {
      setError('Modification impossible.');
    }
  };

  const retirer = async (a) => {
    if (!window.confirm(`Supprimer définitivement « ${a.titre} » ?`)) return;
    try {
      await actualiteService.delete(a.id);
      flash('Actualité supprimée.');
      charger();
    } catch {
      setError('Suppression impossible.');
    }
  };

  const lien = slug
    ? `${window.location.origin}${import.meta.env.VITE_APP_BASE_URL || ''}/ecole/${slug}`.replace(/([^:]\/)\/+/g, '$1')
    : '';

  return (
    <Box>
      <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Avatar variant="rounded" sx={{ width: 48, height: 48, borderRadius: 2.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.1), color: 'primary.main' }}>
            <CampaignIcon />
          </Avatar>
          <Box>
            <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.2 }}>
              Actualités de l&apos;école
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Les articles publiés ici apparaissent sur la page publique de l&apos;école.
            </Typography>
          </Box>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap">
          {lien && (
            <Button variant="outlined" startIcon={<OpenInNewIcon />} href={lien} target="_blank" rel="noopener noreferrer" sx={{ textTransform: 'none', borderRadius: 2.5 }}>
              Voir la page publique
            </Button>
          )}
          <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => ouvrir(null)} sx={{ textTransform: 'none', borderRadius: 2.5, fontWeight: 600 }}>
            Nouvelle actualité
          </Button>
        </Box>
      </Box>

      {!vitrineActive && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          La page publique est désactivée : personne ne verra ces actualités. Activez-la dans Paramètres de l&apos;école, onglet « Site vitrine ».
        </Alert>
      )}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : liste.length === 0 ? (
        <Card sx={{ borderRadius: 3, border: '1px dashed', borderColor: 'divider', boxShadow: 'none' }}>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <CampaignIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography fontWeight={700} mt={1}>Aucune actualité pour le moment</Typography>
            <Typography color="text.secondary" mb={2}>Annoncez la rentrée, une réunion, des résultats…</Typography>
            <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={() => ouvrir(null)} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
              Rédiger la première
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {liste.map((a) => (
            <Card key={a.id} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', opacity: a.publie ? 1 : 0.75 }}>
              <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
                {a.image_url ? (
                  <Box component="img" src={a.image_url} alt="" sx={{ width: { xs: '100%', sm: 160 }, height: 110, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                ) : (
                  <Box sx={{ width: { xs: '100%', sm: 160 }, height: 110, borderRadius: 2, flexShrink: 0, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon sx={{ color: 'text.disabled', fontSize: 36 }} />
                  </Box>
                )}
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box display="flex" gap={0.75} flexWrap="wrap" mb={0.75}>
                    {a.publie
                      ? <Chip size="small" color="success" variant="outlined" label="Publié" />
                      : <Chip size="small" icon={<VisibilityOffIcon />} label="Brouillon" />}
                    {a.epingle && <Chip size="small" color="primary" icon={<PushPinIcon />} label="En tête de page" />}
                    {(a.photos || []).length > 0 && <Chip size="small" variant="outlined" icon={<CollectionsIcon />} label={`${a.photos.length} photo${a.photos.length > 1 ? 's' : ''} en galerie`} />}
                    <Chip size="small" variant="outlined" label={formatDate(a.date_publication)} />
                  </Box>
                  <Typography variant="h5" fontWeight={700} sx={{ wordBreak: 'break-word' }}>{a.titre}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {a.contenu}
                  </Typography>
                </Box>
                <Box display="flex" sx={{ flexShrink: 0 }}>
                  <Tooltip title={a.publie ? 'Retirer de la page publique' : 'Publier'}>
                    <Switch checked={a.publie} onChange={() => basculer(a, 'publie')} />
                  </Tooltip>
                  <Tooltip title={a.epingle ? 'Ne plus mettre en tête' : 'Mettre en tête de page'}>
                    <IconButton color={a.epingle ? 'primary' : 'default'} onClick={() => basculer(a, 'epingle')}><PushPinIcon /></IconButton>
                  </Tooltip>
                  <Tooltip title="Modifier"><IconButton onClick={() => ouvrir(a)}><EditIcon /></IconButton></Tooltip>
                  <Tooltip title="Supprimer"><IconButton color="error" onClick={() => retirer(a)}><DeleteIcon /></IconButton></Tooltip>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? "Modifier l'actualité" : 'Nouvelle actualité'}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Titre" value={form.titre} fullWidth inputProps={{ maxLength: 160 }}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              helperText={`${form.titre.length}/160`} />
            <TextField label="Texte" value={form.contenu} fullWidth multiline minRows={5}
              onChange={(e) => setForm({ ...form, contenu: e.target.value })} />

            <Box>
              <Typography variant="subtitle2">Photo de couverture (facultative)</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>Elle illustre l&apos;actualité sur la page de l&apos;école.</Typography>
              {form.apercu && !form.retirer_image && (
                <Box component="img" src={form.apercu} alt="" sx={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 2, mb: 1 }} />
              )}
              <Box display="flex" gap={1} flexWrap="wrap">
                <Button component="label" variant="outlined" startIcon={<ImageIcon />} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
                  {form.apercu && !form.retirer_image ? 'Changer la couverture' : 'Ajouter une couverture'}
                  <input hidden type="file" accept="image/*" onChange={choisirImage} />
                </Button>
                {form.apercu && !form.retirer_image && (
                  <Button color="error" onClick={() => setForm({ ...form, image: null, retirer_image: true, apercu: '' })} sx={{ textTransform: 'none' }}>
                    Retirer la couverture
                  </Button>
                )}
              </Box>
            </Box>

            <Box>
              <Box display="flex" alignItems="baseline" justifyContent="space-between" gap={1}>
                <Typography variant="subtitle2">Galerie de photos (facultative)</Typography>
                <Typography variant="caption" color="text.secondary">{nbGalerie} / {MAX_PHOTOS}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                Ajoutez autant de photos que vous voulez de l&apos;événement : les visiteurs les feront défiler dans l&apos;article.
              </Typography>
              {nbGalerie > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 1, mb: 1.25 }}>
                  {[
                    ...photosRestantes.map((p) => ({ cle: `p${p.id}`, src: p.url, retirer: () => setForm((prev) => ({ ...prev, retirees: [...prev.retirees, p.id] })) })),
                    ...form.nouvelles.map((n, i) => ({ cle: `n${i}`, src: n.apercu, nouvelle: true, retirer: () => setForm((prev) => ({ ...prev, nouvelles: prev.nouvelles.filter((_, j) => j !== i) })) })),
                  ].map((p) => (
                    <Box key={p.cle} sx={{ position: 'relative', aspectRatio: '1', borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: p.nouvelle ? 'primary.main' : 'divider' }}>
                      <Box component="img" src={p.src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <IconButton size="small" onClick={p.retirer} aria-label="Retirer la photo"
                        sx={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}>
                        <CloseIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                      {p.nouvelle && (
                        <Box sx={{ position: 'absolute', bottom: 4, left: 4, px: 0.75, borderRadius: 1, bgcolor: 'primary.main', color: '#fff', fontSize: 10, fontWeight: 700 }}>Nouvelle</Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              <Button component="label" variant="outlined" startIcon={<CollectionsIcon />} disabled={nbGalerie >= MAX_PHOTOS} sx={{ textTransform: 'none', borderRadius: 2.5 }}>
                {nbGalerie ? 'Ajouter d’autres photos' : 'Ajouter des photos'}
                <input hidden type="file" accept="image/*" multiple onChange={ajouterPhotos} />
              </Button>
            </Box>

            <Box>
              <FormControlLabel control={<Switch checked={form.publie} onChange={(e) => setForm({ ...form, publie: e.target.checked })} />}
                label={form.publie ? 'Publié sur la page publique' : 'Brouillon (invisible du public)'} />
              <FormControlLabel control={<Switch checked={form.epingle} onChange={(e) => setForm({ ...form, epingle: e.target.checked })} />}
                label="Mettre en tête de page" />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} color="inherit" disabled={saving}>Annuler</Button>
          <Button variant="contained" disableElevation onClick={enregistrer} disabled={saving} sx={{ textTransform: 'none', borderRadius: 2.5, fontWeight: 600 }}>
            {saving ? 'Enregistrement…' : (form.publie ? 'Enregistrer et publier' : 'Enregistrer')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
