import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Container, Grid, IconButton, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import SchoolIcon from '@mui/icons-material/School';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PhoneIcon from '@mui/icons-material/Phone';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { vitrineService } from 'services/api';
import { readThrough, CacheKeys, NEVER_CACHED_MSG } from 'offline/cacheStore';
import { sendOrQueue, QUEUED_MSG } from 'offline/syncManager';
import { useIsOnline } from 'offline/RequireOnline';
import { estEnLigne } from 'offline/reseau';
import { nuances } from 'utils/couleurs';

// Pièces que le parent peut joindre dès la préinscription (facultatives)
const PIECES = [
  { code: 'PHOTO', libelle: "Photo d'identité de l'élève", accept: 'image/*' },
  { code: 'ACTE_NAISSANCE', libelle: 'Acte / extrait de naissance' },
  { code: 'QUITTANCE_SORTIE', libelle: "Quittance / certificat de sortie de l'ancienne école" },
  { code: 'BULLETIN_PRECEDENT', libelle: 'Dernier bulletin' },
  { code: 'CERTIFICAT_MEDICAL', libelle: 'Certificat médical' },
  { code: 'PIECE_PARENT', libelle: "Pièce d'identité du parent / tuteur" },
];
const TAILLE_MAX = 5 * 1024 * 1024;

const EMPTY = {
  nom: '', prenom: '', date_naissance: '', sexe: '', niveau_souhaite: '',
  nom_parent: '', telephone_parent: '', email_parent: '', message: '',
};
const LIBELLES = {
  nom: "Nom de l'élève", prenom: "Prénom de l'élève", date_naissance: 'Date de naissance', sexe: 'Sexe',
  niveau_souhaite: 'Niveau souhaité', nom_parent: 'Nom du parent', telephone_parent: 'Téléphone',
  email_parent: 'E-mail', message: 'Message', photo: 'Photo',
};

