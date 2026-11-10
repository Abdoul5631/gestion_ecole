import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api, { parametresService } from 'services/api';
import authService from 'services/auth';
import { couleursDuLogo, couleurLisible, couleurValide } from 'utils/couleurs';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Grid, Alert, CircularProgress, Avatar, Divider, InputAdornment, Tabs, Tab
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SchoolIcon from '@mui/icons-material/School';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import SaveIcon from '@mui/icons-material/Save';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import PersonIcon from '@mui/icons-material/Person';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import ArticleIcon from '@mui/icons-material/Article';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import ApartmentIcon from '@mui/icons-material/Apartment';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LanguageIcon from '@mui/icons-material/Language';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ParametresStructure from './ParametresStructure';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';
import { useIsOnline } from 'offline/RequireOnline';

import { estEnLigne } from 'offline/reseau';
// Cartes sobres : bordure fine, pas d'ombre
const carteSx = { borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none' };
// Champs et boutons arrondis, halo de couleur au focus (appliqué à toute la page, onglets compris)
const formulaireSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 3, bgcolor: 'background.paper', transition: 'box-shadow .15s, border-color .15s',
    '& fieldset': { borderColor: 'divider' },
    '&:hover fieldset': { borderColor: 'text.disabled' },
    '&.Mui-focused': { boxShadow: (t) => `0 0 0 4px ${alpha(t.palette.primary.main, 0.14)}` },
    '&.Mui-focused fieldset': { borderWidth: 1.5 },
  },
  '& .MuiInputAdornment-root .MuiSvgIcon-root': { color: 'primary.main', opacity: 0.75 },
  '& .MuiButton-root': { borderRadius: 2.5, textTransform: 'none', fontWeight: 600 },
};
// Titre de section dans un formulaire
const SectionTitre = ({ children }) => (
  <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.8, fontWeight: 700, display: 'block' }}>{children}</Typography>
);

const EMPTY_FORM = {
  nom_ecole: '', slogan: '', adresse: '', ville: '', telephone: '',
  email: '', directeur: '', devise: '', couleur_primaire: '#1976d2',
  direction_regionale: '', direction_provinciale: '', boite_postale: '', annee_creation: '',
  seuil_passage: 10, mot_de_passe_defaut_eleves: '', mot_de_passe_defaut_parents: '', mot_de_passe_defaut_enseignants: '',
  slug: '', presentation_vitrine: '', vitrine_active: true,
  vitrine_atouts: [], vitrine_horaires: '', vitrine_whatsapp: '', vitrine_facebook: '', vitrine_carte: '',
  vitrine_afficher_tarifs: true, vitrine_afficher_classes: true,
};

// Champs du site public : seuls ceux-là sont modifiables par le responsable du site (le serveur refuse le reste)
const CHAMPS_SITE = ['presentation_vitrine', 'vitrine_active', 'vitrine_atouts', 'vitrine_horaires', 'vitrine_whatsapp',
  'vitrine_facebook', 'vitrine_carte', 'vitrine_afficher_tarifs', 'vitrine_afficher_classes'];

