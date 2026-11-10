import { useEffect, useState } from 'react';
import {
  niveauService, classeService, matiereService, anneeService, tarifService
} from 'services/api';
import {
  Box, Card, CardContent, Typography, TextField, Button, Grid, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
  Chip, CircularProgress, MenuItem, FormControlLabel, Checkbox
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';

const asList = (res) => (Array.isArray(res.data) ? res.data : (res.data?.results || []));
const fmt = (n) => `${Number(n || 0).toLocaleString('fr-FR')} F`;
const SUSPENDUS = '?inclure_suspendus=1';
const filtreStatut = (items, filtre) => items.filter((x) => {
  if (filtre === 'actifs') return x.is_active !== false;
  if (filtre === 'suspendus') return x.is_active === false;
  return true;
});

function useFlash() {
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const ok = (msg) => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 3500); };
  const ko = (err, fallback) => {
    const d = err?.response?.data;
    setError(d?.detail || (typeof d === 'string' ? d : fallback));
  };
  return { success, error, setError, ok, ko, alerts: (
    <>
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
    </>
  ) };
}

export function AnneePanel() {
  const { success, error, ok, ko, alerts } = useFlash();
  const [annees, setAnnees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [libelle, setLibelle] = useState('');
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const load = () => {
    setLoading(true);
    anneeService.getAll()
      .then((res) => setAnnees(asList(res)))
      .catch((e) => ko(e, 'Impossible de charger les années.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    try {
      if (selected) await anneeService.update(selected.id, { libelle, is_active: selected.is_active });
      else await anneeService.create({ libelle, is_active: true });
      setOpen(false);
      ok(selected ? 'Année scolaire modifiée.' : 'Année scolaire créée.');
      load();
    } catch (e) { ko(e, 'Enregistrement impossible (libellé déjà utilisé ?).'); }
  };

  const toggle = async (a) => {
    try {
      await anneeService.patch(a.id, { is_active: !a.is_active });
      ok(a.is_active ? 'Année désactivée (plus l’année en cours).' : 'Année définie comme année en cours.');
      load();
    } catch (e) { ko(e, 'Modification impossible.'); }
  };

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Typography variant="h6" fontWeight="bold">Année scolaire</Typography>
          <Button size="small" variant="contained" startIcon={<AddIcon />}
            onClick={() => { setSelected(null); setLibelle(''); setOpen(true); }}>
            Nouvelle année
          </Button>
        </Box>
        {alerts}
        {loading ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: 'grey.100' }}>
                <TableRow>
                  <TableCell><strong>Libellé</strong></TableCell>
                  <TableCell><strong>Statut</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {annees.length === 0 ? (
                  <TableRow><TableCell colSpan={3}>Aucune année. Créez-en une (ex. 2025-2026).</TableCell></TableRow>
                ) : annees.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell><strong>{a.libelle}</strong></TableCell>
                    <TableCell>
                      <Chip size="small" label={a.is_active ? 'En cours' : 'Ancienne'}
                        color={a.is_active ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Modifier">
                        <IconButton size="small" color="primary"
                          onClick={() => { setSelected(a); setLibelle(a.libelle); setOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={a.is_active ? 'Ce n’est plus l’année en cours' : 'Définir comme année en cours'}>
                        <IconButton size="small" color={a.is_active ? 'warning' : 'success'} onClick={() => toggle(a)}>
                          {a.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected ? 'Modifier' : 'Nouvelle'} année scolaire</DialogTitle>
        <DialogContent>
          <TextField fullWidth sx={{ mt: 1 }} label="Libellé (ex. 2025-2026)" value={libelle}
            onChange={(e) => setLibelle(e.target.value)} autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={save} disabled={!libelle.trim()}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export function NiveauxPanel() {
  const { ok, ko, alerts } = useFlash();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [nom, setNom] = useState('');
  const [examen, setExamen] = useState(false);
  const [filtre, setFiltre] = useState('tous');

  const load = () => {
    setLoading(true);
    niveauService.getAll(SUSPENDUS)
      .then((res) => setItems(asList(res)))
      .catch((e) => ko(e, 'Impossible de charger les niveaux.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    try {
      const payload = { nom: nom.trim(), is_classe_examen: examen, is_active: selected?.is_active ?? true };
      if (selected) await niveauService.update(selected.id, payload);
      else await niveauService.create(payload);
      setOpen(false);
      ok(selected ? 'Niveau modifié.' : 'Niveau ajouté.');
      load();
    } catch (e) { ko(e, 'Enregistrement impossible (nom déjà utilisé ?).'); }
  };

  const toggle = async () => {
    try {
      if (selected.is_active) {
        const nb = selected.nb_eleves || 0;
        if (nb > 0 && !window.confirm('Ces élèves restent inscrits cette année. Suspendre quand même ?')) return;
        await niveauService.delete(selected.id);
        ok('Niveau suspendu.');
      } else {
        await niveauService.reactiver(selected.id);
        ok('Niveau réactivé.');
      }
      setDelOpen(false);
      load();
    } catch (e) { ko(e, 'Action impossible.'); setDelOpen(false); }
  };
  const visibles = filtreStatut(items, filtre);

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Typography variant="h6" fontWeight="bold">Niveaux</Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <TextField select size="small" label="Afficher" value={filtre} onChange={(e) => setFiltre(e.target.value)} sx={{ minWidth: 130 }}>
              <MenuItem value="actifs">Actifs</MenuItem>
              <MenuItem value="suspendus">Suspendus</MenuItem>
              <MenuItem value="tous">Tous</MenuItem>
            </TextField>
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              onClick={() => { setSelected(null); setNom(''); setExamen(false); setOpen(true); }}>
              Ajouter
            </Button>
          </Box>
        </Box>
        {alerts}
        {loading ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: 'grey.100' }}>
                <TableRow>
                  <TableCell><strong>Nom</strong></TableCell>
                  <TableCell><strong>Classes</strong></TableCell>
                  <TableCell><strong>Élèves</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.length === 0 ? (
                  <TableRow><TableCell colSpan={4}>Aucun niveau. Ajoutez 6ème, 5ème…</TableCell></TableRow>
                ) : visibles.map((n) => (
                  <TableRow key={n.id} hover>
                    <TableCell>
                      <strong>{n.nom}</strong>
                      {n.is_classe_examen && <Chip size="small" label="Examen" color="info" sx={{ ml: 1 }} />}
                      {!n.is_active && <Chip size="small" label="Suspendu" color="warning" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{n.nb_classes ?? '—'}</TableCell>
                    <TableCell>{n.nb_eleves ?? '—'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Modifier">
                        <IconButton size="small" color="primary"
                          onClick={() => { setSelected(n); setNom(n.nom); setExamen(!!n.is_classe_examen); setOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={n.is_active ? 'Suspendre' : 'Réactiver'}>
                        <IconButton size="small" color={n.is_active ? 'warning' : 'success'}
                          onClick={() => { setSelected(n); setDelOpen(true); }}>
                          {n.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected ? 'Modifier' : 'Nouveau'} niveau</DialogTitle>
        <DialogContent>
          <TextField fullWidth sx={{ mt: 1 }} label="Nom (ex. 6ème)" value={nom}
            onChange={(e) => setNom(e.target.value)} autoFocus />
          <FormControlLabel sx={{ mt: 1 }}
            control={<Checkbox checked={examen} onChange={(e) => setExamen(e.target.checked)} />}
            label="Classe d'examen (BEPC / BAC)" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={save} disabled={!nom.trim()}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected?.is_active ? 'Suspendre le niveau' : 'Réactiver le niveau'}</DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>Suspendre le niveau <strong>{selected?.nom}</strong> ?</Typography>
              {(selected?.nb_eleves || 0) > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {selected.nb_eleves} élève(s) restent inscrits cette année. Les notes et l’historique sont conservés.
                </Alert>
              )}
            </>
          ) : (
            <Typography>Réactiver le niveau <strong>{selected?.nom}</strong> ?</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Annuler</Button>
          <Button color={selected?.is_active ? 'warning' : 'success'} variant="contained" onClick={toggle}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export function ClassesPanel() {
  const { ok, ko, alerts } = useFlash();
  const [classes, setClasses] = useState([]);
  const [niveaux, setNiveaux] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ nom: '', niveau: '' });
  const [filtre, setFiltre] = useState('tous');

  const load = async () => {
    setLoading(true);
    try {
      const [c, n] = await Promise.all([classeService.getAll(SUSPENDUS), niveauService.getAll(SUSPENDUS)]);
      setClasses(asList(c));
      setNiveaux(asList(n));
    } catch (e) { ko(e, 'Impossible de charger les classes.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { nom: form.nom.trim(), niveau: form.niveau, is_active: selected?.is_active ?? true };
      if (selected) await classeService.update(selected.id, payload);
      else await classeService.create(payload);
      setOpen(false);
      ok(selected ? 'Classe modifiée.' : 'Classe ajoutée.');
      load();
    } catch (e) { ko(e, 'Enregistrement impossible (classe déjà existante ?).'); }
  };

  const toggle = async () => {
    try {
      if (selected.is_active) {
        const nb = selected.nb_eleves || 0;
        if (nb > 0 && !window.confirm('Ces élèves restent inscrits cette année. Suspendre quand même ?')) return;
        await classeService.delete(selected.id);
        ok('Classe suspendue.');
      } else {
        await classeService.reactiver(selected.id);
        ok('Classe réactivée.');
      }
      setDelOpen(false);
      load();
    } catch (e) { ko(e, 'Action impossible.'); setDelOpen(false); }
  };
  const visibles = filtreStatut(classes, filtre);

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Typography variant="h6" fontWeight="bold">Classes</Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <TextField select size="small" label="Afficher" value={filtre} onChange={(e) => setFiltre(e.target.value)} sx={{ minWidth: 130 }}>
              <MenuItem value="actifs">Actives</MenuItem>
              <MenuItem value="suspendus">Suspendues</MenuItem>
              <MenuItem value="tous">Toutes</MenuItem>
            </TextField>
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              disabled={!niveaux.length}
              onClick={() => { setSelected(null); setForm({ nom: '', niveau: niveaux[0]?.id || '' }); setOpen(true); }}>
              Ajouter
            </Button>
          </Box>
        </Box>
        {alerts}
        {!niveaux.length && <Alert severity="info" sx={{ mb: 2 }}>Créez d&apos;abord un niveau (onglet Niveaux).</Alert>}
        {loading ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: 'grey.100' }}>
                <TableRow>
                  <TableCell><strong>Classe</strong></TableCell>
                  <TableCell><strong>Niveau</strong></TableCell>
                  <TableCell><strong>Élèves</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.length === 0 ? (
                  <TableRow><TableCell colSpan={4}>Aucune classe. Ex. 6ème A, 6ème B.</TableCell></TableRow>
                ) : visibles.map((c) => (
                  <TableRow key={c.id} hover sx={{ opacity: c.is_active ? 1 : 0.7 }}>
                    <TableCell>
                      <strong>{c.nom}</strong>
                      {!c.is_active && <Chip size="small" label="Suspendue" color="warning" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{c.niveau_nom}</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${c.nb_eleves || 0} élève(s)`}
                        color={c.nb_eleves ? 'primary' : 'default'} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Modifier">
                        <IconButton size="small" color="primary"
                          onClick={() => { setSelected(c); setForm({ nom: c.nom, niveau: c.niveau }); setOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={c.is_active ? 'Suspendre' : 'Réactiver'}>
                        <IconButton size="small" color={c.is_active ? 'warning' : 'success'}
                          onClick={() => { setSelected(c); setDelOpen(true); }}>
                          {c.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected ? 'Modifier' : 'Nouvelle'} classe</DialogTitle>
        <DialogContent>
          <TextField select fullWidth sx={{ mt: 1, mb: 2 }} label="Niveau" value={form.niveau}
            onChange={(e) => setForm({ ...form, niveau: e.target.value })}>
            {niveaux.map((n) => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
          </TextField>
          <TextField fullWidth label="Nom (ex. 6ème A)" value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={save} disabled={!form.nom.trim() || !form.niveau}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected?.is_active ? 'Suspendre la classe' : 'Réactiver la classe'}</DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>Suspendre la classe <strong>{selected?.nom}</strong> ?</Typography>
              {(selected?.nb_eleves || 0) > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {selected.nb_eleves} élève(s) restent inscrits cette année. L’historique (notes, inscriptions) est conservé.
                </Alert>
              )}
            </>
          ) : (
            <Typography>Réactiver la classe <strong>{selected?.nom}</strong> ?</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Annuler</Button>
          <Button color={selected?.is_active ? 'warning' : 'success'} variant="contained" onClick={toggle}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export function MatieresPanel() {
  const { ok, ko, alerts } = useFlash();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ nom: '', type: 'SCIENTIFIQUE' });
  const [filtre, setFiltre] = useState('tous');

  const load = () => {
    setLoading(true);
    matiereService.getAll(SUSPENDUS)
      .then((res) => setItems(asList(res)))
      .catch((e) => ko(e, 'Impossible de charger les matières.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    try {
      const payload = { nom: form.nom.trim(), type: form.type };
      if (selected) await matiereService.update(selected.id, payload);
      else await matiereService.create(payload);
      setOpen(false);
      ok(selected ? 'Matière modifiée.' : 'Matière ajoutée.');
      load();
    } catch (e) { ko(e, 'Enregistrement impossible (nom déjà utilisé ?).'); }
  };

  const toggle = async () => {
    try {
      if (selected.is_active !== false) {
        await matiereService.delete(selected.id);
        ok('Matière suspendue. Les notes restent dans l’historique.');
      } else {
        await matiereService.reactiver(selected.id);
        ok('Matière réactivée.');
      }
      setDelOpen(false);
      load();
    } catch (e) { ko(e, 'Action impossible.'); setDelOpen(false); }
  };
  const visibles = filtreStatut(items, filtre);

  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
          <Typography variant="h6" fontWeight="bold">Matières</Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <TextField select size="small" label="Afficher" value={filtre} onChange={(e) => setFiltre(e.target.value)} sx={{ minWidth: 130 }}>
              <MenuItem value="actifs">Actives</MenuItem>
              <MenuItem value="suspendus">Suspendues</MenuItem>
              <MenuItem value="tous">Toutes</MenuItem>
            </TextField>
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              onClick={() => { setSelected(null); setForm({ nom: '', type: 'SCIENTIFIQUE' }); setOpen(true); }}>
              Ajouter
            </Button>
          </Box>
        </Box>
        {alerts}
        {loading ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: 'grey.100' }}>
                <TableRow>
                  <TableCell><strong>Nom</strong></TableCell>
                  <TableCell><strong>Type</strong></TableCell>
                  <TableCell><strong>Affectations</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.length === 0 ? (
                  <TableRow><TableCell colSpan={4}>Aucune matière. Ajoutez Mathématiques, Français…</TableCell></TableRow>
                ) : visibles.map((m) => (
                  <TableRow key={m.id} hover sx={{ opacity: m.is_active === false ? 0.7 : 1 }}>
                    <TableCell>
                      <strong>{m.nom}</strong>
                      {m.is_active === false && <Chip size="small" label="Suspendue" color="warning" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell>{m.nb_affectations ?? '—'}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Modifier">
                        <IconButton size="small" color="primary"
                          onClick={() => { setSelected(m); setForm({ nom: m.nom, type: m.type }); setOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={m.is_active === false ? 'Réactiver' : 'Suspendre'}>
                        <IconButton size="small" color={m.is_active === false ? 'success' : 'warning'}
                          onClick={() => { setSelected(m); setDelOpen(true); }}>
                          {m.is_active === false ? <PlayCircleIcon fontSize="small" /> : <PauseCircleIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected ? 'Modifier' : 'Nouvelle'} matière</DialogTitle>
        <DialogContent>
          <TextField fullWidth sx={{ mt: 1, mb: 2 }} label="Nom" value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })} autoFocus />
          <TextField select fullWidth label="Type" value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <MenuItem value="SCIENTIFIQUE">Scientifique</MenuItem>
            <MenuItem value="LITTERATURE">Littérature</MenuItem>
            <MenuItem value="AUTRES">Autres</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={save} disabled={!form.nom.trim()}>Enregistrer</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{selected?.is_active === false ? 'Réactiver la matière' : 'Suspendre la matière'}</DialogTitle>
        <DialogContent>
          <Typography>
            {selected?.is_active === false ? 'Réactiver' : 'Suspendre'} <strong>{selected?.nom}</strong> ?
          </Typography>
          {selected?.is_active !== false && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Les notes déjà saisies restent dans l’historique.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Annuler</Button>
          <Button color={selected?.is_active === false ? 'success' : 'warning'} variant="contained" onClick={toggle}>
            {selected?.is_active === false ? 'Réactiver' : 'Suspendre'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export function FraisPanel() {
  const { ok, ko, alerts } = useFlash();
  const [niveaux, setNiveaux] = useState([]);
  const [tarifs, setTarifs] = useState([]);
  const [annee, setAnnee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ niveau: '', tranche1: '', tranche2: '', tranche3: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, n, t] = await Promise.all([
        anneeService.getActive().catch(() => ({ data: null })),
        niveauService.getAll(),
        tarifService.getAll(SUSPENDUS),
      ]);
      setAnnee(a.data);
      setNiveaux(asList(n));
      setTarifs(asList(t));
    } catch (e) { ko(e, 'Impossible de charger les grilles de frais.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!annee?.id) {
      ko({}, 'Créez d’abord une année scolaire (onglet Année).');
      return;
    }
    const payload = {
      niveau: form.niveau,
      annee_scolaire: annee.id,
      tranche1: Number(form.tranche1 || 0),
      tranche2: Number(form.tranche2 || 0),
      tranche3: Number(form.tranche3 || 0),
    };
    try {
      if (editing) await tarifService.update(editing.id, payload);
      else await tarifService.create(payload);
      setForm({ niveau: '', tranche1: '', tranche2: '', tranche3: '' });
      setEditing(null);
      ok('Grille de frais enregistrée.');
      load();
    } catch (e) { ko(e, 'Enregistrement impossible (niveau déjà tarifé ?).'); }
  };

  const toggleTarif = async (t) => {
    const actif = t.is_active !== false;
    if (actif && !window.confirm(`Suspendre la grille de ${t.niveau_nom} ? Les paiements déjà faits restent.`)) return;
    try {
      if (actif) {
        await tarifService.delete(t.id);
        ok('Grille suspendue.');
      } else {
        await tarifService.reactiver(t.id);
        ok('Grille réactivée.');
      }
      load();
    } catch (e) { ko(e, 'Action impossible.'); }
  };

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 5 }}>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" mb={1}>
              {editing ? 'Modifier' : 'Nouvelle'} grille
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Année {annee?.libelle || '—'} · montants en FCFA (3 tranches).
            </Typography>
            {alerts}
            <Box display="flex" flexDirection="column" gap={2}>
              <TextField select label="Niveau" value={form.niveau}
                onChange={(e) => setForm({ ...form, niveau: e.target.value })}>
                {niveaux.map((n) => <MenuItem key={n.id} value={n.id}>{n.nom}</MenuItem>)}
              </TextField>
              {['tranche1', 'tranche2', 'tranche3'].map((k, i) => (
                <TextField key={k} type="number" label={`${i + 1}e tranche (F)`}
                  value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              ))}
              <Button variant="contained" onClick={save} disabled={!form.niveau || !annee}>
                Enregistrer
              </Button>
              {editing && (
                <Button onClick={() => { setEditing(null); setForm({ niveau: '', tranche1: '', tranche2: '', tranche3: '' }); }}>
                  Annuler la modification
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 7 }}>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            {loading ? <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box> : (
              <TableContainer>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'grey.100' }}>
                    <TableRow>
                      <TableCell><strong>Niveau</strong></TableCell>
                      <TableCell align="right">T1</TableCell>
                      <TableCell align="right">T2</TableCell>
                      <TableCell align="right">T3</TableCell>
                      <TableCell align="right"><strong>Total</strong></TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tarifs.length === 0 ? (
                      <TableRow><TableCell colSpan={6}>Aucune grille. Saisissez les frais par niveau.</TableCell></TableRow>
                    ) : tarifs.map((t) => (
                      <TableRow key={t.id} hover sx={{ opacity: t.is_active === false ? 0.7 : 1 }}>
                        <TableCell>
                          <strong>{t.niveau_nom}</strong>
                          {t.is_active === false && <Chip size="small" label="Suspendue" color="warning" sx={{ ml: 1 }} />}
                        </TableCell>
                        <TableCell align="right">{fmt(t.tranche1)}</TableCell>
                        <TableCell align="right">{fmt(t.tranche2)}</TableCell>
                        <TableCell align="right">{fmt(t.tranche3)}</TableCell>
                        <TableCell align="right"><strong>{fmt(t.montant_total)}</strong></TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => {
                            setEditing(t);
                            setForm({
                              niveau: t.niveau, tranche1: t.tranche1, tranche2: t.tranche2, tranche3: t.tranche3,
                            });
                          }}>Modifier</Button>
                          <Tooltip title={t.is_active === false ? 'Réactiver' : 'Suspendre'}>
                            <IconButton size="small" color={t.is_active === false ? 'success' : 'warning'}
                              onClick={() => toggleTarif(t)}>
                              {t.is_active === false ? <PlayCircleIcon fontSize="small" /> : <PauseCircleIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

export default function ParametresStructure({ section }) {
  if (section === 'annee') return <AnneePanel />;
  if (section === 'niveaux') return <NiveauxPanel />;
  if (section === 'classes') return <ClassesPanel />;
  if (section === 'matieres') return <MatieresPanel />;
  if (section === 'frais') return <FraisPanel />;
  return null;
}
