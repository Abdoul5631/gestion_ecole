import { useEffect, useState, useRef } from 'react';
import { eleveService, inscriptionService, classeService, userService, getResults, parametresService } from 'services/api';
import {
  Box, Card, CardContent, Typography, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper,
  Button, Chip, CircularProgress, TextField, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, MenuItem, Alert, IconButton, Tooltip, Divider, Pagination,
  LinearProgress, List, ListItem, ListItemText
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import useIsMobile from 'hooks/useIsMobile';

const MOT_DE_PASSE_DEFAUT = 'Ecole@2024';

const initForm = {
  matricule: '', nom: '', prenom: '',
  date_naissance: '', lieu_naissance: '', sexe: '',
  nom_parent: '', prenom_parent: '', telephone_parent: '',
  classeId: '',
};

export default function ListeEleves() {
  const [eleves, setEleves] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterClasse, setFilterClasse] = useState('');
  const [filterActif, setFilterActif] = useState('all');

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initForm);
  const [editInscriptionId, setEditInscriptionId] = useState(null);

  // Import Excel
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importClasseId, setImportClasseId] = useState('');
  const fileInputRef = useRef();

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [credDialog, setCredDialog] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [creatingComptes, setCreatingComptes] = useState(false);
  const [ecole, setEcole] = useState({});
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const isMobile = useIsMobile();

  const fetchData = (p = page) => {
    setLoading(true);
    let url = filterClasse ? `/eleves/?classe_id=${filterClasse}` : '/eleves/';
    url += (url.includes('?') ? '&' : '?') + `page=${p}&page_size=${PAGE_SIZE}`;
    Promise.all([eleveService.getAll(url), classeService.getAll()])
      .then(([resE, resC]) => {
        const { items, count } = getResults(resE);
        setEleves(items);
        setTotalCount(count);
        setClasses(Array.isArray(resC.data) ? resC.data : resC.data.results ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { parametresService.get().then(r => setEcole(r.data)).catch(() => {}); }, []);
  useEffect(() => { setPage(1); fetchData(1); }, [filterClasse]);
  useEffect(() => { fetchData(page); }, [page]);

  const filtered = eleves.filter(e => {
    const matchSearch = `${e.nom} ${e.prenom} ${e.matricule}`.toLowerCase().includes(search.toLowerCase());
    const matchActif = filterActif === 'all'
      || (filterActif === 'active' && e.is_active)
      || (filterActif === 'suspended' && !e.is_active);
    return matchSearch && matchActif;
  });

  const getErrorMessage = (err) => {
    const data = err.response?.data;
    if (!data) return 'Erreur inconnue';
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    return Object.entries(data)
      .map(([f, errs]) => `${f}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
      .join(' | ');
  };

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openCreate = () => {
    setForm(initForm);
    setError('');
    setOpen(true);
  };

  const openEdit = async (eleve) => {
    setSelected(eleve);
    setForm({
      matricule: eleve.matricule,
      nom: eleve.nom,
      prenom: eleve.prenom,
      date_naissance: eleve.date_naissance || '',
      lieu_naissance: eleve.lieu_naissance || '',
      sexe: eleve.sexe || '',
      nom_parent: eleve.nom_parent || '',
      prenom_parent: eleve.prenom_parent || '',
      telephone_parent: eleve.telephone_parent || '',
      classeId: '',
    });
    setEditInscriptionId(null);
    setError('');

    try {
      const res = await eleveService.getInscriptions(eleve.id);
      if (res.data.length > 0) {
        const ins = res.data[0];
        setEditInscriptionId(ins.id);
        setForm(prev => ({ ...prev, classeId: ins.classe || '' }));
      }
    } catch { /* pas d'inscription */ }

    setEditOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        matricule: form.matricule, nom: form.nom, prenom: form.prenom,
        date_naissance: form.date_naissance || null,
        lieu_naissance: form.lieu_naissance,
        sexe: form.sexe,
        nom_parent: form.nom_parent,
        prenom_parent: form.prenom_parent,
        telephone_parent: form.telephone_parent,
      };
      const eleveRes = await eleveService.create(payload);
      const eleveId = eleveRes.data.id;

      if (form.classeId) {
        await inscriptionService.create({ eleve: eleveId, classe: form.classeId });
      }

      await userService.create({
        username: form.matricule,
        password: MOT_DE_PASSE_DEFAUT,
        role: 'ELEVE',
        eleve: eleveId,
      });

      setCreatedCreds({ nom: `${form.prenom} ${form.nom}`, username: form.matricule, password: MOT_DE_PASSE_DEFAUT });
      setOpen(false);
      fetchData();
      setCredDialog(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true); setError('');
    try {
      await eleveService.update(selected.id, {
        matricule: form.matricule, nom: form.nom, prenom: form.prenom,
        date_naissance: form.date_naissance || null,
        lieu_naissance: form.lieu_naissance,
        sexe: form.sexe,
        nom_parent: form.nom_parent,
        prenom_parent: form.prenom_parent,
        telephone_parent: form.telephone_parent,
      });

      if (form.classeId) {
        if (editInscriptionId) {
          await inscriptionService.update(editInscriptionId, { eleve: selected.id, classe: form.classeId });
        } else {
          await inscriptionService.create({ eleve: selected.id, classe: form.classeId });
        }
      } else if (editInscriptionId && !form.classeId) {
        await inscriptionService.delete(editInscriptionId);
      }

      setSuccess('Élève modifié !');
      setEditOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuspend = async () => {
    try {
      await eleveService.patch(selected.id, { is_active: !selected.is_active });
      setSuccess(selected.is_active ? 'Élève suspendu.' : 'Élève réactivé !');
      setSuspendOpen(false);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Erreur lors de la modification.');
      setSuspendOpen(false);
    }
  };

  // ── Impression liste classe ────────────────
  const handlePrintListe = async () => {
    const classeInfo = classes.find(c => String(c.id) === String(filterClasse));
    const className = classeInfo?.nom_complet || classeInfo?.nom || 'Classe';
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Charger TOUS les élèves de la classe (sans pagination)
    let allEleves = filtered;
    if (filterClasse && totalCount > eleves.length) {
      try {
        const res = await eleveService.getAll(`/eleves/?classe_id=${filterClasse}&page_size=500`);
        const { items } = getResults(res);
        allEleves = items;
      } catch { /* utiliser filtered */ }
    }

    const lignes = allEleves
      .filter(e => {
        const matchActif = filterActif === 'all' || (filterActif === 'active' && e.is_active) || (filterActif === 'suspended' && !e.is_active);
        return matchActif;
      })
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .map((e, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${e.matricule}</td>
          <td style="text-align:left">${e.nom} ${e.prenom}</td>
          <td>${e.date_naissance ? new Date(e.date_naissance).toLocaleDateString('fr-FR') : '—'}</td>
          <td>${e.lieu_naissance || '—'}</td>
          <td>${e.sexe === 'M' ? 'M' : e.sexe === 'F' ? 'F' : '—'}</td>
          <td></td>
        </tr>
      `).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Liste ${className}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 15mm 12mm; color: #000; }
    .header { text-align: center; margin-bottom: 16px; }
    .header .ecole-nom { font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
    .header .ecole-sub { font-size: 11px; color: #444; margin-top: 2px; }
    .titre { text-align: center; margin: 14px 0 4px; }
    .titre h2 { font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 3px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 10px; color: #444; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1976d2; color: white; }
    thead th { padding: 6px 5px; text-align: center; font-size: 10px; border: 1px solid #1565c0; }
    tbody tr:nth-child(even) { background: #f5f8ff; }
    tbody tr td { padding: 5px 5px; border: 1px solid #ddd; text-align: center; font-size: 10px; }
    tbody tr td:nth-child(3) { text-align: left; font-weight: bold; }
    .signature-col { width: 90px; }
    .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 10px; }
    .footer-sign { text-align: center; }
    .footer-sign .label { font-weight: bold; margin-bottom: 40px; }
    @media print {
      body { padding: 10mm 8mm; }
      thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tbody tr:nth-child(even) { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${ecole.logo ? `<img src="${ecole.logo}" style="height:60px;margin-bottom:6px"><br>` : ''}
    <div class="ecole-nom">${ecole.nom_ecole || 'ÉTABLISSEMENT SCOLAIRE'}</div>
    ${ecole.slogan ? `<div class="ecole-sub">${ecole.slogan}</div>` : ''}
    ${ecole.adresse || ecole.ville ? `<div class="ecole-sub">${[ecole.adresse, ecole.ville].filter(Boolean).join(' — ')}</div>` : ''}
  </div>
  <hr style="border:1px solid #1976d2;margin-bottom:12px">

  <div class="titre"><h2>Liste des élèves — ${className}</h2></div>

  <div class="meta">
    <span>Nombre d'élèves : <strong>${allEleves.length}</strong></span>
    <span>Date d'impression : <strong>${today}</strong></span>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">N°</th>
        <th style="width:80px">Matricule</th>
        <th>Nom & Prénom</th>
        <th style="width:75px">Date naiss.</th>
        <th style="width:80px">Lieu naiss.</th>
        <th style="width:35px">Sexe</th>
        <th class="signature-col">Signature</th>
      </tr>
    </thead>
    <tbody>${lignes}</tbody>
  </table>

  <div class="footer">
    <div class="footer-sign">
      <div class="label">Le Directeur</div>
      <div>___________________</div>
    </div>
    <div class="footer-sign">
      <div class="label">Le Professeur Principal</div>
      <div>___________________</div>
    </div>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
  };

  // ── Créer comptes manquants ────────────────
  const handleCreerComptes = async () => {
    setCreatingComptes(true);
    try {
      const res = await eleveService.creerComptesManquants();
      const { created, errors: errs } = res.data;
      if (created > 0) {
        setSuccess(`${created} compte(s) créé(s) avec succès ! Mot de passe par défaut : Ecole@2024`);
        fetchData();
      } else {
        setSuccess('Tous les élèves ont déjà un compte.');
      }
      setTimeout(() => setSuccess(''), 6000);
    } catch {
      setError('Erreur lors de la création des comptes.');
    } finally {
      setCreatingComptes(false);
    }
  };

  // ── Import Excel ───────────────────────────
  const handleDownloadTemplate = async () => {
    try {
      const res = await eleveService.templateExcel();
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = 'modele_import_eleves.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Erreur lors du téléchargement du modèle.');
    }
  };

  const handleImport = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await eleveService.importExcel(file, importClasseId || null);
      setImportResult(res.data);
      fetchData();
    } catch (err) {
      setImportResult({ error: getErrorMessage(err) });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Champs communs du formulaire
  const formFields = (
    <Grid container spacing={2} sx={{ mt: 0.5 }}>
      <Grid size={12}>
        <TextField fullWidth label="Matricule *" name="matricule"
          value={form.matricule} onChange={handleChange}
          placeholder="ex: E2024001" autoFocus />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Nom *" name="nom"
          value={form.nom} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Prénom *" name="prenom"
          value={form.prenom} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField fullWidth label="Date de naissance" name="date_naissance"
          type="date" value={form.date_naissance} onChange={handleChange}
          InputLabelProps={{ shrink: true }} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField fullWidth label="Lieu de naissance" name="lieu_naissance"
          value={form.lieu_naissance} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 4 }}>
        <TextField fullWidth select label="Sexe" name="sexe"
          value={form.sexe} onChange={handleChange}>
          <MenuItem value=""><em>Non précisé</em></MenuItem>
          <MenuItem value="M">Masculin</MenuItem>
          <MenuItem value="F">Féminin</MenuItem>
        </TextField>
      </Grid>

      <Grid size={12}>
        <Divider><Typography variant="caption" color="text.secondary">Informations Parent</Typography></Divider>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Nom du parent" name="nom_parent"
          value={form.nom_parent} onChange={handleChange} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextField fullWidth label="Prénom du parent" name="prenom_parent"
          value={form.prenom_parent} onChange={handleChange} />
      </Grid>
      <Grid size={12}>
        <TextField fullWidth label="Téléphone du parent" name="telephone_parent"
          value={form.telephone_parent} onChange={handleChange}
          placeholder="ex: +221 77 123 45 67" />
      </Grid>

      <Grid size={12}>
        <Divider><Typography variant="caption" color="text.secondary">Inscription (optionnelle)</Typography></Divider>
      </Grid>
      <Grid size={12}>
        <TextField fullWidth select label="Classe" name="classeId"
          value={form.classeId} onChange={handleChange}>
          <MenuItem value=""><em>Aucune</em></MenuItem>
          {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
        </TextField>
      </Grid>
    </Grid>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} gap={1} flexWrap="wrap">
        <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Gestion des Élèves
        </Typography>
        <Box display="flex" gap={1} flexWrap="wrap">
          {/* Imprimer la liste — visible quand une classe est sélectionnée */}
          {filterClasse && (
            <Button size="small" variant="outlined" color="secondary" startIcon={<PrintIcon />}
              onClick={handlePrintListe}>
              Imprimer la liste
            </Button>
          )}
          {/* Bouton alerte si des élèves sans compte */}
          {eleves.some(e => !e.username) && (
            <Tooltip title={`${eleves.filter(e => !e.username).length} élève(s) sans compte — cliquer pour créer`}>
              <Button size="small" variant="outlined" color="warning"
                onClick={handleCreerComptes} disabled={creatingComptes}
                sx={{ borderStyle: 'dashed' }}>
                {creatingComptes ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                ⚠ Créer les comptes manquants
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Télécharger le modèle Excel">
            <Button size="small" variant="outlined" startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}>
              Modèle Excel
            </Button>
          </Tooltip>
          <Button size="small" variant="outlined" color="success" startIcon={<UploadFileIcon />}
            onClick={() => { setImportResult(null); setImportOpen(true); }}>
            Importer Excel
          </Button>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Nouvel Élève
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && !open && !editOpen && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Filtres */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth select label="Filtrer par classe" size="small"
                value={filterClasse} onChange={e => setFilterClasse(e.target.value)}>
                <MenuItem value=""><em>Toutes les classes</em></MenuItem>
                {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth select label="Statut" size="small"
                value={filterActif} onChange={e => setFilterActif(e.target.value)}>
                <MenuItem value="all">Tous</MenuItem>
                <MenuItem value="active">Actifs</MenuItem>
                <MenuItem value="suspended">Suspendus</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth placeholder="Rechercher par nom, prénom ou matricule..."
                value={search} onChange={e => setSearch(e.target.value)} size="small"
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'primary.main' }}>
                  <TableRow>
                    <TableCell sx={{ color: 'white' }}><strong>Matricule</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Nom & Prénom</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Naissance</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Sexe</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Classe</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Parent</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Tél.</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Statut</strong></TableCell>
                    <TableCell sx={{ color: 'white' }}><strong>Compte</strong></TableCell>
                    <TableCell align="right" sx={{ color: 'white' }}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center">Aucun élève trouvé</TableCell>
                    </TableRow>
                  ) : filtered.map(eleve => (
                    <TableRow key={eleve.id} hover
                      sx={{ opacity: eleve.is_active ? 1 : 0.6, bgcolor: eleve.is_active ? 'inherit' : '#fff8e1' }}>
                      <TableCell><strong>{eleve.matricule}</strong></TableCell>
                      <TableCell>{eleve.prenom} {eleve.nom}</TableCell>
                      <TableCell>
                        {eleve.date_naissance
                          ? new Date(eleve.date_naissance).toLocaleDateString('fr-FR')
                          : <em style={{ color: '#aaa' }}>—</em>}
                      </TableCell>
                      <TableCell>
                        {eleve.sexe
                          ? <Chip label={eleve.sexe === 'M' ? 'Garçon' : 'Fille'}
                              color={eleve.sexe === 'M' ? 'info' : 'secondary'} size="small" />
                          : <em style={{ color: '#aaa' }}>—</em>}
                      </TableCell>
                      <TableCell>
                        {eleve.classe_actuelle
                          ? <Chip label={eleve.classe_actuelle} color="primary" size="small" />
                          : <Typography variant="body2" color="text.secondary">Non inscrit</Typography>}
                      </TableCell>
                      <TableCell>
                        {eleve.nom_parent
                          ? `${eleve.prenom_parent} ${eleve.nom_parent}`.trim()
                          : <em style={{ color: '#aaa' }}>—</em>}
                      </TableCell>
                      <TableCell>{eleve.telephone_parent || <em style={{ color: '#aaa' }}>—</em>}</TableCell>
                      <TableCell>
                        {eleve.is_active
                          ? <Chip label="Actif" color="success" size="small" />
                          : <Chip label="Suspendu" color="warning" size="small" />}
                      </TableCell>
                      <TableCell>
                        {eleve.username
                          ? <Chip label={eleve.username} size="small" color="success" variant="outlined" />
                          : <Typography variant="caption" color="error">Pas de compte</Typography>}
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" gap={0.5} justifyContent="flex-end">
                          <Tooltip title="Modifier">
                            <IconButton size="small" color="primary" onClick={() => openEdit(eleve)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={eleve.is_active ? 'Suspendre' : 'Réactiver'}>
                            <IconButton size="small"
                              color={eleve.is_active ? 'warning' : 'success'}
                              onClick={() => { setSelected(eleve); setSuspendOpen(true); }}>
                              {eleve.is_active ? <PauseCircleIcon fontSize="small" /> : <PlayCircleIcon fontSize="small" />}
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
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={2} flexWrap="wrap" gap={1}>
            <Typography variant="caption" color="text.secondary">
              {totalCount} élève(s) au total — page {page} / {Math.ceil(totalCount / PAGE_SIZE) || 1}
            </Typography>
            {totalCount > PAGE_SIZE && (
              <Pagination count={Math.ceil(totalCount / PAGE_SIZE)} page={page}
                onChange={(_, v) => setPage(v)} color="primary" size="small" />
            )}
          </Box>
        </CardContent>
      </Card>

      {/* ── Dialog Ajout ── */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Nouvel Élève</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          {formFields}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleCreate}
            disabled={saving || !form.matricule || !form.nom || !form.prenom}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Modification ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Modifier : {selected?.prenom} {selected?.nom}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          {formFields}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" onClick={handleUpdate}
            disabled={saving || !form.matricule || !form.nom || !form.prenom}>
            {saving ? 'Modification...' : 'Modifier'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Import Excel ── */}
      <Dialog open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); setImportClasseId(''); }}
        maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle>Importer des élèves depuis Excel</DialogTitle>
        <DialogContent>

          {/* Étape 1 : choisir la classe */}
          <Box sx={{ mb: 2, mt: 1, p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '1px solid', borderColor: 'primary.200' }}>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
              Étape 1 — Choisir la classe (recommandé)
            </Typography>
            <TextField
              select fullWidth size="small"
              label="Classe de destination"
              value={importClasseId}
              onChange={e => setImportClasseId(e.target.value)}
            >
              <MenuItem value=""><em>Sans classe (créer seulement les élèves)</em></MenuItem>
              {classes.map(c => <MenuItem key={c.id} value={c.id}>{c.nom_complet}</MenuItem>)}
            </TextField>
            {importClasseId && (
              <Typography variant="caption" color="success.main" sx={{ mt: 0.5, display: 'block' }}>
                ✓ Les élèves importés seront automatiquement inscrits dans cette classe
              </Typography>
            )}
          </Box>

          {/* Étape 2 : télécharger le modèle */}
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight="bold" mb={1}>
              Étape 2 — Télécharger et remplir le modèle
            </Typography>
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}>
              Télécharger le modèle Excel
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Colonnes : matricule, nom, prenom, date_naissance (JJ/MM/AAAA), lieu_naissance, sexe (M/F), nom_parent, prenom_parent, telephone_parent
            </Typography>
          </Box>

          {/* Étape 3 : uploader le fichier */}
          <Typography variant="subtitle2" fontWeight="bold" mb={1}>
            Étape 3 — Importer le fichier rempli
          </Typography>
          <Box
            sx={{
              border: '2px dashed', borderColor: importing ? 'warning.main' : 'primary.main',
              borderRadius: 2, p: 3, textAlign: 'center', cursor: importing ? 'not-allowed' : 'pointer',
              bgcolor: importing ? 'warning.50' : 'primary.50',
              '&:hover': { bgcolor: importing ? 'warning.50' : 'primary.100' }
            }}
            onClick={() => !importing && fileInputRef.current?.click()}
          >
            <UploadFileIcon sx={{ fontSize: 48, color: importing ? 'warning.main' : 'primary.main', mb: 1 }} />
            <Typography variant="body1" fontWeight="medium">
              {importing ? 'Import en cours...' : 'Cliquer pour sélectionner le fichier Excel'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Formats : .xlsx, .xls
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleImport(e.target.files[0])}
            />
          </Box>

          {importing && <LinearProgress sx={{ mt: 1 }} />}

          {/* Résultats */}
          {importResult && !importResult.error && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={importResult.errors?.length > 0 ? 'warning' : 'success'}>
                <strong>{importResult.created}</strong> élève(s) créé(s) &nbsp;·&nbsp;
                <strong>{importResult.updated}</strong> mis à jour
                {importResult.inscrits > 0 && <> &nbsp;·&nbsp; <strong>{importResult.inscrits}</strong> inscrit(s) dans la classe</>}
                {importResult.errors?.length > 0 && <> &nbsp;·&nbsp; <strong style={{ color: 'red' }}>{importResult.errors.length}</strong> erreur(s)</>}
              </Alert>
              {importResult.errors?.length > 0 && (
                <Box sx={{ mt: 1, maxHeight: 180, overflowY: 'auto', border: '1px solid', borderColor: 'error.light', borderRadius: 1 }}>
                  <List dense disablePadding>
                    {importResult.errors.map((e, i) => (
                      <ListItem key={i} divider>
                        <ListItemText
                          primary={`Ligne ${e.ligne}${e.matricule ? ` — ${e.matricule}` : ''}`}
                          secondary={e.erreur}
                          primaryTypographyProps={{ color: 'error.main', variant: 'caption', fontWeight: 'bold' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </Box>
          )}

          {importResult?.error && (
            <Alert severity="error" sx={{ mt: 2 }}>{importResult.error}</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => { setImportOpen(false); setImportResult(null); setImportClasseId(''); }}
            variant="contained">
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Suspendre / Réactiver ── */}
      <Dialog open={suspendOpen} onClose={() => setSuspendOpen(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>{selected?.is_active ? "Suspendre l'élève" : "Réactiver l'élève"}</DialogTitle>
        <DialogContent>
          {selected?.is_active ? (
            <>
              <Typography>Suspendre <strong>{selected?.prenom} {selected?.nom}</strong> ?</Typography>
              <Alert severity="warning" sx={{ mt: 2 }}>
                L'élève ne pourra plus se connecter. Son inscription et ses notes restent conservées.
              </Alert>
            </>
          ) : (
            <Typography>Réactiver <strong>{selected?.prenom} {selected?.nom}</strong> ?</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setSuspendOpen(false)} color="inherit">Annuler</Button>
          <Button variant="contained" color={selected?.is_active ? 'warning' : 'success'}
            onClick={handleToggleSuspend}>
            {selected?.is_active ? 'Suspendre' : 'Réactiver'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Dialog Identifiants créés ── */}
      <Dialog open={credDialog} onClose={() => setCredDialog(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle>Compte élève créé</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            <strong>{createdCreds?.nom}</strong> a été ajouté avec un compte d'accès.
          </Alert>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Identifiants à transmettre à l'élève :
          </Typography>
          <Box sx={{ bgcolor: 'grey.100', borderRadius: 2, p: 2, mt: 1 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="caption" color="text.secondary">Identifiant</Typography>
                <Typography fontWeight="bold" fontFamily="monospace">{createdCreds?.username}</Typography>
              </Box>
              <Tooltip title="Copier">
                <IconButton size="small" onClick={() => navigator.clipboard.writeText(createdCreds?.username)}>
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
                <IconButton size="small" onClick={() => navigator.clipboard.writeText(createdCreds?.password)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
            L'élève peut modifier son mot de passe une fois connecté.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button variant="contained" onClick={() => setCredDialog(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