/** `seulementSite` : page du responsable du site public (rôle donné par le directeur) — onglet « Site vitrine » seul. */
export default function ParametresEcole({ seulementSite = false }) {
  const fileRef   = useRef();
  const sigRef    = useRef();
  const tamponRef = useRef();
  const [tab, setTab] = useState(seulementSite ? 1 : 0);
  const online = useIsOnline();

  const [form, setForm] = useState(EMPTY_FORM);
  const [logoFile,       setLogoFile]       = useState(null);
  const [logoPreview,    setLogoPreview]    = useState(null);
  const [currentLogo,    setCurrentLogo]    = useState(null);
  const [couleursLogo,   setCouleursLogo]   = useState([]); // couleurs dominantes du logo
  const [sigFile,        setSigFile]        = useState(null);
  const [sigPreview,     setSigPreview]     = useState(null);
  const [currentSig,     setCurrentSig]     = useState(null);
  const [tamponFile,     setTamponFile]     = useState(null);
  const [tamponPreview,  setTamponPreview]  = useState(null);
  const [currentTampon,  setCurrentTampon]  = useState(null);
  const photoRef = useRef();
  const [photoFile,      setPhotoFile]      = useState(null); // photo de l'établissement (site public)
  const [photoPreview,   setPhotoPreview]   = useState(null);
  const [currentPhoto,   setCurrentPhoto]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [success, setSuccess]   = useState('');
  const [error,   setError]     = useState('');
  const [copied, setCopied] = useState(false);

  const publicUrl = form.slug
    ? `${window.location.origin}${import.meta.env.VITE_APP_BASE_URL || ''}/ecole/${form.slug}`.replace(/([^:]\/)\/+/g, '$1')
    : '';

  const copyPublicLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    readThrough(CacheKeys.parametres(), async () => {
      const res = await parametresService.get();
      return res.data;
    })
      .then(r => {
        if (r.neverCached) {
          setError(NEVER_CACHED_MSG);
          return;
        }
        const data = r.data || {};
        // eslint-disable-next-line no-unused-vars
        const { logo_url, logo, signature_url, signature, tampon_url, tampon, vitrine_photo, vitrine_photo_url, ...rest } = data;
        setCurrentPhoto(vitrine_photo_url || null);
        setForm({ ...EMPTY_FORM, ...rest });
        setCurrentLogo(logo_url || null);
        if (logo_url) couleursDuLogo(logo_url).then(setCouleursLogo);
        setCurrentSig(signature_url || null);
        setCurrentTampon(tampon_url || null);
      })
      .catch(() => setError(estEnLigne() ? 'Erreur de chargement' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  // atouts du site public (4 au plus)
  const atouts = Array.isArray(form.vitrine_atouts) ? form.vitrine_atouts : [];
  const majAtout = (i, champ, valeur) => setForm({ ...form, vitrine_atouts: atouts.map((a, j) => (j === i ? { ...a, [champ]: valeur } : a)) });
  const ajouterAtout = () => setForm({ ...form, vitrine_atouts: [...atouts, { titre: '', texte: '' }] });
  const retirerAtout = (i) => setForm({ ...form, vitrine_atouts: atouts.filter((_, j) => j !== i) });

  const handleLogoChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    const apercu = URL.createObjectURL(file);
    setLogoPreview(apercu);
    // nouveau logo : l'application prend sa couleur principale (modifiable avant d'enregistrer)
    couleursDuLogo(apercu).then((cs) => {
      setCouleursLogo(cs);
      if (cs[0]) setForm((f) => ({ ...f, couleur_primaire: cs[0] }));
    });
  };

  const handleSigChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setSigFile(file);
    setSigPreview(URL.createObjectURL(file));
  };

  const handleTamponChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setTamponFile(file);
    setTamponPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const hasFiles = !!(logoFile || sigFile || tamponFile || photoFile);
      if (hasFiles && !online) {
        setError('Connexion requise pour envoyer logo, signature, tampon ou photo.');
        setSaving(false);
        return;
      }
      if (hasFiles) {
        const formData = new FormData();
        Object.entries(form).forEach(([k, v]) => {
          if (k === 'slug' || (seulementSite && !CHAMPS_SITE.includes(k))) return;
          if (v !== null && v !== undefined) formData.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
        });
        if (logoFile && !seulementSite)    formData.append('logo', logoFile);
        if (sigFile && !seulementSite)     formData.append('signature', sigFile);
        if (tamponFile && !seulementSite)  formData.append('tampon', tamponFile);
        if (photoFile)   formData.append('vitrine_photo', photoFile);
        await parametresService.update(formData);
        setSuccess('Paramètres enregistrés avec succès !');
      } else {
        const payload = seulementSite
          ? Object.fromEntries(CHAMPS_SITE.map((k) => [k, form[k]]))
          : { ...form };
        delete payload.slug;
        const result = await sendOrQueue({
          kind: 'http',
          label: 'Paramètres école',
          payload: { method: 'PUT', url: '/parametres/', data: payload },
        });
        setSuccess(result.queued ? QUEUED_MSG : 'Paramètres enregistrés avec succès !');
      }
      if (couleurValide(form.couleur_primaire)) authService.setCouleurEcole(form.couleur_primaire);
      api.get('/auth/me/').then((r) => authService.setIdentiteEcole(r.data || {})).catch(() => {});
      setLogoFile(null);
      setSigFile(null);
      setTamponFile(null);
      setPhotoFile(null);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      const msg = err?.response?.data
        ? JSON.stringify(err.response.data)
        : "Erreur lors de l'enregistrement.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const logoSrc = logoPreview || currentLogo;

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  return (
    <Box sx={formulaireSx}>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Avatar variant="rounded" sx={{ width: 48, height: 48, borderRadius: 2.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.1), color: 'primary.main' }}>
          <SettingsIcon />
        </Avatar>
        <Box>
          <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, lineHeight: 1.2 }}>
            {seulementSite ? 'Site public de l’école' : "Paramètres de l'école"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {seulementSite
              ? 'Présentation, photo, atouts, contacts et ce que le site affiche. Les actualités se gèrent dans « Actualités du site ».'
              : 'Identité, bulletin, année, niveaux, classes, matières et frais. Ces données sont propres à votre école.'}
          </Typography>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {!seulementSite && <Tabs value={tab} onChange={(_, v) => setTab(v)}
        variant="scrollable" allowScrollButtonsMobile
        sx={{
          mb: 3, borderBottom: '1px solid', borderColor: 'divider',
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: 14, minHeight: 48, gap: 0.5 },
          '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' },
        }}>
        <Tab icon={<SchoolIcon />} iconPosition="start" label="Identité" />
        <Tab icon={<LanguageIcon />} iconPosition="start" label="Site vitrine" />
        <Tab icon={<ArticleIcon />} iconPosition="start" label="Bulletin" />
        <Tab icon={<AccountBalanceWalletIcon />} iconPosition="start" label="Frais" />
        <Tab icon={<VpnKeyIcon />} iconPosition="start" label="Comptes & accès" />
      </Tabs>}

      {/* ── ONGLET 1 : Identité ── */}
      {tab === 0 && (
        <Grid container spacing={3}>
          {/* Logo + couleur */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ ...carteSx, height: '100%' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 4 }}>
                <Typography variant="h6" fontWeight="bold" alignSelf="flex-start">Logo de l'école</Typography>

                <Box
                  sx={{
                    width: 140, height: 140, borderRadius: 3, border: '2px dashed',
                    borderColor: 'primary.light', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', overflow: 'hidden', cursor: 'pointer',
                    bgcolor: 'grey.50', '&:hover': { borderColor: 'primary.main' }
                  }}
                  onClick={() => fileRef.current.click()}
                >
                  {logoSrc ? (
                    <Box component="img" src={logoSrc} alt="Logo"
                      sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Box textAlign="center" color="text.secondary">
                      <SchoolIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                      <Typography variant="caption" display="block">Cliquer pour ajouter</Typography>
                    </Box>
                  )}
                </Box>

                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogoChange} />

                <Button variant="outlined" size="small" startIcon={<PhotoCameraIcon />}
                  onClick={() => fileRef.current.click()}>
                  {logoSrc ? 'Changer le logo' : 'Ajouter un logo'}
                </Button>

                <Divider flexItem />

                {/* Signature / Cachet du Directeur */}
                <Box width="100%">
                  <Typography variant="subtitle2" mb={1} fontWeight="bold">Cachet / Signature du Directeur</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    Cette image apparaîtra en bas à droite de chaque bulletin
                  </Typography>
                  <Box
                    sx={{
                      width: '100%', height: 90, borderRadius: 2, border: '2px dashed',
                      borderColor: 'warning.light', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', overflow: 'hidden', cursor: 'pointer',
                      bgcolor: 'grey.50', '&:hover': { borderColor: 'warning.main' }
                    }}
                    onClick={() => sigRef.current.click()}
                  >
                    {(sigPreview || currentSig) ? (
                      <Box component="img" src={sigPreview || currentSig} alt="Cachet"
                        sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Box textAlign="center" color="text.secondary">
                        <PersonIcon sx={{ fontSize: 32, opacity: 0.3 }} />
                        <Typography variant="caption" display="block">Cachet du directeur</Typography>
                      </Box>
                    )}
                  </Box>
                  <input ref={sigRef} type="file" accept="image/*" hidden onChange={handleSigChange} />
                  <Button size="small" sx={{ mt: 1 }} startIcon={<PhotoCameraIcon />}
                    onClick={() => sigRef.current.click()}>
                    {(sigPreview || currentSig) ? 'Changer le cachet' : 'Ajouter le cachet'}
                  </Button>
                </Box>

                <Divider flexItem />

                {/* Tampon de l'école */}
                <Box width="100%">
                  <Typography variant="subtitle2" mb={1} fontWeight="bold">Tampon de l'école</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                    Cachet rond officiel — apparaît sur les bulletins à côté de la signature
                  </Typography>
                  <Box
                    sx={{
                      width: 110, height: 110, borderRadius: '50%', border: '2px dashed',
                      borderColor: 'success.light', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', overflow: 'hidden', cursor: 'pointer',
                      bgcolor: 'grey.50', mx: 'auto',
                      '&:hover': { borderColor: 'success.main' }
                    }}
                    onClick={() => tamponRef.current.click()}
                  >
                    {(tamponPreview || currentTampon) ? (
                      <Box component="img" src={tamponPreview || currentTampon} alt="Tampon"
                        sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <Box textAlign="center" color="text.secondary">
                        <Typography variant="caption" display="block" fontSize="1.6rem">🔵</Typography>
                        <Typography variant="caption" display="block">Tampon</Typography>
                      </Box>
                    )}
                  </Box>
                  <input ref={tamponRef} type="file" accept="image/*" hidden onChange={handleTamponChange} />
                  <Box textAlign="center" mt={1}>
                    <Button size="small" startIcon={<PhotoCameraIcon />}
                      onClick={() => tamponRef.current.click()}>
                      {(tamponPreview || currentTampon) ? 'Changer le tampon' : 'Ajouter le tampon'}
                    </Button>
                  </Box>
                </Box>

                <Divider flexItem />

                <Box width="100%">
                  <Typography variant="subtitle2" fontWeight="bold">Couleur de l&apos;application</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                    Barre du haut, menus, boutons et tableaux prennent cette couleur pour toute l&apos;équipe.
                  </Typography>
                  {couleursLogo.length > 0 && (
                    <>
                      <Typography variant="caption" fontWeight={700} display="block" mb={0.75}>Couleurs de votre logo</Typography>
                      <Box display="flex" gap={1} flexWrap="wrap" mb={1.5}>
                        {couleursLogo.map((c) => {
                          const choisie = String(form.couleur_primaire).toLowerCase() === c.toLowerCase();
                          return (
                            <Box key={c} component="button" type="button" title={c}
                              onClick={() => setForm({ ...form, couleur_primaire: c })}
                              sx={{
                                width: 36, height: 36, borderRadius: '50%', bgcolor: c, cursor: 'pointer', p: 0,
                                border: '3px solid', borderColor: choisie ? 'text.primary' : 'background.paper',
                                boxShadow: choisie ? 0 : '0 0 0 1px rgba(0,0,0,0.15)',
                              }} />
                          );
                        })}
                      </Box>
                    </>
                  )}
                  {logoSrc && couleursLogo.length === 0 && (
                    <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                      Aucune couleur vive trouvée dans le logo : choisissez-la ci-dessous.
                    </Typography>
                  )}
                  <Box display="flex" alignItems="center" gap={1.5}>
                    <Box
                      component="input" type="color"
                      value={couleurValide(form.couleur_primaire) ? form.couleur_primaire : '#1976d2'}
                      onChange={e => setForm({ ...form, couleur_primaire: e.target.value })}
                      style={{ width: 40, height: 40, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
                    />
                    <Typography variant="caption" color="text.secondary">Autre couleur · {form.couleur_primaire}</Typography>
                  </Box>
                  {couleurValide(form.couleur_primaire)
                    && couleurLisible(form.couleur_primaire).toLowerCase() !== String(form.couleur_primaire).toLowerCase() && (
                    <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                      Couleur claire : l&apos;application utilisera une teinte un peu plus foncée pour que les textes restent lisibles.
                    </Typography>
                  )}
                </Box>

                <Divider flexItem />
                {/* Aperçu mini */}
                <Box width="100%"><SectionTitre>Aperçu</SectionTitre></Box>
                <Box width="100%" p={2} borderRadius={2}
                  sx={{ bgcolor: couleurLisible(form.couleur_primaire), color: 'white', textAlign: 'center' }}>
                  {logoSrc && <Avatar src={logoSrc} sx={{ width: 40, height: 40, mx: 'auto', mb: 1 }} />}
                  <Typography fontWeight="bold" fontSize={14}>{form.nom_ecole || "Nom de l'école"}</Typography>
                  {form.slogan && <Typography fontSize={11} sx={{ opacity: 0.85 }}>{form.slogan}</Typography>}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Infos principales */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ ...carteSx }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" mb={0.5}>Informations générales</Typography>
                <Typography variant="body2" color="text.secondary" mb={2.5}>Ces informations apparaissent sur les bulletins et les documents de l&apos;école.</Typography>
                <Grid container spacing={2}>
                  <Grid size={12}><SectionTitre>Établissement</SectionTitre></Grid>
                  <Grid size={12}>
                    <TextField fullWidth label="Nom de l'école" name="nom_ecole"
                      value={form.nom_ecole} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><SchoolIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth label="Slogan" name="slogan"
                      value={form.slogan} onChange={handleChange}
                      placeholder="Ex: L'excellence au service de demain"
                      InputProps={{ startAdornment: <InputAdornment position="start"><FormatQuoteIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth label="Devise" name="devise"
                      value={form.devise} onChange={handleChange}
                      placeholder="Ex: Savoir, Rigueur, Excellence"
                      InputProps={{ startAdornment: <InputAdornment position="start"><FormatQuoteIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={12} sx={{ mt: 1 }}><SectionTitre>Direction</SectionTitre></Grid>
                  <Grid size={12}>
                    <TextField fullWidth label="Nom du Directeur / Chef d'établissement" name="directeur"
                      value={form.directeur} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={12} sx={{ mt: 1 }}><SectionTitre>Contact et adresse</SectionTitre></Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Téléphone" name="telephone"
                      value={form.telephone} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><PhoneIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Email" name="email" type="email"
                      value={form.email} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField fullWidth label="Adresse" name="adresse"
                      value={form.adresse} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><LocationOnIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField fullWidth label="Ville" name="ville"
                      value={form.ville} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><LocationOnIcon color="action" /></InputAdornment> }} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── ONGLET Site vitrine ── */}
      {tab === 1 && (
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card sx={{ ...carteSx }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <LanguageIcon color="primary" />
                  <Typography variant="h6" fontWeight="bold">Site public de l&apos;école</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" mb={1}>
                  Page visible sans connexion pour présenter l&apos;école et recevoir des dossiers de préinscription.
                  Disponible uniquement si l&apos;établissement est validé.
                </Typography>
                <Typography variant="body2" color="text.secondary" mb={3}>
                  Les tarifs affichés sont ceux de la caisse.
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(form.vitrine_active)}
                      onChange={(e) => setForm({ ...form, vitrine_active: e.target.checked })}
                      color="primary"
                    />
                  }
                  label="Activer le site vitrine"
                  sx={{ mb: 2 }}
                />

                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Texte de présentation"
                  name="presentation_vitrine"
                  value={form.presentation_vitrine}
                  onChange={handleChange}
                  placeholder="Présentez brièvement votre établissement aux familles…"
                  sx={{ mb: 3 }}
                />

                <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}
                  action={<Button component={Link} to="/admin/actualites" size="small" sx={{ textTransform: 'none', fontWeight: 600 }}>Gérer les actualités</Button>}>
                  Publiez des annonces (rentrée, réunions, résultats…) : elles s&apos;affichent sur la page publique de l&apos;école.
                </Alert>

                <Typography variant="subtitle2" fontWeight="bold" mb={1}>Lien public</Typography>
                {publicUrl ? (
                  <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                    <TextField
                      fullWidth
                      size="small"
                      value={publicUrl}
                      InputProps={{ readOnly: true }}
                      sx={{ flex: 1, minWidth: 220 }}
                    />
                    <Button
                      variant="outlined"
                      startIcon={<ContentCopyIcon />}
                      onClick={copyPublicLink}
                    >
                      {copied === true ? 'Copié !' : 'Copier'}
                    </Button>
                    <Button
                      variant="contained" disableElevation endIcon={<OpenInNewIcon />}
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Voir mon site
                    </Button>
                  </Box>
                ) : (
                  <Alert severity="info">
                    Le lien sera disponible après validation de l&apos;école (slug généré automatiquement).
                  </Alert>
                )}
                {publicUrl && (
                  <>
                    <Typography variant="subtitle2" fontWeight="bold" mt={2.5} mb={0.5}>Lien de connexion</Typography>
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      À donner aux parents, élèves et enseignants : même adresse pour tous, avec les couleurs de votre école.
                    </Typography>
                    <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                      <TextField fullWidth size="small" value={`${publicUrl}/connexion`} InputProps={{ readOnly: true }} sx={{ flex: 1, minWidth: 220 }} />
                      <Button variant="outlined" startIcon={<ContentCopyIcon />}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`${publicUrl}/connexion`);
                            setCopied('connexion');
                            setTimeout(() => setCopied(false), 2500);
                          } catch { /* ignore */ }
                        }}>
                        {copied === 'connexion' ? 'Copié !' : 'Copier'}
                      </Button>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Photo + atouts */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ ...carteSx, height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">Photo de l&apos;établissement</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Une belle photo (bâtiment, cour, élèves en classe). Elle sert de fond à l&apos;accueil du site et illustre la présentation.
                </Typography>
                <Box onClick={() => photoRef.current.click()} sx={{
                  aspectRatio: '16 / 9', borderRadius: 3, border: '2px dashed', borderColor: 'divider', overflow: 'hidden', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', '&:hover': { borderColor: 'primary.main' },
                }}>
                  {(photoPreview || currentPhoto)
                    ? <Box component="img" src={photoPreview || currentPhoto} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Box textAlign="center" color="text.secondary"><PhotoCameraIcon sx={{ fontSize: 40, opacity: 0.4 }} /><Typography variant="caption" display="block">Cliquer pour ajouter une photo</Typography></Box>}
                </Box>
                <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => {
                  const f = e.target.files[0];
                  if (!f) return;
                  if (f.size > 4 * 1024 * 1024) { setError('Photo trop lourde (4 Mo maximum).'); return; }
                  setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f));
                }} />
                <Button size="small" sx={{ mt: 1 }} startIcon={<PhotoCameraIcon />} onClick={() => photoRef.current.click()}>
                  {(photoPreview || currentPhoto) ? 'Changer la photo' : 'Ajouter une photo'}
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Card sx={{ ...carteSx, height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold">Nos atouts</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Ce qui distingue votre école (4 au plus). Sans atout, le site reprend les mots de votre slogan.
                </Typography>
                <Box display="flex" flexDirection="column" gap={1.5}>
                  {atouts.map((a, i) => (
                    <Box key={i} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Box display="flex" gap={1} alignItems="center">
                        <TextField size="small" fullWidth label={`Atout ${i + 1}`} placeholder="Ex : Enseignants qualifiés"
                          value={a.titre || ''} inputProps={{ maxLength: 60 }} onChange={(e) => majAtout(i, 'titre', e.target.value)} />
                        <IconButton color="error" onClick={() => retirerAtout(i)} aria-label="Retirer"><DeleteOutlineIcon /></IconButton>
                      </Box>
                      <TextField size="small" fullWidth multiline minRows={2} sx={{ mt: 1 }} placeholder="Une ou deux phrases pour l'expliquer aux parents"
                        value={a.texte || ''} inputProps={{ maxLength: 220 }} onChange={(e) => majAtout(i, 'texte', e.target.value)} />
                    </Box>
                  ))}
                  {atouts.length < 4 && (
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={ajouterAtout} sx={{ alignSelf: 'flex-start' }}>
                      Ajouter un atout
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Contact et affichage */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Card sx={{ ...carteSx, height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" mb={0.5}>Contact et réseaux</Typography>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  Adresse, téléphone et e-mail viennent de l&apos;onglet Identité. Complétez ici ce qui aide les parents à vous joindre.
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <TextField fullWidth label="Horaires d'ouverture" name="vitrine_horaires" value={form.vitrine_horaires} onChange={handleChange}
                      placeholder="Ex : du lundi au vendredi, 7 h – 17 h ; samedi 8 h – 12 h" inputProps={{ maxLength: 200 }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Numéro WhatsApp" name="vitrine_whatsapp" value={form.vitrine_whatsapp} onChange={handleChange}
                      placeholder="Ex : 70 12 34 56" helperText="Un bouton WhatsApp apparaît sur le site." />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Page Facebook (lien)" name="vitrine_facebook" value={form.vitrine_facebook} onChange={handleChange}
                      placeholder="https://facebook.com/…" />
                  </Grid>
                  <Grid size={12}>
                    <TextField fullWidth label="Lien Google Maps" name="vitrine_carte" value={form.vitrine_carte} onChange={handleChange}
                      placeholder="https://maps.app.goo.gl/…" helperText="Dans Google Maps : cherchez l'école → Partager → Copier le lien." />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Card sx={{ ...carteSx, height: '100%' }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" mb={1.5}>Ce que le site affiche</Typography>
                <FormControlLabel sx={{ display: 'flex', mb: 1 }}
                  control={<Switch checked={form.vitrine_afficher_tarifs !== false} onChange={(e) => setForm({ ...form, vitrine_afficher_tarifs: e.target.checked })} />}
                  label="Les frais de scolarité" />
                <FormControlLabel sx={{ display: 'flex', mb: 2 }}
                  control={<Switch checked={form.vitrine_afficher_classes !== false} onChange={(e) => setForm({ ...form, vitrine_afficher_classes: e.target.checked })} />}
                  label="Le détail des classes de chaque niveau" />
                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" fontWeight="bold" mb={1}>Couleur du site</Typography>
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: couleurLisible(form.couleur_primaire), flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary">
                    Le site prend la couleur de l&apos;école, comme l&apos;application.{' '}
                    <Button size="small" sx={{ p: 0, minWidth: 0, textTransform: 'none', verticalAlign: 'baseline' }} onClick={() => setTab(0)}>
                      La changer (onglet Identité)
                    </Button>
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ── ONGLET Bulletin & Administration ── */}
      {tab === 2 && (
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card sx={{ ...carteSx }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <ApartmentIcon color="primary" />
                  <Typography variant="h6" fontWeight="bold">Hiérarchie administrative</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" mb={3}>
                  Ces informations apparaissent dans l'en-tête des bulletins de notes.
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Direction Régionale de l'Éducation"
                      name="direction_regionale"
                      value={form.direction_regionale} onChange={handleChange}
                      placeholder="Ex: DIRECTION RÉGIONALE SUD-OUEST"
                      helperText="Apparaît en haut à gauche du bulletin" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Direction Provinciale de l'Éducation"
                      name="direction_provinciale"
                      value={form.direction_provinciale} onChange={handleChange}
                      placeholder="Ex: DIRECTION PROVINCIALE DU HOUET"
                      helperText="Apparaît sous la Direction Régionale" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Boîte Postale" name="boite_postale"
                      value={form.boite_postale} onChange={handleChange}
                      placeholder="Ex: BP 1234"
                      InputProps={{ startAdornment: <InputAdornment position="start"><LocationOnIcon color="action" /></InputAdornment> }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth label="Année de création" name="annee_creation"
                      value={form.annee_creation} onChange={handleChange}
                      placeholder="Ex: 1985" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField fullWidth type="number" label="Seuil de passage (/20)" name="seuil_passage"
                      value={form.seuil_passage} onChange={handleChange}
                      helperText="Moyenne annuelle minimale pour passer en classe supérieure (hors 3ème / Terminale)."
                      inputProps={{ min: 0, max: 20, step: 0.5 }} />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Aperçu en-tête bulletin */}
          <Grid size={12}>
            <Card sx={{ ...carteSx }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" mb={2}>Aperçu de l'en-tête du bulletin</Typography>
                <Box sx={{
                  border: '1px solid #ccc', borderRadius: 2, p: 2,
                  fontFamily: 'Arial, sans-serif', bgcolor: 'background.paper'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ width: '33%', verticalAlign: 'top', fontSize: '13px' }}>
                          <div style={{ fontWeight: 'bold' }}>{form.direction_regionale || 'DIRECTION RÉGIONALE'}</div>
                          <div>{form.direction_provinciale || 'DIRECTION PROVINCIALE'}</div>
                          <div style={{ marginTop: 4, fontWeight: 'bold' }}>{form.nom_ecole || "NOM DE L'ÉCOLE"}</div>
                          {form.ville && <div>{form.ville}</div>}
                          {form.boite_postale && <div>{form.boite_postale}</div>}
                        </td>
                        <td style={{ width: '34%', textAlign: 'center', verticalAlign: 'middle' }}>
                          {logoSrc && (
                            <img src={logoSrc} alt="Logo" style={{ width: 60, height: 60, objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
                          )}
                          <div style={{ fontSize: '13px' }}>Année Scolaire : <strong>2024–2025</strong></div>
                          <div style={{ fontSize: '13px' }}><strong>1er Trimestre</strong></div>
                        </td>
                        <td style={{ width: '33%', textAlign: 'right', fontSize: '12px', color: '#555' }}>
                          {form.telephone && <div>Tél : {form.telephone}</div>}
                          {form.email && <div>{form.email}</div>}
                          {form.devise && <div style={{ fontStyle: 'italic', marginTop: 4 }}>« {form.devise} »</div>}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '15px',
                    border: '2px solid #333', padding: '6px', margin: '8px 0', letterSpacing: '2px',
                    textTransform: 'uppercase' }}>
                    Bulletin de Notes
                  </div>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {tab === 3 && <ParametresStructure section="frais" />}

      {tab === 4 && (
        <Card sx={{ ...carteSx, maxWidth: 760 }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <VpnKeyIcon color="primary" />
              <Typography variant="h6" fontWeight="bold">Mots de passe par défaut</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Mot de passe donné automatiquement aux nouveaux comptes. Chaque personne devra le remplacer
              par le sien à sa première connexion. Vous pouvez laisser un champ vide : un mot de passe
              aléatoire sera alors généré pour chaque compte et affiché une seule fois à la création.
            </Typography>
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth label="Élèves" name="mot_de_passe_defaut_eleves"
                  value={form.mot_de_passe_defaut_eleves || ''} onChange={handleChange}
                  helperText="Identifiant de l'élève : son matricule. 6 caractères minimum." />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth label="Enseignants" name="mot_de_passe_defaut_enseignants"
                  value={form.mot_de_passe_defaut_enseignants || ''} onChange={handleChange}
                  helperText="Identifiant de l'enseignant : celui que vous choisissez à la création. 6 caractères minimum." />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField fullWidth label="Parents" name="mot_de_passe_defaut_parents"
                  value={form.mot_de_passe_defaut_parents || ''} onChange={handleChange}
                  helperText="Identifiant du parent : son numéro de téléphone. 6 caractères minimum." />
              </Grid>
            </Grid>
            <Alert severity="info" sx={{ mt: 2.5 }}>
              Ce changement ne concerne que les comptes créés <strong>après</strong> l&apos;enregistrement.
              Pour les élèves et les enseignants déjà en place, utilisez « Appliquer le mot de passe par défaut » dans leur liste.
              Choisissez un mot de passe qui ne soit pas trop simple.
            </Alert>
          </CardContent>
        </Card>
      )}

      {(tab < 3 || tab === 4) && (
        <Box display="flex" justifyContent="flex-end" alignItems="center" gap={2} mt={3} py={1.5} px={2}
          sx={{ position: 'sticky', bottom: 0, zIndex: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Pensez à enregistrer après vos modifications.
          </Typography>
          <Button
            variant="contained" size="large" disableElevation
            startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
            onClick={handleSubmit}
            disabled={saving}
            sx={{ px: 4 }}>
            {saving ? 'Enregistrement...' : seulementSite ? 'Enregistrer le site' : 'Enregistrer les paramètres'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
