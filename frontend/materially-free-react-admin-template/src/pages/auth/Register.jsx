import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, TextField, Typography
} from '@mui/material';
import { keyframes } from '@mui/system';
import SchoolIcon from '@mui/icons-material/School';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PlaceIcon from '@mui/icons-material/Place';
import PersonIcon from '@mui/icons-material/Person';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import api, { ecoleService } from '../../services/api';
import { estEnLigne } from 'offline/reseau';

const BLEU = '#0b3d91';
const OR = '#f5b301';
const apparition = keyframes`from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; }`;

const STATUTS = [['PUBLIC', 'Public'], ['PRIVE_LAIC', 'Privé laïc'], ['PRIVE_CONFESSIONNEL', 'Privé confessionnel'], ['COMMUNAUTAIRE', 'Communautaire']];
const ORDRES = [['PRIMAIRE', 'Primaire'], ['POST_PRIMAIRE', 'Post-primaire (collège)'], ['SECONDAIRE', 'Secondaire (lycée)'],
  ['POST_PRIMAIRE_SECONDAIRE', 'Post-primaire et secondaire'], ['TECHNIQUE', 'Enseignement technique et professionnel']];

const ETAPES = [
  { titre: "L'établissement", Icone: AccountBalanceIcon },
  { titre: 'Localisation et contact', Icone: PlaceIcon },
  { titre: 'Le directeur', Icone: PersonIcon },
];

const VIDE = {
  nom_ecole: '', statut_juridique: '', ordre_enseignement: '', annee_creation: '', numero_autorisation: '',
  ville: '', adresse: '', direction_regionale: '', direction_provinciale: '', telephone: '',
  directeur: '', email: '', telephone_directeur: '',
};

// L'utilisateur écrit son numéro comme il le souhaite : sans indicatif = Burkina Faso (8 chiffres) ;
// avec son indicatif (+225…, 00225…) = autre pays, accepté tel quel.
const telValide = (t) => {
  const brut = String(t || '').trim();
  const n = brut.replace(/\D/g, '');
  if (/^(\+|00)/.test(brut)) {
    const international = brut.startsWith('00') ? n.slice(2) : n;
    return /^\s*(\+|00)\s*226/.test(brut) ? international.slice(3).replace(/^0/, '').length === 8 : international.length >= 8 && international.length <= 15;
  }
  return n.slice(-8).length === 8;
};
const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

