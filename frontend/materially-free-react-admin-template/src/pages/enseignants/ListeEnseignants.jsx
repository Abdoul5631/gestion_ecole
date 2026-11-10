import { useEffect, useState, useRef } from 'react';
import { enseignantService, userService, parametresService } from 'services/api';
import { genererMotDePasseTemporaire } from 'offline/tempPassword';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, CircularProgress, TextField, InputAdornment, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, IconButton, Tooltip, Divider, Chip, Avatar
} from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CoursEnseignant from './CoursEnseignant';
import useIsMobile from 'hooks/useIsMobile';


const formaterTel = (n) => {
  const m = String(n || '').match(/^226(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return m ? `+226 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : (n || '');
};

export default function ListeEnseignants() {
  const [enseignants, setEnseignants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActif, setFilterActif] = useState('all');
  const [filterClasse, setFilterClasse] = useState('');

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [credDialog, setCredDialog] = useState(false);
  const [selected, setSelected] = useState(null);

  const [coursPour, setCoursPour] = useState(null); // enseignant dont on gère les cours

  // Champs formulaire création
  const [nom, setNom] = useState('');
  const [, setUsername] = useState('');
  const [telephone, setTelephone] = useState('');
  const [editTelephone, setEditTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [defautEcole, setDefautEcole] = useState('');

  // Mot de passe par défaut défini par l'école (Paramètres > Comptes & accès)
  useEffect(() => {
    parametresService.get().then((r) => setDefautEcole((r.data?.mot_de_passe_defaut_enseignants || '').trim())).catch(() => {});
  }, []);
  const [showPassword, setShowPassword] = useState(false);

  // Champs modification
  const [editNom, setEditNom] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [editSigFile, setEditSigFile] = useState(null);
  const [editSigPreview, setEditSigPreview] = useState(null);
  const [currentSigUrl, setCurrentSigUrl] = useState(null);
  const sigEditRef = useRef();

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [createdCreds, setCreatedCreds] = useState(null);
  const isMobile = useIsMobile();
  const compact = useMediaQuery(useTheme().breakpoints.down('md')); // tablette / téléphone : cartes

  const fetchData = () => {
    setLoading(true);
    enseignantService.getAll('?inclure_suspendus=1')
      .then(res => setEnseignants(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = enseignants.filter(e => {
    const matchSearch = e.nom.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && e.is_active)
      || (filterActif === 'suspended' && !e.is_active);
    // classe : les enseignants qui y ont au moins un cours, ou qui en sont le professeur principal
    const matchClasse = !filterClasse || (e.classes || []).some((c) => String(c.id) === String(filterClasse));
    return matchSearch && matchActif && matchClasse;
  });

  // classes proposées : celles où au moins un enseignant intervient
  const classesProposees = [...new Map(enseignants.flatMap((e) => e.classes || []).map((c) => [c.id, c.nom])).entries()]
    .map(([id, nom]) => ({ id, nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true }));

  const openCreate = () => {
    setNom(''); setUsername(''); setTelephone(''); setEmail('');
    // Défaut de l'école si défini, sinon un mot de passe aléatoire (le serveur impose le changement à la 1re connexion)
    setPassword(defautEcole || genererMotDePasseTemporaire()); setShowPassword(false);
    setError('');
    setOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const ensRes = await enseignantService.create({ nom, telephone });
      const enseignantId = ensRes.data.id;
      const login = ensRes.data.telephone; // numéro normalisé par le serveur : c'est l'identifiant de connexion

      const userPayload = { username: login, password, role: 'ENSEIGNANT', enseignant: enseignantId };
      if (email) userPayload.email = email;
      try {
        await userService.create(userPayload);
      } catch (errUser) {
        // Même numéro déjà pris par un compte (ex. parent) : on suffixe, la connexion par téléphone reste possible
        if (errUser.response?.data?.username) {
          await userService.create({ ...userPayload, username: `${login}.e` });
        } else {
          throw errUser;
        }
      }

      setCreatedCreds({ nom, username: formaterTel(login), password });
      setOpen(false);
      fetchData();
      setCredDialog(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.telephone) setError(`Téléphone : ${Array.isArray(data.telephone) ? data.telephone[0] : data.telephone}`);
      else if (data?.username) setError(`Identifiant : ${Array.isArray(data.username) ? data.username[0] : data.username}`);
      else if (data?.detail) setError(data.detail);
      else setError("Erreur lors de la création. Vérifiez que l'identifiant n'est pas déjà utilisé.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (e) => {
    setSelected(e);
    setEditNom(e.nom);
    setEditUsername(e.username || '');
    setEditTelephone(e.telephone || '');
    setEditEmail(e.email || '');
    setEditPassword('');
    setEditShowPassword(false);
    setEditSigFile(null);
    setEditSigPreview(null);
    setCurrentSigUrl(e.signature_url || null);
    setError('');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true);
    setError('');
    try {
      // Si un nouveau cachet est uploadé, utiliser FormData
      if (editSigFile) {
        const fd = new FormData();
        fd.append('nom', editNom);
        fd.append('telephone', editTelephone);
        fd.append('signature', editSigFile);
        await api.patch(`/enseignants/${selected.id}/`, fd, {
          headers: { 'Content-Type': undefined }
        });
      } else {
        await enseignantService.update(selected.id, { nom: editNom, telephone: editTelephone });
      }

      if (selected.user_id) {
        const userPayload = { username: editUsername, email: editEmail };
        if (editPassword) userPayload.password = editPassword;
        await userService.patch(selected.user_id, userPayload);
      }

      setSuccess('Enseignant modifié !');
      setEditOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.telephone) setError(`Téléphone : ${Array.isArray(data.telephone) ? data.telephone[0] : data.telephone}`);
      else if (data?.username) setError(`Identifiant : ${Array.isArray(data.username) ? data.username[0] : data.username}`);
      else setError('Erreur lors de la modification.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async () => {
    try {
      await enseignantService.patch(selected.id, { is_active: !selected.is_active });
      const msg = selected.is_active ? 'Enseignant suspendu.' : 'Enseignant réactivé !';
      setSuccess(msg);
      setSuspendOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  const copyToClipboard = (text) => navigator.clipboard.writeText(text);

  const initiales = (nom = '') => nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join('').toUpperCase() || '?';

  const telephoneCell = (e) => (e.telephone
    ? <Typography variant="body2">{formaterTel(e.telephone)}</Typography>
    : <Chip label="Téléphone à renseigner" size="small" color="warning" variant="outlined" clickable onClick={() => handleEdit(e)} />);

  const actionsCell = (e) => (
    <Box display="flex" gap={0.5} justifyContent="flex-end">
      <Tooltip title="Ses cours (matières et classes)">
        <IconButton size="small" color="primary" onClick={() => setCoursPour(e)}><MenuBookIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title="Modifier">
        <IconButton size="small" color="primary" onClick={() => handleEdit(e)}><EditIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title={e.is_active ? 'Suspendre' : 'Réactiver'}>
        <IconButton size="small" color={e.is_active ? 'warning' : 'success'} onClick={() => { setSelected(e); setSuspendOpen(true); }}>
          {e.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1} flexWrap="wrap">
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Enseignants</Typography>
          <Typography variant="body2" color="text.secondary">
            {enseignants.length} enseignant{enseignants.length > 1 ? 's' : ''}
            {enseignants.some((e) => !e.telephone) ? ` · ${enseignants.filter((e) => !e.telephone).length} sans téléphone` : ''}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Nouvel enseignant</Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ borderRadius: 3, boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Box display="flex" gap={1.5} mb={2} flexWrap="wrap">
            <TextField placeholder="Rechercher par nom..." value={search} sx={{ flex: 1, minWidth: 200 }}
              onChange={e => setSearch(e.target.value)} size="small"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <TextField select label="Classe" size="small" sx={{ minWidth: 170 }}
              value={filterClasse} onChange={e => setFilterClasse(e.target.value)}>
              <MenuItem value="">Toutes les classes</MenuItem>
              {classesProposees.map((c) => <MenuItem key={c.id} value={c.id}>{c.nom}</MenuItem>)}
            </TextField>
            <TextField select label="Statut" size="small" sx={{ minWidth: 150 }}
              value={filterActif} onChange={e => setFilterActif(e.target.value)}>
              <MenuItem value="all">Tous</MenuItem>
              <MenuItem value="active">Actifs</MenuItem>
              <MenuItem value="suspended">Suspendus</MenuItem>
            </TextField>
          </Box>

          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : filtered.length === 0 ? (
            <Alert severity="info">Aucun enseignant trouvé.</Alert>
          ) : compact ? (
            <Box display="flex" flexDirection="column" gap={1}>
              {filtered.map((e) => (
                <Card key={e.id} variant="outlined" sx={{ borderRadius: 3, opacity: e.is_active ? 1 : 0.65 }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Avatar sx={{ bgcolor: 'primary.light', fontWeight: 700 }}>{initiales(e.nom)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography fontWeight={700} noWrap>{e.nom}</Typography>
                        {!e.is_active && <Chip label="Suspendu" size="small" color="warning" />}
                      </Box>
                      {actionsCell(e)}
                    </Box>
                    <Box display="flex" gap={1} flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
                      {telephoneCell(e)}
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
              <Table sx={{ tableLayout: 'fixed', '& td, & th': { py: 1.25 } }}>
                <TableHead sx={{ '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, bgcolor: 'action.hover' } }}>
                  <TableRow>
                    <TableCell sx={{ width: '34%' }}>Enseignant</TableCell>
                    <TableCell sx={{ width: '30%' }}>Téléphone (connexion)</TableCell>
                    <TableCell sx={{ width: '16%' }}>Statut</TableCell>
                    <TableCell align="right" sx={{ width: '20%' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(e => (
                    <TableRow key={e.id} hover sx={{ '& td': { opacity: e.is_active ? 1 : 0.65 } }}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1.5}>
                          <Avatar sx={{ bgcolor: 'primary.light', fontWeight: 700, width: 38, height: 38, fontSize: 14 }}>{initiales(e.nom)}</Avatar>
                          <Typography fontWeight={700} noWrap>{e.nom}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{telephoneCell(e)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={e.is_active ? 'Actif' : 'Suspendu'} color={e.is_active ? 'success' : 'warning'} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{actionsCell(e)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <CoursEnseignant enseignant={coursPour} open={Boolean(coursPour)} onClose={() => setCoursPour(null)} onChange={fetchData} />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            {filtered.length} enseignant(s)
          </Typography>
        </CardContent>
      </Card>

      {/* ── Dialog Ajout ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvel Enseignant + Compte</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Profil Enseignant
          </Typography>
          <TextField fullWidth label="Nom complet" value={nom}
            onChange={e => setNom(e.target.value)} autoFocus
            placeholder="ex: Monsieur Dupont" sx={{ mb: 2 }} />
          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary">Compte d'accès</Typography>
          </Divider>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField fullWidth label="Téléphone (identifiant de connexion)" value={telephone}
              onChange={e => setTelephone(e.target.value)}
              placeholder="ex: 70 12 34 56" required
              helperText="L'enseignant se connectera avec ce numéro et son mot de passe." />
            <TextField fullWidth label="Email (optionnel)" type="email" value={email}
              onChange={e => setEmail(e.target.value)} />
            <TextField
              fullWidth label="Mot de passe"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <IconButton size="small" onClick={() => setShowPassword(p => !p)}>
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                )
              }}
              helperText="Communiquez ce mot de passe à l'enseignant."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || !nom || !telephone || !password}>
            {saving ? 'Création...' : 'Créer Enseignant + Compte'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Modification ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.nom}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Profil Enseignant
          </Typography>
          <TextField fullWidth label="Nom complet" value={editNom}
            onChange={e => setEditNom(e.target.value)} autoFocus sx={{ mb: 2 }} />
          <TextField fullWidth label="Téléphone (identifiant de connexion)" value={editTelephone}
            onChange={e => setEditTelephone(e.target.value)} sx={{ mb: 2 }}
            placeholder="ex: 70 12 34 56"
            helperText="Avec ce numéro, l'enseignant peut se connecter (en plus de son identifiant actuel)." />

          {/* Cachet / Signature */}
          <Box mb={2}>
            <Typography variant="subtitle2" gutterBottom>Cachet / Signature (optionnel)</Typography>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              Apparaîtra sur les bulletins des classes dont il est professeur principal
            </Typography>
            <Box
              sx={{
                width: '100%', height: 80, border: '2px dashed', borderColor: 'warning.light',
                borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', cursor: 'pointer', bgcolor: 'grey.50',
                '&:hover': { borderColor: 'warning.main' }
              }}
              onClick={() => sigEditRef.current.click()}
            >
              {(editSigPreview || currentSigUrl) ? (
                <Box component="img" src={editSigPreview || currentSigUrl}
                  sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <Typography variant="caption" color="text.secondary">Cliquer pour ajouter le cachet</Typography>
              )}
            </Box>
            <input ref={sigEditRef} type="file" accept="image/*" hidden
              onChange={e => {
                const f = e.target.files[0];
                if (f) { setEditSigFile(f); setEditSigPreview(URL.createObjectURL(f)); }
              }} />
            <Button size="small" sx={{ mt: 0.5 }} startIcon={<PhotoCameraIcon />}
              onClick={() => sigEditRef.current.click()}>
              {(editSigPreview || currentSigUrl) ? 'Changer' : 'Ajouter'}
            </Button>
          </Box>

          <Divider sx={{ my: 2 }}>
            <Typography variant="caption" color="text.secondary">Compte d'accès</Typography>
          </Divider>

          <Box display="flex" flexDirection="column" gap={2}>
            <TextField fullWidth label="Identifiant (username)" value={editUsername}
              onChange={e => setEditUsername(e.target.value)}
              disabled={!selected?.user_id}
              helperText={!selected?.user_id ? "Aucun compte associé à cet enseignant" : ''} />
            <TextField fullWidth label="Email (optionnel)" type="email" value={editEmail}
              onChange={e => setEditEmail(e.target.value)}
              disabled={!selected?.user_id} />
            <TextField
              fullWidth label="Nouveau mot de passe (laisser vide pour ne pas changer)"
              type={editShowPassword ? 'text' : 'password'}
              value={editPassword}
              onChange={e => setEditPassword(e.target.value)}
              disabled={!selected?.user_id}
              InputProps={{
                endAdornment: (
                  <IconButton size="small" onClick={() => setEditShowPassword(p => !p)}>
                    {editShowPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                )
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate}
            disabled={saving || !editNom || (!!selected?.user_id && !editUsername)}>
            {saving ? 'Modification...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Suspendre / Réactiver ── */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>
          {selected?.is_active ? "Suspendre l'enseignant" : "Réactiver l'enseignant"}
        </DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>
                Suspendre <strong>{selected?.nom}</strong> ?
              </Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                L'enseignant ne pourra plus se connecter tant qu'il n'est pas réactivé.
                Ses cours et ses notes restent conservés.
              </Alert>
            </>
          ) : (
            <Typography>
              Réactiver <strong>{selected?.nom}</strong> ?
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained"
            color={selected?.is_active ? 'warning' : 'success'}
            onClick={handleToggleSuspend}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Identifiants créés ── */}
      <Dialog open={credDialog} onClose={() => setCredDialog(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{createdCreds?.reset ? 'Mot de passe réinitialisé' : 'Compte créé avec succès'}</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            {createdCreds?.reset
              ? <>Le mot de passe de <strong>{createdCreds?.nom}</strong> a été réinitialisé. Il devra le changer à sa prochaine connexion.</>
              : <>L'enseignant <strong>{createdCreds?.nom}</strong> a bien été ajouté avec un compte d'accès. Il devra changer son mot de passe à sa première connexion.</>}
          </Alert>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Identifiants à transmettre à l'enseignant :
          </Typography>
          <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: 2, mt: 1 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary">Identifiant</Typography>
                <Typography fontWeight="bold" fontFamily="monospace">{createdCreds?.username}</Typography>
              </Box>
              <Tooltip title="Copier">
                <IconButton size="small" onClick={() => copyToClipboard(createdCreds?.username)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary">Mot de passe</Typography>
                <Typography fontWeight="bold" fontFamily="monospace">{createdCreds?.password}</Typography>
              </Box>
              <Tooltip title="Copier">
                <IconButton size="small" onClick={() => copyToClipboard(createdCreds?.password)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            L'enseignant peut modifier son mot de passe une fois connecté.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button variant="contained" onClick={() => setCredDialog(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