const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`;
const telValide = (t) => {
  const brut = String(t || '').trim();
  const chiffres = brut.replace(/\D/g, '').replace(/^00/, '');
  // autre pays : +indicatif puis le numéro ; Burkina : 8 chiffres
  if (/^(\+|00)/.test(brut) && !/^(\+|00)\s*226/.test(brut)) return chiffres.length >= 8 && chiffres.length <= 15;
  return chiffres.replace(/^226/, '').length === 8;
};
const tailleLisible = (o) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

function Etape({ n, titre, sousTitre, c, children }) {
  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: 3, border: '1px solid #eceef2', p: { xs: 2.5, sm: 3.5 }, mb: 2.5 }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={sousTitre ? 0.5 : 2.5}>
        <Box sx={{
          width: 32, height: 32, borderRadius: '50%', bgcolor: c.main, color: '#fff', fontWeight: 800, fontSize: 15,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{n}</Box>
        <Typography sx={{ fontWeight: 800, fontSize: 19 }}>{titre}</Typography>
      </Box>
      {sousTitre && <Typography sx={{ color: '#5b6472', fontSize: 14.5, mb: 2.5, ml: { sm: 5.5 } }}>{sousTitre}</Typography>}
      {children}
    </Box>
  );
}

export default function FormulaireDossier() {
  const { slug } = useParams();
  const online = useIsOnline();
  const [ecole, setEcole] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [fichiers, setFichiers] = useState({}); // code -> fichier (PHOTO = photo de l'élève)
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [touche, setTouche] = useState(false); // l'utilisateur a tenté d'envoyer : on montre les champs manquants
  const [envoye, setEnvoye] = useState(null); // { nom, queued }

  useEffect(() => {
    readThrough(CacheKeys.vitrine(slug), async () => {
      const res = await vitrineService.get(slug);
      return res.data;
    })
      .then((r) => {
        if (r.neverCached) setError(NEVER_CACHED_MSG);
        else setEcole(r.data);
      })
      .catch(() => setError(estEnLigne() ? 'École introuvable ou site non disponible.' : NEVER_CACHED_MSG))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (ecole?.nom_ecole) document.title = `Inscription — ${ecole.nom_ecole}`;
  }, [ecole]);

  const c = useMemo(() => nuances(ecole?.couleur_primaire || '#1B5E20'), [ecole]);
  const champ = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const manquants = {
    nom: !form.nom.trim(), prenom: !form.prenom.trim(), niveau_souhaite: !form.niveau_souhaite,
    nom_parent: !form.nom_parent.trim(), telephone_parent: !telValide(form.telephone_parent),
  };
  const erreur = (k) => touche && manquants[k];
  const niveau = (ecole?.niveaux || []).find((n) => String(n.id) === String(form.niveau_souhaite));
  const tarif = niveau && (ecole?.tarifs || []).find((t) => t.niveau === niveau.nom);
  const nbFichiers = Object.keys(fichiers).length;

  const choisirFichier = (code) => (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > TAILLE_MAX) { setError(`« ${f.name} » dépasse 5 Mo. Prenez une photo moins lourde ou un PDF plus léger.`); return; }
    setError('');
    setFichiers((prev) => ({ ...prev, [code]: f }));
  };
  const retirerFichier = (code) => setFichiers(({ [code]: _, ...reste }) => reste);

  const handleSubmit = async () => {
    setTouche(true);
    if (Object.values(manquants).some(Boolean)) {
      setError('Complétez les champs signalés en rouge.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (nbFichiers > 0 && !online) {
      setError('Connexion requise pour envoyer la photo et les pièces. Retirez-les pour déposer le dossier hors ligne.');
      return;
    }
    setSending(true);
    setError('');
    try {
      let queued = false;
      if (nbFichiers > 0) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
        Object.entries(fichiers).forEach(([code, f]) => fd.append(code === 'PHOTO' ? 'photo' : `piece_${code}`, f));
        await vitrineService.depotDossier(slug, fd);
      } else {
        const result = await sendOrQueue({
          kind: 'vitrine_dossier',
          label: `Dossier ${form.prenom} ${form.nom}`,
          payload: { slug, fields: { ...form } },
        });
        queued = Boolean(result.queued);
      }
      setEnvoye({ nom: `${form.prenom} ${form.nom}`.trim(), niveau: niveau?.nom, queued });
      setForm(EMPTY);
      setFichiers({});
      setTouche(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const data = err?.response?.data;
      if (data && typeof data === 'object') {
        const msg = Object.entries(data)
          .map(([k, v]) => `${LIBELLES[k] || (k === 'detail' ? '' : k)}${LIBELLES[k] ? ' : ' : ''}${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' · ');
        setError(msg || "Impossible d'envoyer le dossier.");
      } else {
        setError("Impossible d'envoyer le dossier. Vérifiez votre connexion et réessayez.");
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress /></Box>;
  }

  const tel = (ecole?.telephone || '').replace(/\s/g, '');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f7f9', color: '#14181f' }}>
      {/* ── En-tête ── */}
      <Box sx={{ background: `linear-gradient(135deg, ${c.darker} 0%, ${c.main} 100%)`, color: '#fff' }}>
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4.5 } }}>
          <Button component={Link} to={`/ecole/${slug}`} startIcon={<ArrowBackIcon />}
            sx={{ color: '#fff', textTransform: 'none', fontWeight: 600, mb: 2, ml: -1, opacity: 0.9 }}>
            Retour au site de l&apos;école
          </Button>
          <Box display="flex" alignItems="center" gap={2}>
            <Box sx={{ width: 64, height: 64, borderRadius: 2.5, bgcolor: '#fff', p: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {ecole?.logo_url
                ? <Box component="img" src={ecole.logo_url} alt="" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <SchoolIcon sx={{ color: c.main, fontSize: 36 }} />}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: '1.5rem', md: '2rem' }, lineHeight: 1.15 }}>
                Demande d&apos;inscription
              </Typography>
              <Typography sx={{ opacity: 0.9, mt: 0.5 }}>
                {ecole?.nom_ecole || 'École'}{ecole?.annee_scolaire ? ` · Année scolaire ${ecole.annee_scolaire}` : ''}
              </Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        {envoye ? (
          /* ── Confirmation ── */
          <Box sx={{ maxWidth: 640, mx: 'auto', bgcolor: '#fff', borderRadius: 3, border: '1px solid #eceef2', p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 72, color: '#0ca30c' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 24, mt: 1.5 }}>
              {envoye.queued ? 'Dossier enregistré' : 'Dossier envoyé'}
            </Typography>
            <Typography sx={{ color: '#4a5260', mt: 1.5, lineHeight: 1.7 }}>
              {envoye.queued
                ? QUEUED_MSG
                : <>La demande pour <strong>{envoye.nom}</strong>{envoye.niveau ? <> en <strong>{envoye.niveau}</strong></> : null} est bien arrivée à l&apos;école.
                  Le secrétariat va l&apos;étudier et vous contactera par téléphone.</>}
            </Typography>
            <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: c.lighter, textAlign: 'left' }}>
              <Typography fontWeight={700} fontSize={14.5}>Et ensuite ?</Typography>
              <Typography fontSize={14} sx={{ color: '#4a5260', mt: 0.5, lineHeight: 1.7 }}>
                Préparez les pièces que vous n&apos;avez pas jointes : elles vous seront demandées à l&apos;école,
                au moment de confirmer l&apos;inscription et de faire le premier versement.
              </Typography>
            </Box>
            <Box display="flex" gap={1.5} justifyContent="center" flexWrap="wrap" mt={3.5}>
              <Button component={Link} to={`/ecole/${slug}`} variant="contained" disableElevation
                sx={{ bgcolor: c.main, '&:hover': { bgcolor: c.dark }, textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3 }}>
                Retour au site de l&apos;école
              </Button>
              <Button onClick={() => setEnvoye(null)} sx={{ color: c.main, textTransform: 'none', fontWeight: 700 }}>
                Inscrire un autre enfant
              </Button>
            </Box>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {/* ── Formulaire ── */}
            <Grid size={{ xs: 12, md: 8 }}>
              {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}
              {!online && (
                <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2 }}>
                  Vous êtes hors ligne : le dossier sera envoyé dès le retour de la connexion (sans les pièces jointes).
                </Alert>
              )}

              {ecole && (
                <>
                  <Etape n={1} titre="L'élève" c={c}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth required label="Nom" value={form.nom} onChange={champ('nom')}
                          error={erreur('nom')} helperText={erreur('nom') ? 'Obligatoire' : ' '} inputProps={{ maxLength: 100 }} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth required label="Prénom(s)" value={form.prenom} onChange={champ('prenom')}
                          error={erreur('prenom')} helperText={erreur('prenom') ? 'Obligatoire' : ' '} inputProps={{ maxLength: 100 }} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth type="date" label="Date de naissance" value={form.date_naissance} onChange={champ('date_naissance')}
                          InputLabelProps={{ shrink: true }} inputProps={{ max: new Date().toISOString().slice(0, 10) }} helperText=" " />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <ToggleButtonGroup exclusive fullWidth value={form.sexe} onChange={(_, v) => setForm({ ...form, sexe: v || '' })}
                          sx={{ height: 56, '& .Mui-selected': { bgcolor: `${c.lighter} !important`, color: `${c.darker} !important`, fontWeight: 700 } }}>
                          <ToggleButton value="M" sx={{ textTransform: 'none', fontSize: 15 }}>Garçon</ToggleButton>
                          <ToggleButton value="F" sx={{ textTransform: 'none', fontSize: 15 }}>Fille</ToggleButton>
                        </ToggleButtonGroup>
                      </Grid>
                      <Grid size={12}>
                        <TextField select fullWidth required label="Classe demandée (niveau)" value={form.niveau_souhaite} onChange={champ('niveau_souhaite')}
                          error={erreur('niveau_souhaite')}
                          helperText={erreur('niveau_souhaite') ? 'Choisissez le niveau' : 'Le niveau où vous souhaitez inscrire votre enfant cette année.'}>
                          {(ecole.niveaux || []).map((n) => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
                        </TextField>
                      </Grid>
                    </Grid>
                  </Etape>

                  <Etape n={2} titre="Le parent ou tuteur" sousTitre="L'école vous contactera à ce numéro pour la suite de l'inscription." c={c}>
                    <Grid container spacing={2}>
                      <Grid size={12}>
                        <TextField fullWidth required label="Nom et prénom" value={form.nom_parent} onChange={champ('nom_parent')}
                          error={erreur('nom_parent')} helperText={erreur('nom_parent') ? 'Obligatoire' : ' '} inputProps={{ maxLength: 150 }} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth required label="Téléphone" value={form.telephone_parent} onChange={champ('telephone_parent')}
                          placeholder="70 12 34 56" type="tel" inputProps={{ maxLength: 20 }}
                          error={erreur('telephone_parent')} helperText={erreur('telephone_parent') ? '8 chiffres au Burkina (ex. 70 12 34 56), ou avec votre indicatif (ex. +225 07 12 34 56 78)' : ' '} />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField fullWidth label="E-mail (facultatif)" type="email" value={form.email_parent} onChange={champ('email_parent')} helperText=" " />
                      </Grid>
                      <Grid size={12}>
                        <TextField fullWidth multiline minRows={3} label="Message à l'école (facultatif)" value={form.message} onChange={champ('message')}
                          placeholder="Ancienne école, redoublement, question particulière…" inputProps={{ maxLength: 1000 }} />
                      </Grid>
                    </Grid>
                  </Etape>

                  <Etape n={3} titre="Les pièces du dossier" c={c}
                    sousTitre="Facultatif : joignez-les maintenant ou apportez-les à l'école. Photo ou PDF, 5 Mo au plus par fichier.">
                    <Box sx={{ border: '1px solid #eceef2', borderRadius: 2, overflow: 'hidden' }}>
                      {PIECES.map((pc, i) => {
                        const f = fichiers[pc.code];
                        return (
                          <Box key={pc.code} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderTop: i ? '1px solid #eceef2' : 'none', bgcolor: f ? c.lighter : '#fff' }}>
                            {f
                              ? <CheckCircleIcon sx={{ color: '#0ca30c', flexShrink: 0 }} />
                              : <UploadFileIcon sx={{ color: '#9aa1ac', flexShrink: 0 }} />}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography fontWeight={600} fontSize={15}>{pc.libelle}</Typography>
                              {f && <Typography fontSize={13} sx={{ color: '#5b6472' }} noWrap>{f.name} · {tailleLisible(f.size)}</Typography>}
                            </Box>
                            {f && <IconButton size="small" onClick={() => retirerFichier(pc.code)} aria-label="Retirer"><DeleteOutlineIcon fontSize="small" /></IconButton>}
                            <Button component="label" size="small" variant={f ? 'text' : 'outlined'} disabled={!online}
                              sx={{ flexShrink: 0, textTransform: 'none', fontWeight: 700, borderRadius: 2, color: c.main, borderColor: c.main }}>
                              {f ? 'Changer' : 'Joindre'}
                              <input type="file" hidden accept={pc.accept || 'image/*,.pdf'} onChange={choisirFichier(pc.code)} />
                            </Button>
                          </Box>
                        );
                      })}
                    </Box>
                  </Etape>

                  <Button fullWidth variant="contained" size="large" disableElevation
                    startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
                    disabled={sending} onClick={handleSubmit}
                    sx={{ bgcolor: c.main, '&:hover': { bgcolor: c.dark }, py: 1.6, fontWeight: 800, fontSize: 16, borderRadius: 2, textTransform: 'none' }}>
                    {sending ? 'Envoi en cours…' : (online ? 'Envoyer la demande d’inscription' : 'Enregistrer la demande (hors ligne)')}
                  </Button>
                  <Typography sx={{ mt: 1.5, color: '#5b6472', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                    <LockOutlinedIcon sx={{ fontSize: 16 }} /> Vos informations ne sont transmises qu&apos;à l&apos;école.
                  </Typography>
                </>
              )}
            </Grid>

            {/* ── Récapitulatif ── */}
            {ecole && (
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ position: { md: 'sticky' }, top: 24, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                  <Box sx={{ bgcolor: '#fff', borderRadius: 3, border: '1px solid #eceef2', p: 3 }}>
                    <Typography fontWeight={800} fontSize={17} mb={2}>Votre demande</Typography>
                    {[
                      ['Élève', `${form.prenom} ${form.nom}`.trim() || '—'],
                      ['Niveau', niveau?.nom || '—'],
                      ['Parent', form.nom_parent || '—'],
                      ['Pièces jointes', nbFichiers ? `${nbFichiers} sur ${PIECES.length}` : 'Aucune'],
                    ].map(([l, v]) => (
                      <Box key={l} display="flex" justifyContent="space-between" gap={2} py={0.9} sx={{ borderBottom: '1px dashed #e3e6ea' }}>
                        <Typography fontSize={14} sx={{ color: '#5b6472' }}>{l}</Typography>
                        <Typography fontSize={14} fontWeight={700} textAlign="right" sx={{ wordBreak: 'break-word' }}>{v}</Typography>
                      </Box>
                    ))}
                    {tarif && (
                      <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: c.lighter }}>
                        <Typography fontSize={13} sx={{ color: c.darker, fontWeight: 700 }}>Frais de scolarité {niveau.nom}</Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: 24, color: c.darker }}>{fcfa(tarif.montant_total)}</Typography>
                        <Typography fontSize={12.5} sx={{ color: '#4a5260' }}>par an, payables en plusieurs versements à l&apos;école</Typography>
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ bgcolor: '#fff', borderRadius: 3, border: '1px solid #eceef2', p: 3 }}>
                    <Typography fontWeight={800} fontSize={17} mb={1.5}>Comment ça se passe ?</Typography>
                    {['Vous envoyez cette demande', 'Le secrétariat l’étudie et vous appelle', 'Vous confirmez l’inscription à l’école'].map((t, i) => (
                      <Box key={t} display="flex" gap={1.5} alignItems="center" py={0.75}>
                        <Chip label={i + 1} size="small" sx={{ bgcolor: c.main, color: '#fff', fontWeight: 800, width: 26 }} />
                        <Typography fontSize={14.5}>{t}</Typography>
                      </Box>
                    ))}
                    {tel && (
                      <Button href={`tel:${tel}`} startIcon={<PhoneIcon />} fullWidth variant="outlined"
                        sx={{ mt: 2, textTransform: 'none', fontWeight: 700, borderRadius: 2, color: c.main, borderColor: c.main }}>
                        Une question ? {ecole.telephone}
                      </Button>
                    )}
                  </Box>
                </Box>
              </Grid>
            )}
          </Grid>
        )}
      </Container>
    </Box>
  );
}