/** Création d'une école : trois étapes, puis la plateforme vérifie et valide. Le directeur reçoit alors un mot de passe provisoire. */
export default function Register() {
  const [etape, setEtape] = useState(0);
  const [f, setF] = useState(VIDE);
  const [touche, setTouche] = useState({});
  const [certifie, setCertifie] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [erreursServeur, setErreursServeur] = useState({});
  const [fini, setFini] = useState(null);
  const [photo, setPhoto] = useState('/images/accueil-ecriture.webp');

  useEffect(() => {
    api.get('/accueil/').then((r) => { const ph = r.data?.photos; if (ph?.length) setPhoto(ph[1 % ph.length].url); }).catch(() => {});
  }, []);

  const changer = (champ) => (e) => { setF({ ...f, [champ]: e.target.value }); setErreursServeur({ ...erreursServeur, [champ]: undefined }); };
  const quitter = (champ) => () => setTouche({ ...touche, [champ]: true });

  // erreurs de saisie, champ par champ
  const regles = {
    nom_ecole: () => (f.nom_ecole.trim().length < 3 ? "Indiquez le nom complet de l'école." : ''),
    statut_juridique: () => (!f.statut_juridique ? 'Choisissez le statut.' : ''),
    ordre_enseignement: () => (!f.ordre_enseignement ? "Choisissez l'ordre d'enseignement." : ''),
    annee_creation: () => (f.annee_creation && !/^(19|20)\d{2}$/.test(f.annee_creation) ? 'Année sur 4 chiffres, ex. 2008.' : ''),
    ville: () => (!f.ville.trim() ? 'Indiquez la ville.' : ''),
    telephone: () => (!telValide(f.telephone) ? 'Ex. 20 97 00 00, ou avec votre indicatif : +225 27 22 44 55 66.' : ''),
    directeur: () => (f.directeur.trim().length < 3 ? 'Indiquez le nom et le prénom du directeur.' : ''),
    email: () => (!emailValide(f.email) ? 'Adresse e-mail invalide.' : ''),
    telephone_directeur: () => (!telValide(f.telephone_directeur) ? 'Ex. 70 12 34 56, ou avec votre indicatif : +225 07 12 34 56 78.' : ''),
  };
  const champsEtape = [['nom_ecole', 'statut_juridique', 'ordre_enseignement', 'annee_creation'], ['ville', 'telephone'], ['directeur', 'email', 'telephone_directeur']];
  const err = (champ) => erreursServeur[champ] || (touche[champ] && regles[champ] ? regles[champ]() : '');
  const etapeValide = (i) => champsEtape[i].every((c) => !regles[c]());

  const suivant = () => {
    const t = { ...touche };
    champsEtape[etape].forEach((c) => { t[c] = true; });
    setTouche(t);
    if (etapeValide(etape)) setEtape(etape + 1);
  };

  const envoyer = async (e) => {
    e?.preventDefault();
    if (!estEnLigne()) { setErreur('Connexion internet requise pour envoyer la demande.'); return; }
    setEnvoi(true); setErreur('');
    try {
      const { data } = await ecoleService.creer({ ...f, email: f.email.trim().toLowerCase() });
      setFini(data);
    } catch (e2) {
      const d = e2.response?.data || {};
      const parChamp = {};
      Object.entries(d).forEach(([k, v]) => { if (k in VIDE) parChamp[k] = Array.isArray(v) ? v[0] : String(v); });
      setErreursServeur(parChamp);
      const premiere = Object.keys(parChamp)[0];
      if (premiere) setEtape(champsEtape.findIndex((c) => c.includes(premiere)) === -1 ? etape : champsEtape.findIndex((c) => c.includes(premiere)));
      setErreur(d.detail || (premiere ? 'Corrigez le champ signalé en rouge.' : 'Envoi impossible. Réessayez dans un instant.'));
    } finally {
      setEnvoi(false);
    }
  };

  const champ = (nom, label, props = {}) => (
    <TextField fullWidth size="medium" label={label} value={f[nom]} onChange={changer(nom)} onBlur={quitter(nom)}
      error={!!err(nom)} helperText={err(nom) || props.helperText || ' '} {...props} />
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, bgcolor: '#f4f7fc' }}>
      {/* ── Côté image ── */}
      <Box sx={{ position: 'relative', overflow: 'hidden', flex: { md: '1 1 42%' }, minHeight: { md: '100vh' }, color: '#fff', display: 'flex' }}>
        <Box component="img" src={photo} alt="" aria-hidden sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: { xs: 'linear-gradient(180deg, rgba(11,61,145,0.65), rgba(8,20,45,0.92))', md: 'linear-gradient(160deg, rgba(8,20,45,0.92) 0%, rgba(11,61,145,0.82) 55%, rgba(11,61,145,0.45) 100%)' } }} />
        <Box sx={{ position: 'relative', zIndex: 1, p: { xs: 3, md: 6 }, pb: { xs: 9, md: 6 }, display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
          <Box display="flex" alignItems="center" gap={1.25} component={Link} to="/login" sx={{ color: 'inherit', textDecoration: 'none' }}>
            <Box sx={{ width: 44, height: 44, borderRadius: 2.5, bgcolor: '#fff', color: BLEU, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SchoolIcon /></Box>
            <Typography sx={{ fontWeight: 800, fontSize: 20 }} color="inherit">Gestion École</Typography>
          </Box>
          <Box sx={{ my: { md: 'auto' } }}>
            <Typography component="h1" color="inherit" sx={{ fontWeight: 800, fontSize: { xs: 26, md: 38 }, lineHeight: 1.15 }}>
              Ouvrez l&apos;espace numérique de votre école
            </Typography>
            <Typography color="inherit" sx={{ mt: 1.5, opacity: 0.9, display: { xs: 'none', sm: 'block' } }}>
              Trois minutes pour la demande. Notre équipe vérifie l&apos;établissement, puis vous envoie vos accès.
            </Typography>
            <Box sx={{ mt: 4, display: { xs: 'none', md: 'grid' }, gap: 2 }}>
              {[['1', 'Vous décrivez l’école et son directeur'], ['2', 'La plateforme vérifie et valide la demande'],
                ['3', 'Le directeur reçoit un mot de passe provisoire et se connecte avec son e-mail']].map(([n, t]) => (
                <Box key={n} display="flex" alignItems="center" gap={1.5}>
                  <Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: OR, color: '#1a1a1a', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</Box>
                  <Typography color="inherit" sx={{ fontWeight: 600 }}>{t}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Côté formulaire ── */}
      <Box sx={{ flex: { md: '1 1 58%' }, display: 'flex', alignItems: 'center', justifyContent: 'center', px: { xs: 2, sm: 4 }, py: { xs: 0, md: 5 }, mt: { xs: -5, md: 0 }, position: 'relative', zIndex: 2 }}>
        <Box sx={{ width: '100%', maxWidth: 620, bgcolor: '#fff', borderRadius: 4, p: { xs: 3, sm: 4.5 }, mb: { xs: 4, md: 0 },
          boxShadow: '0 24px 60px rgba(8,30,70,0.12)', animation: `${apparition} .6s ease both` }}>
          {fini ? (
            <Box textAlign="center" py={2}>
              <MarkEmailReadIcon sx={{ fontSize: 64, color: 'success.main', mb: 1 }} />
              <Typography sx={{ fontWeight: 800, fontSize: 26, color: '#0f1d3a' }}>Demande envoyée</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
                La demande de <strong>{fini.ecole}</strong> est entre les mains de la plateforme. Après vérification, le directeur reçoit un
                <strong> mot de passe provisoire</strong> (par SMS ou par téléphone) et se connecte avec <strong>{fini.email}</strong>.
                Il choisira son propre mot de passe à la première connexion.
              </Typography>
              <Button component={Link} to="/login" variant="contained" size="large" disableElevation sx={{ borderRadius: 2.5, textTransform: 'none', fontWeight: 800, px: 4, bgcolor: BLEU }}>
                Retour à la connexion
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={envoyer} noValidate>
              <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, sm: 26 }, color: '#0f1d3a' }}>Créer l&apos;espace de mon école</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>Les champs marqués * sont obligatoires.</Typography>

              {/* étapes */}
              <Box display="flex" alignItems="center" mb={3}>
                {ETAPES.map((x, i) => {
                  const faite = i < etape;
                  const active = i === etape;
                  return (
                    <Box key={x.titre} display="flex" alignItems="center" sx={{ flex: i < ETAPES.length - 1 ? 1 : 'none' }}>
                      <Box display="flex" alignItems="center" gap={1} sx={{ cursor: faite ? 'pointer' : 'default' }} onClick={() => faite && setEtape(i)}>
                        <Box sx={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          bgcolor: faite ? 'success.main' : active ? BLEU : '#e6ecf5', color: faite || active ? '#fff' : '#6b7a94', transition: 'all .3s' }}>
                          {faite ? <CheckCircleIcon fontSize="small" /> : <x.Icone fontSize="small" />}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: active ? 800 : 600, color: active ? '#0f1d3a' : '#6b7a94', display: { xs: active ? 'block' : 'none', sm: 'block' }, whiteSpace: 'nowrap' }}>
                          {x.titre}
                        </Typography>
                      </Box>
                      {i < ETAPES.length - 1 && <Box sx={{ flex: 1, height: 2, mx: 1.5, bgcolor: faite ? 'success.main' : '#e6ecf5', transition: 'all .3s' }} />}
                    </Box>
                  );
                })}
              </Box>

              {erreur && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{erreur}</Alert>}

              <Box key={etape} sx={{ animation: `${apparition} .35s ease both`, display: 'grid', gap: 0.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                {etape === 0 && (
                  <>
                    <Box sx={{ gridColumn: '1 / -1' }}>{champ('nom_ecole', "Nom de l'établissement *", { placeholder: 'Ex. : Complexe Scolaire Wend-Panga', autoFocus: true })}</Box>
                    {champ('statut_juridique', 'Statut *', { select: true, children: STATUTS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>) })}
                    {champ('ordre_enseignement', "Ordre d'enseignement *", { select: true, children: ORDRES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>) })}
                    {champ('annee_creation', 'Année de création', { placeholder: '2008', inputProps: { inputMode: 'numeric', maxLength: 4 } })}
                    {champ('numero_autorisation', "N° d'autorisation d'ouverture", { placeholder: 'Ex. : arrêté n° 2010-045/MENA', helperText: 'Facilite la vérification.' })}
                  </>
                )}
                {etape === 1 && (
                  <>
                    {champ('ville', 'Ville *', { placeholder: 'Ex. : Bobo-Dioulasso', autoFocus: true })}
                    {champ('adresse', 'Quartier / adresse', { placeholder: 'Ex. : Secteur 22, avenue de la Révolution' })}
                    {champ('direction_regionale', 'Direction régionale', { placeholder: 'Ex. : DREPS des Hauts-Bassins' })}
                    {champ('direction_provinciale', 'Direction provinciale', { placeholder: 'Ex. : DPEPS du Houet' })}
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      {champ('telephone', "Téléphone de l'école *", { placeholder: '20 97 00 00  ou  +225 27 22 44 55 66', inputProps: { inputMode: 'tel' },
                        helperText: 'Burkina Faso : le numéro suffit. Autre pays : commencez par votre indicatif (+225…).' })}
                    </Box>
                  </>
                )}
                {etape === 2 && (
                  <>
                    <Box sx={{ gridColumn: '1 / -1' }}>{champ('directeur', 'Nom et prénom du directeur *', { placeholder: 'Ex. : Issa Kaboré', autoFocus: true })}</Box>
                    {champ('email', 'E-mail du directeur *', { type: 'email', placeholder: 'directeur@ecole.bf', inputProps: { inputMode: 'email', autoCapitalize: 'none' },
                      helperText: 'Il servira à vous connecter.' })}
                    {champ('telephone_directeur', 'Téléphone du directeur *', { placeholder: '70 12 34 56  ou  +225 07 12 34 56 78', inputProps: { inputMode: 'tel' },
                      helperText: 'Pour recevoir le mot de passe provisoire. Autre pays : commencez par votre indicatif (+225…).' })}
                    <Box sx={{ gridColumn: '1 / -1', p: 2, borderRadius: 2.5, bgcolor: '#f4f7fc', mt: 0.5 }}>
                      <Typography variant="body2" fontWeight={800} mb={0.75}>Récapitulatif</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {f.nom_ecole} · {(STATUTS.find(([v]) => v === f.statut_juridique) || ['', ''])[1]} · {(ORDRES.find(([v]) => v === f.ordre_enseignement) || ['', ''])[1]}
                        {f.ville && ` · ${f.ville}`}{f.telephone && ` · ${f.telephone}`}
                      </Typography>
                    </Box>
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      <FormControlLabel sx={{ alignItems: 'flex-start', mt: 1 }}
                        control={<Checkbox checked={certifie} onChange={(e) => setCertifie(e.target.checked)} sx={{ pt: 0.25 }} />}
                        label={<Typography variant="body2">Je certifie diriger cet établissement et que ces informations sont exactes.</Typography>} />
                    </Box>
                  </>
                )}
              </Box>

              <Box display="flex" gap={1.5} mt={2.5}>
                {etape > 0 && (
                  <Button variant="outlined" size="large" startIcon={<ArrowBackIcon />} onClick={() => setEtape(etape - 1)}
                    sx={{ borderRadius: 2.5, textTransform: 'none', fontWeight: 700, borderColor: '#cfd9ea', color: BLEU }}>Retour</Button>
                )}
                <Box flex={1} />
                {etape < 2 ? (
                  <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={suivant} disableElevation
                    sx={{ borderRadius: 2.5, textTransform: 'none', fontWeight: 800, px: 4, bgcolor: BLEU }}>Continuer</Button>
                ) : (
                  <Button type="submit" variant="contained" size="large" disableElevation disabled={envoi || !certifie || !etapeValide(2)}
                    endIcon={!envoi && <ArrowForwardIcon />}
                    sx={{ borderRadius: 2.5, textTransform: 'none', fontWeight: 800, px: 4, bgcolor: BLEU, '&.Mui-disabled': { bgcolor: '#c9d6ea', color: '#fff' } }}>
                    {envoi ? <CircularProgress size={22} color="inherit" /> : 'Envoyer la demande'}
                  </Button>
                )}
              </Box>

              <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap" mt={3} pt={2.5} sx={{ borderTop: '1px solid #eef1f6' }}>
                <Box display="flex" alignItems="center" gap={0.75} sx={{ color: '#8a96ad' }}>
                  <VerifiedUserIcon sx={{ fontSize: 16 }} />
                  <Typography variant="caption" color="inherit">Chaque demande est vérifiée par la plateforme</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Déjà un compte ? <Box component={Link} to="/login" sx={{ color: BLEU, fontWeight: 700, textDecoration: 'none' }}>Se connecter</Box>
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
