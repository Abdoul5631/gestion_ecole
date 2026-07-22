import { useEffect, useState } from 'react';
import { userService, enseignantService, eleveService, getResults } from 'services/api';
import {
  Box, Typography, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Chip, CircularProgress, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, MenuItem, Alert, IconButton, Tooltip, Divider,
  Checkbox, ListItemText, OutlinedInput, Select, FormControl, InputLabel
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import PersonIcon from '@mui/icons-material/Person';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import useIsMobile from 'hooks/useIsMobile';

const ROLES = [
  { value: 'ENSEIGNANT', label: 'Enseignant', color: 'primary' },
  { value: 'ELEVE', label: 'Élève', color: 'success' },
  { value: 'PARENT', label: 'Parent', color: 'warning' },
];

const initForm = {
  username: '', email: '', password: '', role: 'ENSEIGNANT',
  enseignant: '', eleve: '', enfants: [], is_active: true
};

export default function GestionUtilisateurs() {
  const [users, setUsers] = useState([]);
  const [enseignants, setEnseignants] = useState([]);
  const [eleves, setEleves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const isMobile = useIsMobile();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, ensRes, elRes] = await Promise.all([
        userService.getAll(),
        enseignantService.getAll(),
        eleveService.getAll('/eleves/?page_size=500'),
      ]);
      setUsers(usersRes.data.filter(u => u.role !== 'ADMIN'));
      setEnseignants(Array.isArray(ensRes.data) ? ensRes.data : ensRes.data.results ?? []);
      const { items } = getResults(elRes);
      setEleves(items);
    } catch (err) {
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = users.filter(u =>
    `${u.username} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      // Réinitialiser le lien de profil si le rôle change
      ...(name === 'role' ? { enseignant: '', eleve: '' } : {})
    }));
  };

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (payload.role !== 'ENSEIGNANT') delete payload.enseignant;
      if (payload.role !== 'ELEVE') delete payload.eleve;
      if (payload.role !== 'PARENT') delete payload.enfants;
      if (!payload.enseignant) delete payload.enseignant;
      if (!payload.eleve) delete payload.eleve;

      await userService.create(payload);
      setSuccess('Compte créé avec succès !');
      setOpen(false);
      setForm(initForm);
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.username) setError(`Nom d'utilisateur : ${data.username[0]}`);
      else if (data?.email) setError(`Email : ${data.email[0]}`);
      else if (data?.role) setError(`Rôle : ${data.role[0]}`);
      else setError("Erreur lors de la création du compte.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user) => {
    setSelected(user);
    // Pour un PARENT : si la liste M2M enfants est vide mais l'ancien FK eleve existe,
    // pré-remplir avec l'ancien FK pour faciliter la migration
    let enfants = user.enfants || [];
    if (user.role === 'PARENT' && enfants.length === 0 && user.eleve) {
      enfants = [user.eleve];
    }
    setForm({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      enseignant: user.enseignant || '',
      eleve: user.eleve || '',
      enfants,
      is_active: user.is_active,
    });
    setError('');
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (!payload.enseignant) payload.enseignant = null;
      if (!payload.eleve) payload.eleve = null;
      // Pour un parent, enfants est la liste M2M ; pour les autres rôles, on supprime
      if (payload.role !== 'PARENT') delete payload.enfants;
      // S'assurer que enfants est un tableau d'IDs (pas d'objets)
      if (payload.enfants) payload.enfants = payload.enfants.map(e => (typeof e === 'object' ? e.id : e));

      await userService.update(selected.id, payload);
      setSuccess('Compte modifié avec succès !');
      setEditOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.username) setError(`Nom d'utilisateur : ${data.username[0]}`);
      else setError("Erreur lors de la modification.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await userService.delete(selected.id);
      setSuccess('Compte supprimé !');
      setDeleteOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError("Erreur lors de la suppression.");
    }
  };

  const getRoleColor = (role) => ROLES.find(r => r.value === role)?.color || 'default';
  const getRoleLabel = (role) => ROLES.find(r => r.value === role)?.label || role;

  const formBaseFields = (passwordRequired) => (
    <Box display="flex" flexDirection="column" gap={2} sx={{ mt: 1 }}>
      <TextField
        fullWidth label="Nom d'utilisateur" name="username"
        value={form.username} onChange={handleChange} required autoFocus
      />
      <TextField
        fullWidth label="Email" name="email" type="email"
        value={form.email} onChange={handleChange} required
      />
      <TextField
        fullWidth
        label={passwordRequired ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour ne pas changer)"}
        name="password" type={showPassword ? 'text' : 'password'}
        value={form.password} onChange={handleChange}
        required={passwordRequired}
        InputProps={{
          endAdornment: (
            <IconButton size="small" onClick={() => setShowPassword(p => !p)}>
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          )
        }}
      />
      <TextField
        fullWidth select label="Rôle" name="role"
        value={form.role} onChange={handleChange}
      >
        {ROLES.map(r => (
          <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
        ))}
      </TextField>

      {form.role === 'ENSEIGNANT' && (
        <>
          <Divider><Typography variant="caption" color="text.secondary">Lier à un profil enseignant</Typography></Divider>
          <TextField
            fullWidth select label="Profil Enseignant (optionnel)" name="enseignant"
            value={form.enseignant} onChange={handleChange}
          >
            <MenuItem value=""><em>Aucun lien</em></MenuItem>
            {enseignants.map(e => (
              <MenuItem key={e.id} value={e.id}>{e.nom}</MenuItem>
            ))}
          </TextField>
        </>
      )}

      {form.role === 'ELEVE' && (
        <>
          <Divider><Typography variant="caption" color="text.secondary">Lier à un profil élève</Typography></Divider>
          <TextField fullWidth select label="Profil Élève (optionnel)" name="eleve"
            value={form.eleve} onChange={handleChange}>
            <MenuItem value=""><em>Aucun lien</em></MenuItem>
            {eleves.map(e => (
              <MenuItem key={e.id} value={e.id}>{e.matricule} — {e.nom} {e.prenom}</MenuItem>
            ))}
          </TextField>
        </>
      )}

      {form.role === 'PARENT' && (
        <>
          <Divider><Typography variant="caption" color="text.secondary">Enfants de ce parent</Typography></Divider>
          <Box display="flex" gap={1} mb={1}>
            <Button size="small" variant="outlined" color="primary"
              onClick={() => setForm(prev => ({ ...prev, enfants: eleves.map(e => e.id) }))}>
              Tout sélectionner ({eleves.length})
            </Button>
            {form.enfants.length > 0 && (
              <Button size="small" variant="outlined" color="error"
                onClick={() => setForm(prev => ({ ...prev, enfants: [] }))}>
                Tout désélectionner
              </Button>
            )}
          </Box>
          <FormControl fullWidth>
            <InputLabel>Sélectionner les enfants</InputLabel>
            <Select
              multiple
              value={form.enfants.map(e => (typeof e === 'object' ? e.id : e))}
              onChange={e => setForm(prev => ({ ...prev, enfants: e.target.value }))}
              input={<OutlinedInput label="Sélectionner les enfants" />}
              renderValue={(selected) => (
                <Box display="flex" flexWrap="wrap" gap={0.5}>
                  {selected.length <= 5
                    ? selected.map(id => {
                        const el = eleves.find(e => e.id === id);
                        return el ? (
                          <Chip key={id} size="small" label={`${el.prenom} ${el.nom}`} color="primary" />
                        ) : null;
                      })
                    : <Chip size="small" label={`${selected.length} enfants sélectionnés`} color="primary" />
                  }
                </Box>
              )}
            >
              {eleves.map(e => {
                const ids = form.enfants.map(x => (typeof x === 'object' ? x.id : x));
                return (
                  <MenuItem key={e.id} value={e.id}>
                    <Checkbox checked={ids.includes(e.id)} />
                    <ListItemText
                      primary={`${e.prenom} ${e.nom}`}
                      secondary={e.matricule}
                    />
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          <Typography variant="caption" color={form.enfants.length > 0 ? 'success.main' : 'text.secondary'}>
            {form.enfants.length > 0
              ? `✓ ${form.enfants.length} enfant(s) sélectionné(s)`
              : 'Aucun enfant sélectionné — ce parent ne pourra rien voir'}
          </Typography>
        </>
      )}
    </Box>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Box display="flex" alignItems="center" gap={1.5}>
          <ManageAccountsIcon color="primary" sx={{ fontSize: 32 }} />
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>Comptes Utilisateurs</Typography>
        </Box>
        <Button size="small" variant="contained" startIcon={<AddIcon />}
          onClick={() => { setForm(initForm); setError(''); setOpen(true); }}>
          Nouveau Compte
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2, bgcolor: 'info.light', color: 'info.contrastText' }}>
        <CardContent sx={{ py: 1.5 }}>
          <Typography variant="body2">
            <PersonIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
            Les comptes <strong>Administrateur</strong> se créent uniquement en ligne de commande. Cette page gère les comptes Enseignant, Élève et Parent.
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <TextField
            fullWidth placeholder="Rechercher par nom d'utilisateur, email ou rôle..."
            value={search} onChange={e => setSearch(e.target.value)}
            sx={{ mb: 3 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          />

          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table>
                <TableHead sx={{ bgcolor: 'primary.main' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'white' }}><strong>Nom d'utilisateur</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Email</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Rôle</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Profil lié</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">Aucun compte trouvé</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(u => (
                      <TableRow key={u.id} hover>
                        <TableCell><strong>{u.username}</strong></TableCell>
                        <TableCell>{u.email || '—'}</TableCell>
                        <TableCell>
                          <Chip label={getRoleLabel(u.role)} color={getRoleColor(u.role)} size="small" />
                        </TableCell>
                        <TableCell>
                          {u.role === 'PARENT' ? (
                            u.enfants_details && u.enfants_details.length > 0 ? (
                              <Box display="flex" flexWrap="wrap" gap={0.5}>
                                {u.enfants_details.map(e => (
                                  <Chip key={e.id} size="small" variant="outlined" color="warning"
                                    label={`${e.prenom} ${e.nom}`} />
                                ))}
                              </Box>
                            ) : (
                              <Chip
                                size="small" color="error" variant="outlined"
                                label="⚠ Aucun enfant lié"
                                onClick={() => handleEdit(u)}
                                title="Cliquer pour lier les enfants"
                                sx={{ cursor: 'pointer' }}
                              />
                            )
                          ) : u.enseignant_nom || u.eleve_nom ? (
                            <Chip
                              label={u.enseignant_nom || u.eleve_nom}
                              size="small" variant="outlined"
                              color={u.enseignant_nom ? 'primary' : 'success'}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">Non lié</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={u.is_active ? 'Actif' : 'Inactif'}
                            color={u.is_active ? 'success' : 'error'}
                            size="small" variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Box display="flex" gap={0.5} justifyContent="flex-end">
                            <Tooltip title="Modifier">
                              <IconButton size="small" color="primary" onClick={() => handleEdit(u)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Supprimer">
                              <IconButton size="small" color="error"
                                onClick={() => { setSelected(u); setDeleteOpen(true); }}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            {filtered.length} compte(s) non-admin
          </Typography>
        </CardContent>
      </Card>

      {/* Dialog Création */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Créer un compte utilisateur</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {formBaseFields(true)}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setOpen(false); setError(''); }} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || !form.username || !form.password}>
            {saving ? 'Création...' : 'Créer le compte'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Modification */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier le compte — {selected?.username}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {formBaseFields(false)}
          <Box mt={2}>
            <TextField
              fullWidth select label="Statut du compte" name="is_active"
              value={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'true' }))}
            >
              <MenuItem value="true">Actif</MenuItem>
              <MenuItem value="false">Désactivé</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setEditOpen(false); setError(''); }} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={saving}>
            {saving ? 'Modification...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Suppression */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Confirmer la suppression</DialogTitle>
        <DialogContent>
          <Typography>
            Supprimer le compte <strong>{selected?.username}</strong> ({getRoleLabel(selected?.role)}) ?
            Cette action est irréversible.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Supprimer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
