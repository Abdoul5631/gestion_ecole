import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, InputAdornment, IconButton, Divider, Checkbox, FormControlLabel
} from '@mui/material';
import { keyframes } from '@mui/system';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SchoolIcon from '@mui/icons-material/School';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import GradeIcon from '@mui/icons-material/Grade';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import PaymentsIcon from '@mui/icons-material/Payments';
import FamilyRestroomIcon from '@mui/icons-material/FamilyRestroom';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import KeyboardCapslockIcon from '@mui/icons-material/KeyboardCapslock';
import authService, { homeForUser } from '../../services/auth';
import api from 'services/api';
import { prefetchMainLazyRoutes } from '../../offline/prefetchRoutes';
import { precharger } from '../../offline/prechargement';
import { estEnLigne } from 'offline/reseau';
import { couleurLisible } from 'utils/couleurs';

const OR = '#f5b301';
const DUREE_PHOTO = 6500;
const DUREE_ATOUT = 2600;
const PHOTOS_SECOURS = [{ url: '/images/accueil-classe.webp', credit: 'Doug Linstedt — Unsplash', position: '8% 40%' }];

const apparition = keyframes`from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; }`;
const zoomLent = keyframes`from { transform: scale(1.12); } to { transform: scale(1); }`;

const ATOUTS = [
  [GradeIcon, 'Notes, bulletins et classements'],
  [EventAvailableIcon, 'Appel et absences en temps réel'],
  [PaymentsIcon, 'Caisse, frais et reçus'],
  [FamilyRestroomIcon, 'Parents informés sur leur téléphone'],
  [WifiOffIcon, 'Fonctionne même sans connexion'],
];

// « Je suis… » : le champ d'identifiant s'adapte (libellé, clavier, exemple)
const PROFILS = [
  { code: 'direction', libelle: 'Direction / équipe', champ: 'E-mail ou téléphone', exemple: 'directeur@ecole.bf ou 70 12 34 56', clavier: 'email', Icone: AlternateEmailIcon },
  { code: 'enseignant', libelle: 'Enseignant', champ: 'Numéro de téléphone', exemple: '70 12 34 56', clavier: 'tel', Icone: PhoneIphoneIcon },
  { code: 'parent', libelle: 'Parent', champ: 'Numéro de téléphone', exemple: '70 12 34 56', clavier: 'tel', Icone: PhoneIphoneIcon },
  { code: 'eleve', libelle: 'Élève', champ: 'Matricule', exemple: 'CSCG12', clavier: 'text', Icone: BadgeOutlinedIcon },
];

const hexRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(h) ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : [11, 61, 145];
};
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(',')},${a})`;
const lire = (cle) => { try { return localStorage.getItem(cle) || ''; } catch { return ''; } };

/** Compteur qui monte jusqu'à sa valeur à l'affichage. */
function Compteur({ valeur }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!valeur) return undefined;
    const debut = performance.now();
    let id;
    const pas = (t) => {
      const p = Math.min(1, (t - debut) / 1400);
      setN(Math.round(valeur * (1 - (1 - p) ** 3)));
      if (p < 1) id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [valeur]);
  return n.toLocaleString('fr-FR');
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const slugEcole = useParams().slug || params.get('ecole'); // /ecole/mon-ecole/connexion (ou l'ancien /login?ecole=…)
  const [accueil, setAccueil] = useState(null);
  const [ecole, setEcole] = useState(null); // connexion depuis le site d'une école : à ses couleurs
  const [photo, setPhoto] = useState(0);
  const [atout, setAtout] = useState(0);
  const [profil, setProfil] = useState(() => lire('connexion_profil') || 'direction');
  const [form, setForm] = useState(() => ({ username: lire('connexion_identifiant'), password: '' }));
  const [seSouvenir, setSeSouvenir] = useState(() => !!lire('connexion_identifiant'));
  const [majuscules, setMajuscules] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    api.get('/accueil/').then((r) => setAccueil(r.data)).catch(() => setAccueil({}));
    if (slugEcole) api.get(`/ecole-connexion/${slugEcole}/`).then((r) => setEcole(r.data)).catch(() => setEcole(null));
  }, [slugEcole]);

  const photos = accueil?.photos?.length ? accueil.photos : PHOTOS_SECOURS;
  useEffect(() => {
    if (photos.length < 2) return undefined;
    const t = setInterval(() => setPhoto((x) => (x + 1) % photos.length), DUREE_PHOTO);
    return () => clearInterval(t);
  }, [photos.length]);
  useEffect(() => {
    const t = setInterval(() => setAtout((a) => (a + 1) % ATOUTS.length), DUREE_ATOUT);
    return () => clearInterval(t);
  }, []);

  const couleur = useMemo(() => couleurLisible(ecole?.couleur_primaire || accueil?.couleur || '#0b3d91'), [ecole, accueil]);
  const p = PROFILS.find((x) => x.code === profil) || PROFILS[0];
  const titre = accueil?.titre || 'Toute votre école, dans une seule application.';
  const coupure = titre.indexOf(',');
  const [titre1, titre2] = coupure > 0 ? [titre.slice(0, coupure + 1), titre.slice(coupure + 1).trim()] : [titre, ''];
  const badge = ecole ? ecole.slogan : (accueil?.badge ?? 'Pensé pour les écoles du Burkina Faso');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const verifierMajuscules = (e) => setMajuscules(!!e.getModifierState?.('CapsLock'));

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.username || !form.password || loading) return;
    if (typeof navigator !== 'undefined' && !estEnLigne()) {
      setError('Connexion internet requise pour se connecter. Vérifiez votre connexion, puis réessayez.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await authService.login(form.username.trim(), form.password);
      try {
        if (seSouvenir) { localStorage.setItem('connexion_identifiant', form.username.trim()); localStorage.setItem('connexion_profil', profil); }
        else { localStorage.removeItem('connexion_identifiant'); localStorage.removeItem('connexion_profil'); }
      } catch { /* stockage indisponible */ }
      prefetchMainLazyRoutes();
      precharger({ forcer: true }).catch(() => {});
      navigate(homeForUser(data));
    } catch (err) {
      if (!err.response) {
        setError('Le serveur ne répond pas. Vérifiez votre connexion internet, puis réessayez.');
      } else if (err.response.status === 429) {
        const s = Number(err.response.headers?.['retry-after']) || 60;
        setError(`Trop de tentatives. Pour protéger le compte, réessayez dans ${s >= 60 ? `${Math.ceil(s / 60)} minute(s)` : `${s} secondes`}.`);
      } else {
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' && !/credentials|identifiants/i.test(detail)
          ? detail : `${p.champ} ou mot de passe incorrect. Vérifiez aussi que les majuscules ne sont pas verrouillées.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const chiffres = !ecole && accueil?.chiffres;

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, bgcolor: '#f4f7fc',
      '@media (prefers-reduced-motion: reduce)': { '& *': { animation: 'none !important', transition: 'none !important' } },
    }}>
      {/* ── Côté image : photos qui défilent, la promesse, les atouts ── */}
      <Box sx={{ position: 'relative', overflow: 'hidden', flex: { md: '1 1 58%' }, minHeight: { md: '100vh' }, color: '#fff', display: 'flex' }}>
        {photos.map((ph, i) => (
          <Box key={ph.url} component="img" src={ph.url} alt="" aria-hidden
            sx={{
              position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: { xs: '55% 35%', md: ph.position || '50% 50%' },
              opacity: i === photo ? 1 : 0, transition: 'opacity 1.4s ease',
              animation: i === photo ? `${zoomLent} ${DUREE_PHOTO + 1500}ms ease-out both` : 'none',
            }} />
        ))}
        <Box sx={{
          position: 'absolute', inset: 0,
          background: {
            xs: `linear-gradient(180deg, ${rgba(couleur, 0.6)} 0%, rgba(8,20,45,0.9) 100%)`,
            md: `linear-gradient(105deg, rgba(8,20,45,0.92) 0%, ${rgba(couleur, 0.8)} 45%, ${rgba(couleur, 0.25)} 100%)`,
          },
        }} />

        <Box sx={{
          position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%',
          px: { xs: 3, sm: 4, md: 6, lg: 8 }, pt: { xs: 3, sm: 4, md: 6, lg: 8 }, pb: { xs: 9, md: 6, lg: 8 }, gap: 3,
        }}>
          <Box display="flex" alignItems="center" gap={1.25} sx={{ animation: `${apparition} .6s ease both` }}>
            <Box sx={{ width: 46, height: 46, borderRadius: 2.5, bgcolor: '#fff', color: couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {ecole?.logo_url ? <Box component="img" src={ecole.logo_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <SchoolIcon />}
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 20 }} color="inherit">{ecole?.nom_ecole || 'Gestion École'}</Typography>
          </Box>

          <Box sx={{ maxWidth: 580, animation: `${apparition} .7s .1s ease both` }}>
            {badge && (
              <Box sx={{ display: 'inline-block', px: 1.5, py: 0.5, borderRadius: 5, bgcolor: 'rgba(245,179,1,0.18)', border: `1px solid ${OR}`, mb: 2 }}>
                <Typography sx={{ color: OR, fontWeight: 700, fontSize: 13, letterSpacing: 0.4 }}>{badge}</Typography>
              </Box>
            )}
            <Typography component="h1" color="inherit" sx={{ fontWeight: 800, lineHeight: 1.12, overflowWrap: 'break-word',
              fontSize: ecole ? { xs: 24, sm: 30, md: 36, lg: 42 } : { xs: 26, sm: 34, md: 44, lg: 52 } }}>
              {ecole ? <>Bienvenue dans l&apos;espace<br />{ecole.nom_ecole}</> : (
                <>
                  {titre1}
                  {titre2 && (
                    <>
                      {' '}<Box component="br" sx={{ display: { xs: 'none', sm: 'block' } }} />
                      <Box component="span" sx={{ background: `linear-gradient(90deg, #fff 30%, ${OR})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                        {titre2}
                      </Box>
                    </>
                  )}
                </>
              )}
            </Typography>
            <Typography color="inherit" sx={{ mt: 2, opacity: 0.9, fontSize: { xs: 15, md: 17 }, maxWidth: 520, display: { xs: 'none', sm: 'block' } }}>
              {ecole ? 'Direction, enseignants, élèves et parents : connectez-vous pour retrouver les informations de l’école.'
                : (accueil?.sous_titre || 'Direction, enseignants, élèves et parents travaillent ensemble : chacun voit ce qui le concerne, au bon moment.')}
            </Typography>

            {chiffres && chiffres.ecoles > 0 && (
              <Box display={{ xs: 'none', md: 'flex' }} gap={4} mt={3.5}>
                {[[chiffres.ecoles, chiffres.ecoles > 1 ? 'écoles nous font confiance' : 'école nous fait confiance'], [chiffres.eleves, 'élèves suivis cette année']].map(([v, l]) => (
                  <Box key={l}>
                    <Typography color="inherit" sx={{ fontWeight: 800, fontSize: 34, lineHeight: 1, color: OR }}><Compteur valeur={v} /></Typography>
                    <Typography color="inherit" sx={{ opacity: 0.85, fontSize: 14 }}>{l}</Typography>
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ mt: 4, display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '1fr 1fr', gap: 1.5, maxWidth: 580 }}>
              {ATOUTS.map(([Icone, texte], i) => {
                const actif = i === atout;
                return (
                  <Box key={texte} sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1.25, borderRadius: 2.5,
                    bgcolor: actif ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                    border: '1px solid', borderColor: actif ? 'rgba(245,179,1,0.8)' : 'rgba(255,255,255,0.16)',
                    backdropFilter: 'blur(6px)', transform: actif ? 'translateX(6px)' : 'none',
                    transition: 'all .5s ease', animation: `${apparition} .6s ${0.25 + i * 0.08}s ease both`,
                  }}>
                    <Icone sx={{ color: OR, fontSize: 22, transition: 'transform .5s', transform: actif ? 'scale(1.2)' : 'none' }} />
                    <Typography color="inherit" sx={{ fontWeight: 600, fontSize: 14.5 }}>{texte}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box display={{ xs: 'none', md: 'flex' }} alignItems="center" justifyContent="space-between" gap={2}>
            <Box display="flex" gap={0.75}>
              {photos.length > 1 && photos.map((ph, i) => (
                <Box key={ph.url} component="button" type="button" aria-label={`Photo ${i + 1}`} onClick={() => setPhoto(i)}
                  sx={{ width: i === photo ? 28 : 10, height: 10, borderRadius: 5, border: 0, p: 0, cursor: 'pointer',
                    bgcolor: i === photo ? OR : 'rgba(255,255,255,0.45)', transition: 'all .4s' }} />
              ))}
            </Box>
            {photos[photo]?.credit && <Typography color="inherit" sx={{ fontSize: 11.5, opacity: 0.6 }}>Photo : {photos[photo].credit}</Typography>}
          </Box>
        </Box>
      </Box>

      {/* ── Côté formulaire ── */}
      <Box sx={{
        flex: { md: '1 1 42%' }, display: 'flex', alignItems: 'center', justifyContent: 'center',
        px: { xs: 2, sm: 4 }, py: { xs: 0, md: 6 }, mt: { xs: -5, md: 0 }, position: 'relative', zIndex: 2,
      }}>
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{
          width: '100%', maxWidth: 440, bgcolor: '#fff', borderRadius: 4, p: { xs: 3, sm: 4.5 },
          boxShadow: { xs: '0 18px 40px rgba(8,30,70,0.18)', md: '0 24px 60px rgba(8,30,70,0.12)' },
          animation: `${apparition} .7s .15s ease both`, mb: { xs: 4, md: 0 },
        }}>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: 24, sm: 28 }, color: '#0f1d3a' }}>Bon retour</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
            {ecole ? <>Connectez-vous à l&apos;espace de <strong>{ecole.nom_ecole}</strong>.</> : <>Connectez-vous à l&apos;espace de votre école.</>}
          </Typography>

          {/* Je suis… : le champ s'adapte */}
          <Typography variant="body2" fontWeight={700} color="#3b4b6b" mb={0.75}>Je suis</Typography>
          <Box role="radiogroup" aria-label="Je suis" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, p: 0.5, borderRadius: 2.5, bgcolor: '#eef3fb', mb: 2.5 }}>
            {PROFILS.map((x) => {
              const actif = x.code === profil;
              return (
                <Box key={x.code} component="button" type="button" role="radio" aria-checked={actif} onClick={() => setProfil(x.code)}
                  sx={{
                    border: 0, cursor: 'pointer', borderRadius: 2, py: 1, px: 0.5, fontFamily: 'inherit', fontSize: { xs: 11.5, sm: 12.5 },
                    fontWeight: actif ? 800 : 600, lineHeight: 1.2, color: actif ? couleur : '#5b6b88',
                    bgcolor: actif ? '#fff' : 'transparent', boxShadow: actif ? '0 2px 8px rgba(8,30,70,0.12)' : 'none', transition: 'all .2s',
                  }}>
                  {x.libelle}
                </Box>
              );
            })}
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          <TextField
            fullWidth label={p.champ} name="username" value={form.username} onChange={handleChange}
            placeholder={`Ex. : ${p.exemple}`} autoComplete="username" autoFocus={!form.username} sx={{ mb: 2 }}
            inputProps={{ inputMode: p.clavier === 'tel' ? 'tel' : p.clavier === 'email' ? 'email' : 'text', autoCapitalize: 'none', spellCheck: false }}
            InputProps={{ startAdornment: <InputAdornment position="start"><p.Icone sx={{ color: '#8a96ad' }} /></InputAdornment> }}
          />
          <TextField
            fullWidth label="Mot de passe" name="password" type={showPassword ? 'text' : 'password'} autoFocus={!!form.username}
            value={form.password} onChange={handleChange} onKeyUp={verifierMajuscules} onKeyDown={verifierMajuscules} autoComplete="current-password"
            helperText={majuscules ? 'Attention : les majuscules sont verrouillées.' : ' '}
            FormHelperTextProps={{ sx: { color: 'warning.dark', fontWeight: 600 } }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><LockOutlinedIcon sx={{ color: '#8a96ad' }} /></InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  {majuscules && <KeyboardCapslockIcon sx={{ color: 'warning.main', mr: 0.5 }} />}
                  <IconButton onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={0.5} mb={2.5} gap={1} flexWrap="wrap">
            <FormControlLabel sx={{ m: 0 }}
              control={<Checkbox size="small" checked={seSouvenir} onChange={(e) => setSeSouvenir(e.target.checked)} sx={{ p: 0.5, color: '#8a96ad', '&.Mui-checked': { color: couleur } }} />}
              label={<Typography variant="body2" color="#3b4b6b">Se souvenir de moi</Typography>} />
            <Typography component={Link} to="/forgot-password" variant="body2"
              sx={{ color: couleur, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
              Mot de passe oublié ?
            </Typography>
          </Box>

          <Button
            type="submit" fullWidth variant="contained" size="large" disableElevation
            disabled={loading || !form.username || !form.password}
            endIcon={!loading && <ArrowForwardIcon />}
            sx={{
              py: 1.5, borderRadius: 2.5, fontWeight: 800, fontSize: 16, textTransform: 'none', color: '#fff',
              background: `linear-gradient(135deg, ${rgba(couleur, 0.85)} 0%, ${couleur} 100%)`,
              boxShadow: `0 10px 24px ${rgba(couleur, 0.35)}`,
              '&:hover': { background: couleur, boxShadow: `0 12px 28px ${rgba(couleur, 0.45)}` },
              '&.Mui-disabled': { background: rgba(couleur, 0.28), color: '#fff', boxShadow: 'none' },
            }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Se connecter'}
          </Button>

          {ecole ? (
            ecole.site_public && (
              <Typography component={Link} to={`/ecole/${slugEcole}`} variant="body2" display="block" textAlign="center" mt={3}
                sx={{ color: couleur, fontWeight: 600, textDecoration: 'none' }}>
                ← Retour au site de l&apos;école
              </Typography>
            )
          ) : (
            <>
              <Divider sx={{ my: 3, color: 'text.secondary', fontSize: 13 }}>Nouvelle école ?</Divider>
              <Button fullWidth variant="outlined" size="large" component={Link} to="/register"
                sx={{ py: 1.3, borderRadius: 2.5, fontWeight: 700, textTransform: 'none', borderColor: '#cfd9ea', color: couleur, '&:hover': { borderColor: couleur, bgcolor: rgba(couleur, 0.05) } }}>
                Créer l&apos;espace de mon école
              </Button>
            </>
          )}

          <Box display="flex" alignItems="center" justifyContent="center" gap={0.75} mt={3} sx={{ color: '#8a96ad' }}>
            <VerifiedUserIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" color="inherit">Connexion sécurisée · chaque école ne voit que ses propres données</Typography>
          </Box>
          {seSouvenir && (
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.5}>
              Sur un téléphone ou un ordinateur partagé, décochez « Se souvenir de moi ».
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
