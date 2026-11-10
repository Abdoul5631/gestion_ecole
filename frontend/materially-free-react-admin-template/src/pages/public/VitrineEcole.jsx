import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SchoolIcon from '@mui/icons-material/School';
import MarkunreadMailboxIcon from '@mui/icons-material/MarkunreadMailbox';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PushPinIcon from '@mui/icons-material/PushPin';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CollectionsIcon from '@mui/icons-material/Collections';
import LoginIcon from '@mui/icons-material/Login';
import EditNoteIcon from '@mui/icons-material/EditNote';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FacebookIcon from '@mui/icons-material/Facebook';
import ScheduleIcon from '@mui/icons-material/Schedule';
import MapIcon from '@mui/icons-material/Map';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import GroupsIcon from '@mui/icons-material/Groups';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { vitrineService } from 'services/api';
import { nuances } from 'utils/couleurs';

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
const dateLongue = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const SECTIONS = [
  ['presentation', 'Présentation'], ['actualites', 'Actualités'], ['niveaux', 'Niveaux'],
  ['frais', 'Frais de scolarité'], ['contact', 'Contact'],
];

const ICONES_ATOUTS = [MenuBookIcon, GroupsIcon, EmojiEventsIcon, VerifiedUserIcon];

/** 70 12 34 56 / +226 70123456 → 22670123456 (lien wa.me) */
const numeroWhatsApp = (t) => {
  let n = String(t || '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.length === 8) n = `226${n}`;
  return n.length >= 10 ? n : '';
};

/** Toutes les photos d'un article : la couverture, puis la galerie. */
const photosDe = (a) => [a?.image_url, ...(a?.photos || [])].filter(Boolean);

const DELAI_PHOTOS = 5000; // les photos d'un article changent toutes les 5 secondes

/** Photos d'un article en diaporama : fondu enchaîné toutes les 5 s (une seule photo : image fixe). */
function PhotosAnimees({ photos }) {
  const [i, setI] = useState(0);
  const n = photos.length;
  useEffect(() => {
    setI(0);
    if (n < 2) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % n), DELAI_PHOTOS);
    return () => clearInterval(t);
  }, [n, photos[0]]);
  return (
    <>
      {photos.map((src, j) => (
        <Box key={src} component="img" src={src} alt="" loading={j === 0 ? 'eager' : 'lazy'} sx={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          opacity: j === i ? 1 : 0, transition: 'opacity .8s ease',
          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        }} />
      ))}
      {n > 1 && (
        <Box sx={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 0.75 }}>
          {photos.map((src, j) => (
            <Box key={src} sx={{ width: j === i ? 18 : 7, height: 7, borderRadius: 4, bgcolor: '#fff', opacity: j === i ? 1 : 0.55, transition: 'all .3s', boxShadow: '0 0 4px rgba(0,0,0,0.4)' }} />
          ))}
        </Box>
      )}
    </>
  );
}

