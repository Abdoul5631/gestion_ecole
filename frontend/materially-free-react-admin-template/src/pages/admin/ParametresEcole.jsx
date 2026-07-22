import { useEffect, useState, useRef } from 'react';
import { parametresService } from 'services/api';
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
import ApartmentIcon from '@mui/icons-material/Apartment';

const EMPTY_FORM = {
  nom_ecole: '', slogan: '', adresse: '', ville: '', telephone: '',
  email: '', directeur: '', devise: '', couleur_primaire: '#1976d2',
  direction_regionale: '', direction_provinciale: '', boite_postale: '', annee_creation: '',
};

export default function ParametresEcole() {
  const fileRef   = useRef();
  const sigRef    = useRef();
  const tamponRef = useRef();
  const [tab, setTab] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [logoFile,       setLogoFile]       = useState(null);
  const [logoPreview,    setLogoPreview]    = useState(null);
  const [currentLogo,    setCurrentLogo]    = useState(null);
  const [sigFile,        setSigFile]        = useState(null);
  const [sigPreview,     setSigPreview]     = useState(null);
  const [currentSig,     setCurrentSig]     = useState(null);
  const [tamponFile,     setTamponFile]     = useState(null);
  const [tamponPreview,  setTamponPreview]  = useState(null);
  const [currentTampon,  setCurrentTampon]  = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [success, setSuccess]   = useState('');
  const [error,   setError]     = useState('');

  useEffect(() => {
    parametresService.get()
      .then(res => {
        const { logo_url, logo, signature_url, signature, tampon_url, tampon, ...rest } = res.data;
        setForm({ ...EMPTY_FORM, ...rest });
        setCurrentLogo(logo_url || null);
        setCurrentSig(signature_url || null);
        setCurrentTampon(tampon_url || null);
      })
      .catch(() => setError('Erreur de chargement des paramètres.'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogoChange = e => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
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
      const formData = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== null && v !== undefined) formData.append(k, v);
      });
      if (logoFile)    formData.append('logo', logoFile);
      if (sigFile)     formData.append('signature', sigFile);
      if (tamponFile)  formData.append('tampon', tamponFile);

      await parametresService.update(formData);
      setSuccess('Paramètres enregistrés avec succès !');
      setLogoFile(null);
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
    <Box>
      <Box display="flex" alignItems="center" gap={1.5} mb={3} flexWrap="wrap">
        <SettingsIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Paramètres de l'École
        </Typography>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<SchoolIcon />} iconPosition="start" label="Identité de l'école" />
        <Tab icon={<ArticleIcon />} iconPosition="start" label="Bulletin & Admin" />
      </Tabs>

      {/* ── ONGLET 1 : Identité ── */}
      {tab === 0 && (
        <Grid container spacing={3}>
          {/* Logo + couleur */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', height: '100%' }}>
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
                  <Typography variant="subtitle2" mb={1} fontWeight="bold">Couleur principale</Typography>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Box
                      component="input" type="color"
                      value={form.couleur_primaire}
                      onChange={e => setForm({ ...form, couleur_primaire: e.target.value })}
                      style={{ width: 48, height: 48, border: 'none', borderRadius: 8, cursor: 'pointer', padding: 0 }}
                    />
                    <Box>
                      <Box sx={{ width: 80, height: 32, borderRadius: 1, bgcolor: form.couleur_primaire, mb: 0.5 }} />
                      <Typography variant="caption" color="text.secondary">{form.couleur_primaire}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Divider flexItem />
                {/* Aperçu mini */}
                <Box width="100%" p={2} borderRadius={2}
                  sx={{ bgcolor: form.couleur_primaire, color: 'white', textAlign: 'center' }}>
                  {logoSrc && <Avatar src={logoSrc} sx={{ width: 40, height: 40, mx: 'auto', mb: 1 }} />}
                  <Typography fontWeight="bold" fontSize={14}>{form.nom_ecole || "Nom de l'école"}</Typography>
                  {form.slogan && <Typography fontSize={11} sx={{ opacity: 0.85 }}>{form.slogan}</Typography>}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Infos principales */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              <CardContent>
                <Typography variant="h6" fontWeight="bold" mb={3}>Informations générales</Typography>
                <Grid container spacing={2}>
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
                  <Grid size={12}>
                    <TextField fullWidth label="Nom du Directeur / Chef d'établissement" name="directeur"
                      value={form.directeur} onChange={handleChange}
                      InputProps={{ startAdornment: <InputAdornment position="start"><PersonIcon color="action" /></InputAdornment> }} />
                  </Grid>
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

      {/* ── ONGLET 2 : Bulletin & Administration ── */}
      {tab === 1 && (
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
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
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Aperçu en-tête bulletin */}
          <Grid size={12}>
            <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
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

      {/* Bouton commun */}
      <Box display="flex" justifyContent="flex-end" mt={3}>
        <Button
          variant="contained" size="large"
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
          onClick={handleSubmit}
          disabled={saving}
          sx={{ px: 4, borderRadius: 2 }}>
          {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
        </Button>
      </Box>
    </Box>
  );
}
