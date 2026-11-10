import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, InputAdornment, MenuItem, TextField, Tooltip, Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import PaymentsIcon from '@mui/icons-material/Payments';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import CampaignIcon from '@mui/icons-material/Campaign';
import GroupsIcon from '@mui/icons-material/Groups';
import LanguageIcon from '@mui/icons-material/Language';
import { userService, equipeService, getResults } from 'services/api';
import useIsMobile from 'hooks/useIsMobile';
import { useIsOnline } from 'offline/RequireOnline';

const ROLES = {
  SECRETAIRE: {
    nom: 'Secrétaire', couleur: '#1976d2', icone: <AssignmentIndIcon />,
    peut: ['Ajouter et modifier les élèves', 'Inscriptions en ligne et affectation en classe', 'Saisir les notes et les devoirs'],
    nePeutPas: ['Voir la caisse'],
  },
  COMPTABLE: {
    nom: 'Comptable', couleur: '#2e7d32', icone: <PaymentsIcon />,
    peut: ['Encaisser et éditer les reçus', 'Noter les dépenses, suivre le bilan', 'Relancer les familles'],
    nePeutPas: ['Modifier les élèves', 'Voir les notes'],
  },
  COMMUNICATION: {
    nom: 'Responsable du site public', couleur: '#6a1b9a', icone: <LanguageIcon />,
    peut: ['Modifier la présentation, la photo et les contacts du site', 'Publier et retirer les actualités', 'Activer ou masquer le site'],
    nePeutPas: ['Voir les élèves, les notes ou la caisse', 'Modifier les paramètres de l’école'],
  },
  SURVEILLANT: {
    nom: 'Surveillant', couleur: '#e65100', icone: <EventBusyIcon />,
    peut: ['Suivre les absents du jour', 'Consulter les classes et l’emploi du temps'],
    nePeutPas: ['Voir la caisse', 'Voir les notes'],
  },
};