const allerA = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function TitreSection({ surtitre, titre, sousTitre, c }) {
  return (
    <Box sx={{ mb: { xs: 3, md: 4 } }}>
      <Typography sx={{ color: c.main, fontWeight: 700, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', mb: 0.75 }}>
        {surtitre}
      </Typography>
      <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.1rem' }, lineHeight: 1.2, color: '#14181f' }}>
        {titre}
      </Typography>
      {sousTitre && <Typography sx={{ color: '#5b6472', mt: 1, maxWidth: 640, lineHeight: 1.7 }}>{sousTitre}</Typography>}
    </Box>
  );
}

export default function VitrineEcole() {
  const { slug } = useParams();
  const [ecole, setEcole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [article, setArticle] = useState(null);
  const [vue, setVue] = useState(0); // photo affichée dans l'article

  useEffect(() => {
    setLoading(true);
    setError('');
    vitrineService.get(slug)
      .then((res) => setEcole(res.data))
      .catch(() => setError('École introuvable ou site non disponible.'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (ecole?.nom_ecole) document.title = ecole.nom_ecole;
  }, [ecole]);

  // article ouvert : la photo change toute seule toutes les 5 s (le délai repart quand on change de photo à la main)
  useEffect(() => {
    const total = article ? photosDe(article).length : 0;
    if (total < 2) return undefined;
    const t = setTimeout(() => setVue((v) => (v + 1) % total), DELAI_PHOTOS);
    return () => clearTimeout(t);
  }, [article, vue]);

  const c = useMemo(() => nuances(ecole?.couleur_primaire || '#1B5E20'), [ecole]);

  // atouts saisis par le directeur ; à défaut, les mots du slogan (« Savoir, Discipline, Excellence »)
  const atouts = useMemo(() => {
    const saisis = (ecole?.atouts || []).filter((a) => a?.titre);
    if (saisis.length) return saisis;
    const morceaux = String(ecole?.slogan || '').split(/[,;•·]/).map((m) => m.trim()).filter(Boolean);
    return morceaux.length >= 2 && morceaux.length <= 4
      ? morceaux.map((titre) => ({ titre, texte: 'Une valeur que nous transmettons chaque jour à nos élèves.' }))
      : [];
  }, [ecole]);

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>;
  }
  if (error || !ecole) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="warning">{error || 'Site indisponible.'}</Alert>
        <Button component={Link} to="/login" sx={{ mt: 2 }}>Retour à la connexion</Button>
      </Container>
    );
  }

  const niveaux = ecole.niveaux || [];
  const tarifs = ecole.tarifs || [];
  const actualites = ecole.actualites || [];
  const nbClasses = niveaux.reduce((t, n) => t + (n.classes || []).length, 0);
  const lienDossier = `/ecole/${slug}/dossier`;
  const tel = (ecole.telephone || '').replace(/\s/g, '');
  const chiffres = [
    niveaux.length > 0 && [niveaux.length, niveaux.length > 1 ? 'niveaux d’enseignement' : 'niveau d’enseignement'],
    nbClasses > 0 && [nbClasses, nbClasses > 1 ? 'classes' : 'classe'],
    ecole.annee_creation && [ecole.annee_creation, 'année de création'],
    ecole.ville && [ecole.ville, 'notre ville'],
  ].filter(Boolean);
  const afficherTarifs = ecole.afficher_tarifs !== false;
  const wa = numeroWhatsApp(ecole.whatsapp);
  const sections = SECTIONS.filter(([id]) => (id !== 'actualites' || actualites.length > 0) && (id !== 'frais' || afficherTarifs));
  const bouton = {
    bgcolor: c.main, color: '#fff', fontWeight: 700, borderRadius: 2, textTransform: 'none', boxShadow: 'none',
    '&:hover': { bgcolor: c.dark, boxShadow: 'none' },
  };

  return (
    <Box sx={{ bgcolor: '#fff', color: '#14181f', '& section': { scrollMarginTop: '72px' } }}>
      {/* ── Barre de navigation ── */}
      <Box component="header" sx={{
        position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #e8eaee',
      }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', gap: 2, height: 64 }}>
          <Box display="flex" alignItems="center" gap={1.25} sx={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            {ecole.logo_url
              ? <Box component="img" src={ecole.logo_url} alt="" sx={{ width: 38, height: 38, objectFit: 'contain' }} />
              : <SchoolIcon sx={{ color: c.main, fontSize: 32 }} />}
            <Typography fontWeight={800} noWrap sx={{ fontSize: { xs: 15, sm: 17 } }}>{ecole.nom_ecole}</Typography>
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
            {sections.map(([id, l]) => (
              <Button key={id} onClick={() => allerA(id)} sx={{ color: '#3b4250', textTransform: 'none', fontWeight: 600 }}>{l}</Button>
            ))}
          </Stack>
          <Button component={Link} to={lienDossier} variant="contained" sx={{ ...bouton, px: 2.5, flexShrink: 0 }}>
            S&apos;inscrire
          </Button>
        </Container>
      </Box>

      {/* ── Accueil ── */}
      <Box sx={{
        position: 'relative', overflow: 'hidden', color: '#fff',
        background: ecole.photo_url
          ? `linear-gradient(120deg, ${c.darker}f2 0%, ${c.main}cc 55%, ${c.main}66 100%), url("${ecole.photo_url}") center / cover no-repeat`
          : `radial-gradient(circle at 85% 20%, ${c.light}55 0, transparent 45%), linear-gradient(135deg, ${c.darker} 0%, ${c.main} 100%)`,
      }}>
        <Box aria-hidden sx={{
          position: 'absolute', inset: 0, opacity: 0.07,
          backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '22px 22px',
        }} />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 7, md: 11 } }}>
          <Grid container spacing={5} alignItems="center">
            <Grid size={{ xs: 12, md: 7 }}>
              {ecole.annee_scolaire && (
                <Chip label={`Inscriptions ${ecole.annee_scolaire} ouvertes`} sx={{
                  bgcolor: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 700, mb: 2.5, border: '1px solid rgba(255,255,255,0.3)',
                }} />
              )}
              <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '2.1rem', sm: '2.7rem', md: '3.3rem' }, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                {ecole.nom_ecole}
              </Typography>
              {ecole.slogan && (
                <Typography sx={{ mt: 2, fontSize: { xs: 17, md: 20 }, opacity: 0.92, fontWeight: 500 }}>{ecole.slogan}</Typography>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                <Button component={Link} to={lienDossier} size="large" endIcon={<ArrowForwardIcon />} sx={{
                  bgcolor: '#fff', color: c.darker, fontWeight: 800, px: 3.5, py: 1.4, borderRadius: 2, textTransform: 'none',
                  '&:hover': { bgcolor: '#f1f3f5' },
                }}>
                  Déposer un dossier d&apos;inscription
                </Button>
                {tel && (
                  <Button href={`tel:${tel}`} size="large" startIcon={<PhoneIcon />} sx={{
                    color: '#fff', border: '1px solid rgba(255,255,255,0.5)', px: 3, py: 1.4, borderRadius: 2, textTransform: 'none', fontWeight: 700,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', borderColor: '#fff' },
                  }}>
                    Appeler l&apos;école
                  </Button>
                )}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 5 }} sx={{ display: 'flex', justifyContent: 'center' }}>
              <Box sx={{
                width: { xs: 170, md: 260 }, height: { xs: 170, md: 260 }, borderRadius: '28%', bgcolor: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2.5, md: 4 },
                boxShadow: '0 30px 60px rgba(0,0,0,0.25)',
              }}>
                {ecole.logo_url
                  ? <Box component="img" src={ecole.logo_url} alt={`Logo ${ecole.nom_ecole}`} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <SchoolIcon sx={{ fontSize: { xs: 80, md: 120 }, color: c.main }} />}
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* ── Chiffres clés ── */}
      {chiffres.length > 0 && (
        <Container maxWidth="lg" sx={{ position: 'relative', mt: { xs: -4, md: -5 } }}>
          <Box sx={{
            bgcolor: '#fff', borderRadius: 3, boxShadow: '0 12px 40px rgba(20,24,31,0.10)', border: '1px solid #eef0f3',
            display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: `repeat(${chiffres.length}, 1fr)` },
          }}>
            {chiffres.map(([v, l], i) => (
              <Box key={l} sx={{
                p: { xs: 2.25, md: 3 }, textAlign: 'center',
                borderLeft: { md: i ? '1px solid #eef0f3' : 'none' },
                borderTop: { xs: i >= 2 ? '1px solid #eef0f3' : 'none', md: 'none' },
                borderRight: { xs: i % 2 === 0 ? '1px solid #eef0f3' : 'none', md: 'none' },
              }}>
                <Typography sx={{ fontWeight: 800, fontSize: { xs: 22, md: 30 }, color: c.main, lineHeight: 1.1 }}>{v}</Typography>
                <Typography sx={{ color: '#5b6472', fontSize: 14, mt: 0.5 }}>{l}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      )}

      {/* ── Présentation ── */}
      <Box component="section" id="presentation" sx={{ py: { xs: 7, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">
            <Grid size={{ xs: 12, md: ecole.photo_url ? 6 : 12 }}>
              <TitreSection c={c} surtitre="Présentation" titre={`Bienvenue au ${ecole.nom_ecole}`} />
              <Typography sx={{ color: '#3b4250', whiteSpace: 'pre-line', lineHeight: 1.85, fontSize: 16.5 }}>
                {ecole.presentation}
              </Typography>
              {ecole.devise && ecole.devise !== ecole.slogan && (
                <Typography sx={{ mt: 3, fontStyle: 'italic', color: c.dark, fontWeight: 600, borderLeft: `3px solid ${c.main}`, pl: 2 }}>
                  « {ecole.devise} »
                </Typography>
              )}
            </Grid>
            {ecole.photo_url && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Box sx={{ position: 'relative' }}>
                  <Box aria-hidden sx={{ position: 'absolute', inset: 0, transform: 'translate(16px, 16px)', borderRadius: 4, bgcolor: c.lighter }} />
                  <Box component="img" src={ecole.photo_url} alt={ecole.nom_ecole} loading="lazy"
                    sx={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                </Box>
              </Grid>
            )}
          </Grid>

          {atouts.length > 0 && (
            <Box sx={{ mt: { xs: 6, md: 9 } }}>
              <TitreSection c={c} surtitre="Nos atouts" titre={`Pourquoi choisir ${ecole.nom_ecole} ?`} />
              <Grid container spacing={2.5}>
                {atouts.map((a, i) => {
                  const Icone = ICONES_ATOUTS[i % ICONES_ATOUTS.length];
                  return (
                    <Grid key={a.titre} size={{ xs: 12, sm: 6, md: 12 / Math.min(atouts.length, 4) }}>
                      <Box sx={{ height: '100%', p: 3, borderRadius: 3, bgcolor: c.lighter }}>
                        <Box sx={{ width: 52, height: 52, borderRadius: 2, bgcolor: c.main, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                          <Icone />
                        </Box>
                        <Typography fontWeight={800} fontSize={18} sx={{ wordBreak: 'break-word' }}>{a.titre}</Typography>
                        {a.texte && <Typography sx={{ color: '#4a5260', fontSize: 15, mt: 0.75, lineHeight: 1.65 }}>{a.texte}</Typography>}
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}
        </Container>
      </Box>

      {/* ── Actualités ── */}
      {actualites.length > 0 && (
        <Box component="section" id="actualites" sx={{ py: { xs: 7, md: 10 }, bgcolor: '#f6f7f9' }}>
          <Container maxWidth="lg">
            <TitreSection c={c} surtitre="Actualités" titre="La vie de l’école" sousTitre="Événements, annonces et informations importantes pour les familles." />
            <Grid container spacing={3}>
              {actualites.map((a) => (
                <Grid key={a.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Box onClick={() => { setArticle(a); setVue(0); }} sx={{
                    height: '100%', bgcolor: '#fff', borderRadius: 3, overflow: 'hidden', cursor: 'pointer', border: '1px solid #eceef2',
                    display: 'flex', flexDirection: 'column', transition: 'transform .2s, box-shadow .2s',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 16px 36px rgba(20,24,31,0.10)' },
                  }}>
                    <Box sx={{ position: 'relative', aspectRatio: '16 / 10', bgcolor: c.lighter, overflow: 'hidden' }}>
                      {photosDe(a)[0]
                        ? <PhotosAnimees photos={photosDe(a)} />
                        : <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SchoolIcon sx={{ fontSize: 56, color: c.main, opacity: 0.4 }} /></Box>}
                      {photosDe(a).length > 1 && (
                        <Chip icon={<CollectionsIcon sx={{ fontSize: 16 }} />} label={photosDe(a).length} size="small"
                          sx={{ position: 'absolute', bottom: 12, right: 12, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontWeight: 700, '& .MuiChip-icon': { color: '#fff' } }} />
                      )}
                      {a.epingle && (
                        <Chip icon={<PushPinIcon sx={{ fontSize: 16 }} />} label="À la une" size="small"
                          sx={{ position: 'absolute', top: 12, left: 12, bgcolor: c.main, color: '#fff', fontWeight: 700, '& .MuiChip-icon': { color: '#fff' } }} />
                      )}
                    </Box>
                    <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <Typography sx={{ color: c.main, fontSize: 13, fontWeight: 700 }}>{dateLongue(a.date)}</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: 18, mt: 0.75, lineHeight: 1.35, wordBreak: 'break-word' }}>{a.titre}</Typography>
                      <Typography sx={{
                        color: '#5b6472', mt: 1, lineHeight: 1.6, fontSize: 15,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {a.contenu}
                      </Typography>
                      <Typography sx={{ mt: 'auto', pt: 2, color: c.main, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        Lire la suite <ArrowForwardIcon sx={{ fontSize: 16 }} />
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      )}

      {/* ── Niveaux ── */}
      <Box component="section" id="niveaux" sx={{ py: { xs: 7, md: 10 } }}>
        <Container maxWidth="lg">
          <TitreSection c={c} surtitre="Enseignement" titre="Niveaux ouverts aux inscriptions"
            sousTitre={nbClasses ? `${niveaux.length} niveaux et ${nbClasses} classes accueillent les élèves cette année.` : null} />
          {niveaux.length === 0 ? (
            <Alert severity="info">Aucun niveau ouvert pour le moment.</Alert>
          ) : (
            <Grid container spacing={2}>
              {niveaux.map((n) => (
                <Grid key={n.id} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Box sx={{ height: '100%', p: 2.5, borderRadius: 3, border: '1px solid #eceef2', bgcolor: '#fff', position: 'relative', overflow: 'hidden' }}>
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: c.main }} />
                    <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                      <Typography fontWeight={800} fontSize={20}>{n.nom}</Typography>
                      <Typography sx={{ fontSize: 13, color: '#5b6472' }}>
                        {(n.classes || []).length} classe{(n.classes || []).length > 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Box display="flex" flexWrap="wrap" gap={0.75}>
                      {(n.classes || []).map((cl) => (
                        <Chip key={cl} label={cl} size="small" sx={{ bgcolor: c.lighter, color: c.darker, fontWeight: 700 }} />
                      ))}
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          )}
        </Container>
      </Box>

      {/* ── Frais de scolarité ── */}
      {afficherTarifs && (
      <Box component="section" id="frais" sx={{ py: { xs: 7, md: 10 }, bgcolor: '#f6f7f9' }}>
        <Container maxWidth="lg">
          <TitreSection c={c} surtitre="Frais de scolarité" titre={`Tarifs ${ecole.annee_scolaire || ''}`.trim()}
            sousTitre="Montants annuels en francs CFA. Le paiement se fait à la caisse de l’école, en plusieurs versements : les trois tranches indiquent le calendrier prévu." />
          {tarifs.length === 0 ? (
            <Alert severity="info">Les tarifs de cette année ne sont pas encore publiés. Contactez l’école pour plus d’informations.</Alert>
          ) : (
            <TableContainer sx={{ bgcolor: '#fff', borderRadius: 3, border: '1px solid #eceef2' }}>
              <Table data-no-stack sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 700, color: '#5b6472', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, borderColor: '#eceef2' } }}>
                    <TableCell>Niveau</TableCell>
                    <TableCell align="right">1re tranche</TableCell>
                    <TableCell align="right">2e tranche</TableCell>
                    <TableCell align="right">3e tranche</TableCell>
                    <TableCell align="right">Total annuel</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tarifs.map((t) => (
                    <TableRow key={t.niveau} hover sx={{ '& td': { borderColor: '#eceef2', fontSize: 15, whiteSpace: 'nowrap' }, '&:last-child td': { border: 0 } }}>
                      <TableCell sx={{ fontWeight: 800 }}>{t.niveau}</TableCell>
                      <TableCell align="right" sx={{ color: '#5b6472' }}>{fcfa(t.tranche1)}</TableCell>
                      <TableCell align="right" sx={{ color: '#5b6472' }}>{fcfa(t.tranche2)}</TableCell>
                      <TableCell align="right" sx={{ color: '#5b6472' }}>{fcfa(t.tranche3)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: c.dark, fontSize: '16px !important' }}>{fcfa(t.montant_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Container>
      </Box>
      )}

      {/* ── Comment s'inscrire ── */}
      <Box component="section" sx={{ py: { xs: 7, md: 10 } }}>
        <Container maxWidth="lg">
          <Box sx={{ borderRadius: 4, p: { xs: 3, md: 6 }, color: '#fff', background: `linear-gradient(135deg, ${c.darker}, ${c.main})` }}>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: '1.6rem', md: '2.1rem' } }}>Inscrire votre enfant</Typography>
            <Typography sx={{ opacity: 0.9, mt: 1, mb: 4, maxWidth: 620 }}>Trois étapes simples, sans vous déplacer pour la première.</Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
              {[
                [EditNoteIcon, 'Déposez le dossier en ligne', 'Remplissez le formulaire et joignez les pièces demandées.'],
                [FactCheckIcon, 'L’école étudie la demande', 'Le secrétariat vérifie le dossier et vous recontacte.'],
                [HowToRegIcon, 'Finalisez à l’école', 'Confirmation de l’inscription et premier versement à la caisse.'],
              ].map(([Icone, t, d], i) => (
                <Grid key={t} size={{ xs: 12, md: 4 }}>
                  <Box display="flex" gap={2}>
                    <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icone />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 13, opacity: 0.75, fontWeight: 700 }}>ÉTAPE {i + 1}</Typography>
                      <Typography fontWeight={800} fontSize={17}>{t}</Typography>
                      <Typography sx={{ opacity: 0.85, fontSize: 14.5, mt: 0.5, lineHeight: 1.6 }}>{d}</Typography>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
            <Button component={Link} to={lienDossier} size="large" endIcon={<ArrowForwardIcon />} sx={{
              bgcolor: '#fff', color: c.darker, fontWeight: 800, px: 3.5, py: 1.4, borderRadius: 2, textTransform: 'none', '&:hover': { bgcolor: '#f1f3f5' },
            }}>
              Commencer l&apos;inscription
            </Button>
          </Box>
        </Container>
      </Box>

      {/* ── Contact ── */}
      <Box component="section" id="contact" sx={{ pb: { xs: 7, md: 10 } }}>
        <Container maxWidth="lg">
          <TitreSection c={c} surtitre="Contact" titre="Nous trouver et nous joindre" />
          <Grid container spacing={2}>
            {[
              (ecole.adresse || ecole.ville) && [LocationOnIcon, 'Adresse', [ecole.adresse, ecole.ville].filter(Boolean).join(', '), null],
              ecole.telephone && [PhoneIcon, 'Téléphone', ecole.telephone, `tel:${tel}`],
              ecole.email && [EmailIcon, 'E-mail', ecole.email, `mailto:${ecole.email}`],
              ecole.boite_postale && [MarkunreadMailboxIcon, 'Boîte postale', ecole.boite_postale, null],
              ecole.horaires && [ScheduleIcon, 'Horaires', ecole.horaires, null],
              wa && [WhatsAppIcon, 'WhatsApp', ecole.whatsapp, `https://wa.me/${wa}`],
              ecole.facebook && [FacebookIcon, 'Facebook', 'Notre page', ecole.facebook],
            ].filter(Boolean).map(([Icone, l, v, href]) => (
              <Grid key={l} size={{ xs: 12, sm: 6, md: 3 }}>
                <Box component={href ? 'a' : 'div'} href={href || undefined}
                  target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined} sx={{
                  display: 'flex', gap: 1.75, p: 2.5, height: '100%', borderRadius: 3, border: '1px solid #eceef2', color: 'inherit', textDecoration: 'none',
                  transition: 'border-color .2s', '&:hover': href ? { borderColor: c.main } : {},
                }}>
                  <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: c.lighter, color: c.main, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icone />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, color: '#5b6472' }}>{l}</Typography>
                    <Typography fontWeight={700} sx={{ wordBreak: 'break-word' }}>{v}</Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
          {ecole.carte && (
            <Button href={ecole.carte} target="_blank" rel="noopener noreferrer" startIcon={<MapIcon />} variant="contained" sx={{ ...bouton, mt: 3, px: 3 }}>
              Voir l&apos;école sur la carte
            </Button>
          )}
        </Container>
      </Box>

      {/* ── Pied de page ── */}
      <Box component="footer" sx={{ bgcolor: '#14181f', color: 'rgba(255,255,255,0.75)', py: 4 }}>
        <Container maxWidth="lg" sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={1.25}>
            <WorkspacePremiumIcon sx={{ color: c.light }} />
            <Typography fontSize={14}>© {new Date().getFullYear()} {ecole.nom_ecole}{ecole.ville ? ` · ${ecole.ville}` : ''}</Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
          {ecole.facebook && (
            <IconButton href={ecole.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" sx={{ color: '#fff' }}>
              <FacebookIcon />
            </IconButton>
          )}
          <Button component={Link} to={`/ecole/${slug}/connexion`} startIcon={<LoginIcon />} sx={{ color: '#fff', textTransform: 'none', fontWeight: 600, alignSelf: { xs: 'flex-start', sm: 'auto' } }}>
            Espace parents, élèves et personnel
          </Button>
          </Box>
        </Container>
      </Box>

      {wa && (
        <IconButton href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label="Écrire à l'école sur WhatsApp" sx={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 20, width: 58, height: 58, bgcolor: '#25d366', color: '#fff',
          boxShadow: '0 10px 24px rgba(0,0,0,0.25)', '&:hover': { bgcolor: '#1ebe5b' },
        }}>
          <WhatsAppIcon sx={{ fontSize: 32 }} />
        </IconButton>
      )}

      {/* ── Article complet ── */}
      <Dialog open={Boolean(article)} onClose={() => setArticle(null)} maxWidth="md" fullWidth scroll="body">
        {article && (
          <>
            {photosDe(article).length > 0 && (() => {
              const photos = photosDe(article);
              const i = Math.min(vue, photos.length - 1);
              const fleche = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } };
              return (
                <Box>
                  <Box sx={{ position: 'relative', bgcolor: '#0f1115' }}>
                    <Box component="img" src={photos[i]} alt="" sx={{ width: '100%', height: { xs: 260, sm: 440 }, objectFit: 'contain', display: 'block' }} />
                    {photos.length > 1 && (
                      <>
                        <IconButton aria-label="Photo précédente" onClick={() => setVue((i - 1 + photos.length) % photos.length)} sx={{ ...fleche, left: 10 }}><ChevronLeftIcon /></IconButton>
                        <IconButton aria-label="Photo suivante" onClick={() => setVue((i + 1) % photos.length)} sx={{ ...fleche, right: 10 }}><ChevronRightIcon /></IconButton>
                        <Box sx={{ position: 'absolute', bottom: 10, right: 12, px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                          {i + 1} / {photos.length}
                        </Box>
                      </>
                    )}
                  </Box>
                  {photos.length > 1 && (
                    <Box sx={{ display: 'flex', gap: 1, p: 1.5, overflowX: 'auto', bgcolor: '#f6f7f9' }}>
                      {photos.map((p, j) => (
                        <Box key={p} component="img" src={p} alt="" loading="lazy" onClick={() => setVue(j)} sx={{
                          width: 76, height: 56, objectFit: 'cover', borderRadius: 1.5, cursor: 'pointer', flexShrink: 0,
                          outline: j === i ? `3px solid ${c.main}` : 'none', opacity: j === i ? 1 : 0.7, '&:hover': { opacity: 1 },
                        }} />
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })()}
            <DialogTitle sx={{ pr: 6 }}>
              <Typography sx={{ color: c.main, fontSize: 13, fontWeight: 700 }}>{dateLongue(article.date)}</Typography>
              <Typography component="span" sx={{ fontWeight: 800, fontSize: 22, display: 'block', mt: 0.5 }}>{article.titre}</Typography>
              <IconButton onClick={() => setArticle(null)} aria-label="Fermer" sx={{ position: 'absolute', right: 12, top: 12, bgcolor: 'rgba(255,255,255,0.85)' }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ whiteSpace: 'pre-line', lineHeight: 1.8, color: '#3b4250' }}>{article.contenu}</Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setArticle(null)} sx={{ textTransform: 'none' }}>Fermer</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
