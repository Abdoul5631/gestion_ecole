import { useEffect, useState, useRef } from 'react';
import { enseignantService, userService } from 'services/api';
import api from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, CircularProgress, TextField, InputAdornment, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, IconButton, Tooltip, Divider, Chip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import useIsMobile from 'hooks/useIsMobile';

const DEFAULT_PASSWORD = 'Enseignant@2024';

export default function ListeEnseignants() {
  const [enseignants, setEnseignants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActif, setFilterActif] = useState('all');

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [credDialog, setCredDialog] = useState(false);
  const [selected, setSelected] = useState(null);

  // Champs formulaire création
  const [nom, setNom] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
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

  const fetchData = () => {
    setLoading(true);
    enseignantService.getAll()
      .then(res => setEnseignants(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = enseignants.filter(e => {
    const matchSearch = e.nom.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && e.is_active)
      || (filterActif === 'suspended' && !e.is_active);
    return matchSearch && matchActif;
  });

  const openCreate = () => {
    setNom(''); setUsername(''); setEmail('');
    setPassword(DEFAULT_PASSWORD); setShowPassword(false);
    setError('');
    setOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const ensRes = await enseignantService.create({ nom });
      const enseignantId = ensRes.data.id;

      const userPayload = { username, password, role: 'ENSEIGNANT', enseignant: enseignantId };
      if (email) userPayload.email = email;
      await userService.create(userPayload);

      setCreatedCreds({ nom, username, password });
      setOpen(false);
      fetchData();
      setCredDialog(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.username) setError(`Identifiant : ${Array.isArray(data.username) ? data.username[0] : data.username}`);
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
        fd.append('signature', editSigFile);
        await api.patch(`/enseignants/${selected.id}/`, fd, {
          headers: { 'Content-Type': undefined }
        });
      } else {
        await enseignantService.update(selected.id, { nom: editNom });
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
      if (data?.username) setError(`Identifiant : ${Array.isArray(data.username) ? data.username[0] : data.username}`);
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

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Gestion des Enseignants</Typography>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Nouvel Enseignant
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card>
        <CardContent>
          <Box display="flex" gap={2} mb={3}>
            <TextField fullWidth placeholder="Rechercher par nom..." value={search}
              onChange={e => setSearch(e.target.value)} size="small"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <TextField select label="Statut" size="small" sx={{ minWidth: 160 }}
              value={filterActif} onChange={e => setFilterActif(e.target.value)}>
              <MenuItem value="all">Tous</MenuItem>
              <MenuItem value="active">Actifs</MenuItem>
              <MenuItem value="suspended">Suspendus</MenuItem>
            </TextField>
          </Box>

          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead sx={{ bgcolor: 'primary.main' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'white' }}><strong>Nom de l'Enseignant</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Compte</strong></TableCell>
                    <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">Aucun enseignant trouvé</TableCell>
                    </TableRow>
                  ) : filtered.map(e => (
                    <TableRow key={e.id} hover
                      sx={{ opacity: e.is_active ? 1 : 0.6, bgcolor: e.is_active ? 'inherit' : '#fff8e1' }}>
                      <TableCell><Typography fontWeight="bold">{e.nom}</Typography></TableCell>
                      <TableCell>
                        {e.is_active
                          ? <Chip label="Actif" color="success" size="small" />
                          : <Chip label="Suspendu" color="warning" size="small" />}
                      </TableCell>
                      <TableCell>
                        {e.username
                          ? <Chip icon={<AccountCircleIcon />} label={e.username} size="small" color="primary" variant="outlined" />
                          : <Typography variant="caption" color="text.secondary">—</Typography>}
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" gap={0.5} justifyContent="flex-end">
                          <Tooltip title="Modifier le nom">
                            <IconButton size="small" color="primary" onClick={() => handleEdit(e)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={e.is_active ? 'Suspendre' : 'Réactiver'}>
                            <IconButton size="small"
                              color={e.is_active ? 'warning' : 'success'}
                              onClick={() => { setSelected(e); setSuspendOpen(true); }}>
                              {e.is_active
                                ? <PauseCircleIcon fontSize="small" />
                                : <PlayCircleIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
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
            <TextField fullWidth label="Identifiant (username)" value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="ex: m.dupont" required />
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
            disabled={saving || !nom || !username || !password}>
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
        <DialogTitle>Compte créé avec succès</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            L'enseignant <strong>{createdCreds?.nom}</strong> a bien été ajouté avec un compte d'accès.
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