/** 70 12 34 56 / +226 70123456 / 0022670123456 → 22670123456 (identifiant de connexion) */
function normaliserTel(saisie) {
  const brut = String(saisie || '').trim();
  // autre pays : +indicatif puis le numéro, gardé tel quel (+22507123456)
  if (/^(\+|00)/.test(brut) && !/^(\+|00)\s*226/.test(brut)) {
    const etranger = brut.replace(/\D/g, '').replace(/^00/, '');
    return etranger.length >= 8 && etranger.length <= 15 ? `+${etranger}` : '';
  }
  let n = brut.replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.length === 8) n = `226${n}`;
  return /^226\d{8}$/.test(n) ? n : '';
}
const formaterTel = (n) => {
  const m = String(n || '').match(/^226(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m && String(n || '').startsWith('+')) return n;
  return m ? `+226 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : n;
};
const nomComplet = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
const COULEURS_AVATAR = ['#2563eb', '#0d9488', '#7c3aed', '#c2410c', '#be185d', '#15803d', '#0369a1', '#a16207'];
const couleurAvatar = (m) => COULEURS_AVATAR[(m.id || 0) % COULEURS_AVATAR.length];
const initiales = (nom) => nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?';
const VIDE = { nom: '', role: 'SECRETAIRE', telephone: '', password: '', cumuls: [] };
// Petites écoles : une seule personne peut faire secrétariat + caisse (aligné sur accounts/roles.py)
const CUMUL = { SECRETAIRE: ['COMPTABLE', 'COMMUNICATION'], COMPTABLE: ['SECRETAIRE'], COMMUNICATION: ['SECRETAIRE'] };
const rolesDe = (m) => [m.role, ...(m.roles_supplementaires || []).filter((r) => r !== m.role)];
const DESTINATAIRES = [
  ['ENSEIGNANT', 'Les enseignants'], ['SECRETAIRE', 'Les secrétaires'], ['COMPTABLE', 'Les comptables'], ['SURVEILLANT', 'Les surveillants'], ['COMMUNICATION', 'Les responsables du site'],
];

export default function GestionPersonnel() {
  const online = useIsOnline();
  const isMobile = useIsMobile();
  const [membres, setMembres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [dialogue, setDialogue] = useState(null); // { mode: 'creer' | 'modifier', membre? }
  const [form, setForm] = useState(VIDE);
  const [voirMdp, setVoirMdp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creds, setCreds] = useState(null);
  const [aSuspendre, setASuspendre] = useState(null);
  const [annonce, setAnnonce] = useState(null); // { roles: Set, titre, message }
  const [envoiAnnonce, setEnvoiAnnonce] = useState(false);
  const [filtre, setFiltre] = useState(''); // '' = tout le monde, sinon un rôle

  const charger = () => {
    setLoading(true);
    userService.getAll('?inclure_suspendus=1&page_size=500')
      .then((res) => setMembres(getResults(res).items.filter((u) => ROLES[u.role])))
      .catch(() => setErreur("Impossible de charger l'équipe."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { charger(); }, []);

  const parRole = useMemo(() => Object.keys(ROLES).map((code) => ({
    code, liste: membres.filter((m) => rolesDe(m).includes(code)),
  })), [membres]);

  const ouvrirCreation = () => { setForm(VIDE); setVoirMdp(false); setErreur(''); setDialogue({ mode: 'creer' }); };
  const ouvrirModification = (m) => {
    setForm({ nom: nomComplet(m), role: m.role, telephone: formaterTel(m.username.split('.')[0]), password: '', cumuls: rolesDe(m).filter((r) => r !== m.role) });
    setVoirMdp(false); setErreur(''); setDialogue({ mode: 'modifier', membre: m });
  };

  const coupeNom = (nom) => {
    const mots = nom.trim().split(/\s+/);
    return { first_name: mots.length > 1 ? mots.slice(0, -1).join(' ') : '', last_name: mots[mots.length - 1] || '' };
  };

  const enregistrer = async () => {
    const tel = normaliserTel(form.telephone);
    if (!form.nom.trim()) { setErreur('Indiquez le nom.'); return; }
    if (!tel) { setErreur('Numéro de téléphone invalide : 8 chiffres au Burkina (ex. 70 12 34 56), ou avec votre indicatif (ex. +225 07 12 34 56 78).'); return; }
    setSaving(true);
    setErreur('');
    try {
      const identite = {
        ...coupeNom(form.nom), role: form.role,
        roles_supplementaires: (CUMUL[form.role] || []).filter((r) => form.cumuls.includes(r)),
      };
      if (dialogue.mode === 'creer') {
        const charge = { ...identite, username: tel };
        if (form.password) charge.password = form.password;
        let res;
        try {
          res = await userService.create(charge);
        } catch (err) {
          // numéro déjà pris par un autre compte (parent, enseignant) : on suffixe, la connexion par téléphone reste possible
          if (err?.response?.data?.username) res = await userService.create({ ...charge, username: `${tel}.s` });
          else throw err;
        }
        setCreds({
          nom: form.nom, telephone: formaterTel(tel), password: res.data.mot_de_passe_temporaire || form.password,
          libelle: [form.role, ...identite.roles_supplementaires].map((r) => ROLES[r].nom).join(' + '),
        });
      } else {
        const m = dialogue.membre;
        const charge = { ...identite };
        if (tel !== m.username.split('.')[0]) charge.username = m.username.includes('.') ? `${tel}.${m.username.split('.')[1]}` : tel;
        if (form.password) charge.password = form.password;
        await userService.patch(m.id, charge);
        setSucces('Modifications enregistrées.');
        setTimeout(() => setSucces(''), 3000);
      }
      setDialogue(null);
      charger();
    } catch (err) {
      const d = err?.response?.data;
      setErreur(d?.username?.[0] || d?.role?.[0] || d?.password?.[0] || d?.detail || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const basculer = async () => {
    const m = aSuspendre;
    try {
      if (m.is_active) await userService.delete(m.id); else await userService.reactiver(m.id);
      setSucces(m.is_active ? `${nomComplet(m)} est suspendu(e) : plus de connexion possible.` : `${nomComplet(m)} est réactivé(e).`);
      setTimeout(() => setSucces(''), 4000);
      charger();
    } catch {
      setErreur('Action impossible.');
    } finally {
      setASuspendre(null);
    }
  };

  const copier = (t) => navigator.clipboard?.writeText(t || '');

  const envoyerAnnonce = async () => {
    setEnvoiAnnonce(true);
    setErreur('');
    try {
      const res = await equipeService.message({
        destinataires: [...annonce.roles], titre: annonce.titre, message: annonce.message,
      });
      setAnnonce(null);
      setSucces(res.data.detail);
      setTimeout(() => setSucces(''), 5000);
    } catch (err) {
      setErreur(err?.response?.data?.detail || "Envoi impossible.");
    } finally {
      setEnvoiAnnonce(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2.5} gap={1.5} flexWrap="wrap">
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Équipe de l&apos;école</Typography>
          <Typography variant="body2" color="text.secondary">
            Donnez à chaque membre du personnel un accès limité à son travail, sans lui ouvrir toute l&apos;application.
          </Typography>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button variant="outlined" color="inherit" startIcon={<CampaignIcon />} disabled={!online} sx={{ borderColor: 'divider', fontWeight: 600 }}
            onClick={() => { setErreur(''); setAnnonce({ roles: new Set(DESTINATAIRES.map(([c]) => c)), titre: '', message: '' }); }}>
            Écrire à l&apos;équipe
          </Button>
          <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={ouvrirCreation} disabled={!online} sx={{ fontWeight: 700 }}>Ajouter un membre</Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>Un membre de l&apos;équipe quitte l&apos;école ?</strong> Suspendez son compte : il ne peut plus se connecter, mais son historique
        (élèves ajoutés, paiements, actions de l’historique) est conservé. Puis cliquez sur « Ajouter un membre » pour créer le compte de son
        remplaçant : il choisira son propre mot de passe à sa première connexion. Ne donnez jamais le compte d&apos;une personne à une autre.
      </Alert>

      {succes && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucces('')}>{succes}</Alert>}
      {erreur && !dialogue && !annonce && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErreur('')}>{erreur}</Alert>}

      {loading ? <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box> : (
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 330px' }, alignItems: 'start' }}>
          {/* ── Les personnes ── */}
          <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ px: 2, pt: 1.5, pb: 1.25, display: 'flex', gap: 1, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
              {[['', 'Tout le monde', membres.length], ...parRole.map((g) => [g.code, `${ROLES[g.code].nom}s`, g.liste.length])].map(([code, libelle, n]) => {
                const actif = filtre === code;
                return (
                  <Chip key={code || 'tous'} clickable onClick={() => setFiltre(code)}
                    label={<>{libelle} <Box component="span" sx={{ ml: 0.5, opacity: 0.7, fontWeight: 700 }}>{n}</Box></>}
                    sx={{
                      fontWeight: 600, borderRadius: 2,
                      bgcolor: actif ? 'primary.main' : 'transparent', color: actif ? '#fff' : 'text.primary',
                      border: '1px solid', borderColor: actif ? 'primary.main' : 'divider',
                      '&:hover': { bgcolor: actif ? 'primary.dark' : 'action.hover' },
                    }} />
                );
              })}
            </Box>
            {(() => {
              const liste = membres.filter((m) => !filtre || rolesDe(m).includes(filtre));
              if (liste.length === 0) {
                return (
                  <Box sx={{ p: 5, textAlign: 'center' }}>
                    <GroupsIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
                    <Typography color="text.secondary" mt={1}>
                      {membres.length ? 'Personne avec ce rôle pour l’instant.' : 'Aucun membre du personnel. Ajoutez votre secrétaire, votre comptable…'}
                    </Typography>
                    <Button variant="outlined" startIcon={<AddIcon />} sx={{ mt: 2 }} onClick={ouvrirCreation} disabled={!online}>Ajouter un membre</Button>
                  </Box>
                );
              }
              return liste.map((m, i) => (
                <Box key={m.id} sx={{
                  display: 'flex', alignItems: 'center', gap: 1.75, px: 2, py: 1.5,
                  borderTop: i ? '1px solid' : 'none', borderColor: 'divider', opacity: m.is_active ? 1 : 0.55,
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                  <Avatar sx={{ width: 42, height: 42, fontSize: 15, fontWeight: 700, bgcolor: couleurAvatar(m) }}>{initiales(nomComplet(m))}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={700} noWrap>{nomComplet(m)}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>{formaterTel(m.username.split('.')[0])}</Typography>
                  </Box>
                  <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end', width: 230 }}>
                    {rolesDe(m).map((r) => (
                      <Chip key={r} size="small" icon={ROLES[r].icone} label={ROLES[r].nom}
                        sx={{ fontWeight: 700, bgcolor: `${ROLES[r].couleur}14`, color: ROLES[r].couleur, '& .MuiChip-icon': { color: ROLES[r].couleur, fontSize: 16 } }} />
                    ))}
                  </Box>
                  <Box sx={{ width: { xs: 'auto', md: 150 }, display: { xs: 'none', md: 'block' } }}>
                    {!m.is_active
                      ? <Chip size="small" label="Suspendu" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 700 }} />
                      : m.must_change_password
                        ? <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 600 }}>Pas encore connecté</Typography>
                        : <Typography variant="caption" sx={{ color: 'success.dark', fontWeight: 600 }}>● Actif</Typography>}
                  </Box>
                  <Tooltip title="Modifier">
                    <span><IconButton size="small" disabled={!online} onClick={() => ouvrirModification(m)}><EditIcon fontSize="small" /></IconButton></span>
                  </Tooltip>
                  <Tooltip title={m.is_active ? 'Suspendre' : 'Réactiver'}>
                    <span>
                      <IconButton size="small" disabled={!online} onClick={() => setASuspendre(m)} color={m.is_active ? 'default' : 'success'}>
                        {m.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ));
            })()}
          </Card>

          {/* ── Ce que chaque rôle peut faire ── */}
          <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
            <CardContent>
              <Typography fontWeight={800} mb={0.5}>Ce que chaque rôle peut faire</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                Une personne peut cumuler secrétaire et comptable, ou secrétaire et responsable du site public (petites écoles).
              </Typography>
              {Object.entries(ROLES).map(([code, r], i) => (
                <Box key={code} sx={{ pt: i ? 1.5 : 0, mt: i ? 1.5 : 0, borderTop: i ? '1px solid' : 'none', borderColor: 'divider' }}>
                  <Box display="flex" alignItems="center" gap={1} mb={0.75}>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: `${r.couleur}1a`, color: r.couleur, '& svg': { fontSize: 17 } }}>{r.icone}</Avatar>
                    <Typography fontWeight={700} fontSize={14.5}>{r.nom}</Typography>
                  </Box>
                  {r.peut.map((t) => (
                    <Box key={t} display="flex" gap={0.75} alignItems="flex-start" sx={{ ml: 0.5 }}>
                      <CheckIcon sx={{ fontSize: 15, color: 'success.main', mt: '3px' }} />
                      <Typography variant="body2" fontSize={13}>{t}</Typography>
                    </Box>
                  ))}
                  {r.nePeutPas.map((t) => (
                    <Box key={t} display="flex" gap={0.75} alignItems="flex-start" sx={{ ml: 0.5 }}>
                      <CloseIcon sx={{ fontSize: 15, color: 'text.disabled', mt: '3px' }} />
                      <Typography variant="body2" fontSize={13} color="text.secondary">{t}</Typography>
                    </Box>
                  ))}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Message à l'équipe */}
      <Dialog open={Boolean(annonce)} onClose={() => setAnnonce(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Écrire à l&apos;équipe</DialogTitle>
        <DialogContent>
          {erreur && annonce && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}
          {annonce && (
            <Box display="flex" flexDirection="column" gap={1.5} sx={{ pt: 1 }}>
              <Box>
                <Typography variant="subtitle2">Destinataires</Typography>
                <Box display="flex" flexWrap="wrap" columnGap={2}>
                  {DESTINATAIRES.map(([code, libelle]) => (
                    <FormControlLabel key={code} label={libelle} control={
                      <Checkbox checked={annonce.roles.has(code)} onChange={() => {
                        const n = new Set(annonce.roles);
                        if (n.has(code)) n.delete(code); else n.add(code);
                        setAnnonce({ ...annonce, roles: n });
                      }} />} />
                  ))}
                </Box>
              </Box>
              <TextField label="Titre" value={annonce.titre} inputProps={{ maxLength: 160 }} onChange={(e) => setAnnonce({ ...annonce, titre: e.target.value })} />
              <TextField label="Message" multiline minRows={4} value={annonce.message} inputProps={{ maxLength: 2000 }}
                onChange={(e) => setAnnonce({ ...annonce, message: e.target.value })}
                helperText="Chaque personne le reçoit dans sa cloche de notifications." />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={() => setAnnonce(null)}>Annuler</Button>
          <Button variant="contained" disabled={envoiAnnonce || !annonce?.titre.trim() || !annonce?.message.trim() || annonce?.roles.size === 0}
            onClick={envoyerAnnonce}>
            {envoiAnnonce ? 'Envoi…' : 'Envoyer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Créer / modifier */}
      <Dialog open={Boolean(dialogue)} onClose={() => setDialogue(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>{dialogue?.mode === 'creer' ? 'Ajouter un membre du personnel' : `Modifier ${dialogue?.membre ? nomComplet(dialogue.membre) : ''}`}</DialogTitle>
        <DialogContent>
          {erreur && <Alert severity="error" sx={{ mb: 2 }}>{erreur}</Alert>}
          <Box display="flex" flexDirection="column" gap={2} sx={{ pt: 1 }}>
            <TextField label="Nom complet" value={form.nom} autoFocus onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            <TextField select label="Rôle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              helperText={ROLES[form.role].peut.join(' · ')}>
              {Object.entries(ROLES).map(([code, r]) => <MenuItem key={code} value={code}>{r.nom}</MenuItem>)}
            </TextField>
            {CUMUL[form.role] && (
              <Box sx={{ mt: -1 }}>
                {CUMUL[form.role].map((autre) => (
                  <FormControlLabel key={autre} sx={{ display: 'flex' }}
                    control={<Checkbox checked={form.cumuls.includes(autre)}
                      onChange={(e) => setForm({ ...form, cumuls: e.target.checked ? [...form.cumuls, autre] : form.cumuls.filter((r) => r !== autre) })} />}
                    label={<>Fait aussi le travail de <strong>{ROLES[autre].nom.toLowerCase()}</strong></>} />
                ))}
                <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 4 }}>
                  Pour les petites écoles : une seule personne, un seul compte. Elle voit les menus de chaque rôle
                  {form.cumuls.length ? ` (${[form.role, ...form.cumuls].map((r) => ROLES[r].nom).join(' + ')})` : ''}.
                </Typography>
              </Box>
            )}
            <TextField label="Téléphone (identifiant de connexion)" value={form.telephone} placeholder="ex : 70 12 34 56"
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              helperText="La personne se connecte avec ce numéro et son mot de passe. Autre pays : commencez par + et l’indicatif." />
            <TextField label={dialogue?.mode === 'creer' ? 'Mot de passe (laisser vide pour en générer un)' : 'Nouveau mot de passe (laisser vide pour ne pas changer)'}
              type={voirMdp ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end"><IconButton size="small" onClick={() => setVoirMdp((v) => !v)}>{voirMdp ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment> }}
              helperText="Elle devra le changer à sa première connexion." />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={() => setDialogue(null)}>Annuler</Button>
          <Button variant="contained" disabled={saving} onClick={enregistrer}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        </DialogActions>
      </Dialog>

      {/* Identifiants à remettre */}
      <Dialog open={Boolean(creds)} onClose={() => setCreds(null)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Compte créé</DialogTitle>
        <DialogContent>
          {creds && (
            <>
              <Alert severity="success" sx={{ mb: 2 }}><strong>{creds.nom}</strong> ({creds.libelle}) peut maintenant se connecter.</Alert>
              <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: 2 }}>
                {[['Identifiant (téléphone)', creds.telephone], ['Mot de passe', creds.password]].map(([e, v], i) => (
                  <Box key={e}>
                    {i > 0 && <Divider sx={{ my: 1 }} />}
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="caption" color="text.secondary">{e}</Typography>
                        <Typography fontWeight="bold" fontFamily="monospace">{v}</Typography>
                      </Box>
                      <IconButton size="small" onClick={() => copier(v)}><ContentCopyIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                Notez ce mot de passe maintenant : il ne sera plus affiché. La personne devra le changer à sa première connexion.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button variant="contained" onClick={() => setCreds(null)}>Fermer</Button></DialogActions>
      </Dialog>

      {/* Suspendre / réactiver */}
      <Dialog open={Boolean(aSuspendre)} onClose={() => setASuspendre(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{aSuspendre?.is_active ? 'Suspendre ce compte' : 'Réactiver ce compte'}</DialogTitle>
        <DialogContent>
          <Typography>
            {aSuspendre?.is_active
              ? <>Suspendre <strong>{aSuspendre && nomComplet(aSuspendre)}</strong> ? La personne ne pourra plus se connecter, vous pourrez la réactiver à tout moment.</>
              : <>Réactiver <strong>{aSuspendre && nomComplet(aSuspendre)}</strong> ?</>}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={() => setASuspendre(null)}>Annuler</Button>
          <Button variant="contained" color={aSuspendre?.is_active ? 'warning' : 'success'} onClick={basculer}>
            {aSuspendre?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
